import * as fs from "node:fs/promises";
import * as path from "node:path";
import { globby } from "globby";
import { minimatch } from "minimatch";
import * as semver from "semver";
import { PackageJson } from "../core/packageJson";
import chalk from "chalk";

export type BundleType = "esm" | "cjs";
export type PackageType = "module" | "commonjs";

interface GetOutExtensionOptions {
  isType?: boolean;
  isFlat?: boolean;
  packageType?: PackageType;
}

export function getOutExtension(
  bundle: BundleType,
  options: GetOutExtensionOptions = {},
) {
  const { isType = false, isFlat = false, packageType = "commonjs" } = options;
  const normalizedPackageType: PackageType =
    packageType === "module" ? "module" : "commonjs";

  if (!isFlat) {
    return isType ? ".d.ts" : ".js";
  }

  if (isType) {
    if (normalizedPackageType === "module") {
      return bundle === "esm" ? ".d.ts" : ".d.cts";
    }
    return bundle === "cjs" ? ".d.ts" : ".d.mts";
  }

  if (normalizedPackageType === "module") {
    return bundle === "esm" ? ".js" : ".cjs";
  }

  return bundle === "cjs" ? ".js" : ".mjs";
}

interface CreateExportsFor {
  importPath: NonNullable<PackageJson.Exports>;
  key: string;
  cwd: string;
  dir: string;
  type: string;
  newExports: PackageJson.ExportConditions;
  typeOutExtension: string;
  outExtension: string;
  addTypes: boolean;
}

async function createExportsFor({
  importPath,
  key,
  cwd,
  dir,
  type,
  newExports,
  typeOutExtension,
  outExtension,
  addTypes,
}: CreateExportsFor): Promise<void> {
  if (Array.isArray(importPath)) {
    throw new Error(
      `Array form of package.json exports is not supported yet. Found in export "${key}".`,
    );
  }

  let srcPath =
    typeof importPath === "string" ? importPath : importPath["sse-src"];
  const rest = typeof importPath === "string" ? {} : { ...importPath };
  delete rest["sse-src"];

  if (typeof srcPath !== "string") {
    throw new Error(
      `Unsupported export for "${key}". Only a string or an object with "sse-src" field is supported for now.`,
    );
  }

  const exportFileExists = srcPath.includes("*")
    ? true
    : await fs.stat(path.join(cwd, srcPath)).then(
        (stats) => stats.isFile() || stats.isDirectory(),
        () => false,
      );

  if (!exportFileExists) {
    throw new Error(
      `The import path "${srcPath}" for export "${key}" does not exist in the package. Either remove the export or add the file/folder to the package.`,
    );
  }

  srcPath = srcPath.replace(/\.\/src\//, `./${dir === "." ? "" : `${dir}/`}`);
  const ext = path.extname(srcPath);

  if (ext === ".css") {
    newExports[key] = srcPath;
    return;
  }

  if (typeof newExports[key] === "string" || Array.isArray(newExports[key])) {
    throw new Error(
      `The export "${key}" is already defined as a string or Array.`,
    );
  }

  newExports[key] ??= {};
  const exportPath = srcPath.replace(ext, outExtension);
  newExports[key][type === "cjs" ? "require" : "import"] = addTypes
    ? {
        ...rest,
        types: srcPath.replace(ext, typeOutExtension),
        default: exportPath,
      }
    : Object.keys(rest).length
      ? {
          ...rest,
          default: exportPath,
        }
      : exportPath;
}

interface GlobEntry {
  value: PackageJson.Exports;
  srcPattern: string;
  srcPrefix: string;
  srcSuffix: string;
  keyPrefix: string;
  keySuffix: string;
}

/**
 * Expands glob patterns (containing `*`) in package.json export keys/values
 * into concrete entries by resolving them against actual files on disk.
 */
async function expandExportGlobs(
  originalExports: PackageJson.ExportConditions,
  cwd: string,
) {
  const expandedExports: PackageJson.ExportConditions = {};
  const globEntries: GlobEntry[] = [];
  const negationPatterns: string[] = [];

  for (const [key, value] of Object.entries(originalExports)) {
    if (value === null) {
      if (key.includes("*")) {
        negationPatterns.push(key);
      } else {
        delete expandedExports[key];
      }
      continue;
    }

    if (!key.includes("*")) {
      expandedExports[key] = value;
      continue;
    }

    // Extract the source pattern from the value
    let srcPattern: string | undefined;
    if (typeof value === "string") {
      srcPattern = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      srcPattern = value["sse-src"] as string | undefined;
    }

    if (typeof srcPattern !== "string" || !srcPattern.includes("*")) {
      expandedExports[key] = value;
      continue;
    }

    // Split patterns around the * wildcard
    const srcStarIndex = srcPattern.indexOf("*");
    const srcPrefix = srcPattern.substring(0, srcStarIndex);
    const srcSuffix = srcPattern.substring(srcStarIndex + 1);

    const keyStarIndex = key.indexOf("*");
    const keyPrefix = key.substring(0, keyStarIndex);
    const keySuffix = key.substring(keyStarIndex + 1);

    globEntries.push({
      value,
      srcPattern,
      srcPrefix,
      srcSuffix,
      keyPrefix,
      keySuffix,
    });
  }

  // Resolve all globby calls in parallel
  const globResults = await Promise.all(
    globEntries.map(({ srcPattern }) => globby(srcPattern, { cwd })),
  );

  for (let i = 0; i < globEntries.length; i += 1) {
    const { value, srcPrefix, srcSuffix, keyPrefix, keySuffix } =
      globEntries[i];
    const matches = globResults[i];

    const stems = [];
    for (const match of matches) {
      if (match.startsWith(srcPrefix) && match.endsWith(srcSuffix)) {
        const stem =
          srcSuffix.length > 0
            ? match.substring(srcPrefix.length, match.length - srcSuffix.length)
            : match.substring(srcPrefix.length);
        if (stem.length > 0) {
          stems.push(stem);
        }
      }
    }

    stems.sort();

    for (const stem of stems) {
      const expandedKey = `${keyPrefix}${stem}${keySuffix}`;
      const expandedSrcPath = `${srcPrefix}${stem}${srcSuffix}`;

      if (typeof value === "string") {
        expandedExports[expandedKey] = expandedSrcPath;
      } else {
        expandedExports[expandedKey] = {
          ...value,
          "sse-src": expandedSrcPath,
        };
      }
    }
  }

  // Apply negation patterns: remove any expanded keys that match a null-valued glob.
  // If no keys matched, preserve the pattern itself with null to block that path at runtime.
  for (const pattern of negationPatterns) {
    let matched = false;
    for (const expandedKey of Object.keys(expandedExports)) {
      if (minimatch(expandedKey, pattern)) {
        delete expandedExports[expandedKey];
        matched = true;
      }
    }
    if (!matched) {
      expandedExports[pattern] = null;
    }
  }

  return expandedExports;
}

interface CreatePackageExports {
  exports: PackageJson["exports"];
  bundles: { type: BundleType; dir: string }[];
  outputDir: string;
  cwd: string;
  addTypes: boolean;
  isFlat: boolean;
  packageType: PackageType;
  exportExtensions?: string[];
}

export async function createPackageExports({
  exports: packageExports,
  bundles,
  outputDir,
  cwd,
  addTypes = false,
  isFlat = false,
  packageType = "commonjs",
  exportExtensions = [".js", ".mjs", ".cjs"],
}: CreatePackageExports) {
  const resolvedPackageType = packageType === "module" ? "module" : "commonjs";
  const rawExports: PackageJson.ExportConditions =
    typeof packageExports === "string" || Array.isArray(packageExports)
      ? { ".": packageExports }
      : packageExports || {};

  const originalExports = isFlat
    ? await expandExportGlobs(rawExports, cwd)
    : rawExports;

  // Ensure the package.json export points to the root of the build directory
  const newExports: PackageJson.ExportConditions = {
    "./package.json": "./package.json",
  };

  const result: {
    main?: string;
    types?: string;
    exports: PackageJson.ExportConditions;
  } = {
    exports: newExports,
  };

  // 1. AUTO-DISCOVERY: Scan the build output folder for generated files
  const baseBundle = bundles.find((b) => b.type === "esm") || bundles[0];
  const scanDir = isFlat ? outputDir : path.join(outputDir, baseBundle.dir);
  const buildFiles = await globby("**/*", { cwd: scanDir });

  const jsDirs = new Set<string>();
  const otherFiles = new Set<string>();
  let exportableFileCount = 0;

  for (const file of buildFiles) {
    if (
      file.endsWith(".d.ts") ||
      file.endsWith(".d.mts") ||
      file.endsWith(".d.cts")
    ) {
      continue;
    }

    const ext = path.extname(file);
    const normalizedFile = file.split(path.sep).join(path.posix.sep);

    if (exportExtensions.includes(ext)) {
      jsDirs.add(path.posix.dirname(normalizedFile));
      exportableFileCount++;
    } else {
      // Ignore internal package.json files found in bundle subdirectories
      if (normalizedFile.endsWith("package.json")) continue;
      otherFiles.add(normalizedFile);
    }
  }

  const getIndexFileName = (type: BundleType) =>
    `index${getOutExtension(type, { isFlat, packageType: resolvedPackageType })}`;

  const rootIndexExists = await fs
    .stat(path.join(scanDir, getIndexFileName(baseBundle.type)))
    .then((s) => s.isFile())
    .catch(() => false);

  // Determine if the package only contains a root index file
  const hasOnlyRootIndex = exportableFileCount === 1 && rootIndexExists;

  if (rootIndexExists && originalExports["."] === undefined) {
    newExports["."] ??= {};
    const rootConditions = newExports["."] as PackageJson.ExportConditions;

    for (const { type, dir: bundleDir } of bundles) {
      const outExtension = getOutExtension(type, {
        isFlat,
        packageType: resolvedPackageType,
      });
      const typeOutExtension = getOutExtension(type, {
        isFlat,
        isType: true,
        packageType: resolvedPackageType,
      });

      const dirPrefix = bundleDir === "." ? "" : `${bundleDir}/`;
      const exportPath = `./${dirPrefix}index${outExtension}`;
      const typeExportPath = `./${dirPrefix}index${typeOutExtension}`;

      const typeExists =
        addTypes &&
        (await fs
          .stat(path.join(outputDir, bundleDir, `index${typeOutExtension}`))
          .then((s) => s.isFile())
          .catch(() => false));

      const conditionKey = type === "cjs" ? "require" : "import";
      rootConditions[conditionKey] = typeExists
        ? { types: typeExportPath, default: exportPath }
        : exportPath;

      if (type === "cjs" || (type === "esm" && bundles.length === 1)) {
        result.main = exportPath;
        if (typeExists) result.types = typeExportPath;
      }
    }
  }

  for (const dir of jsDirs) {
    // 2a. Directory Globs (e.g. `./*`, `./r/*`)
    const globKey = dir === "." ? "./*" : `./${dir}/*`;

    // Only add the root wildcard export if there are other files besides index
    if (dir === "." && hasOnlyRootIndex) {
      continue;
    }

    if (originalExports[globKey] === undefined) {
      newExports[globKey] ??= {};
      const globConditions = newExports[
        globKey
      ] as PackageJson.ExportConditions;

      for (const { type, dir: bundleDir } of bundles) {
        const outExtension = getOutExtension(type, {
          isFlat,
          packageType: resolvedPackageType,
        });
        const typeOutExtension = getOutExtension(type, {
          isFlat,
          isType: true,
          packageType: resolvedPackageType,
        });

        const dirPrefix = bundleDir === "." ? "" : `${bundleDir}/`;
        const basePath = dir === "." ? "" : `${dir}/`;

        const exportPath = `./${dirPrefix}${basePath}*${outExtension}`;
        const typeExportPath = `./${dirPrefix}${basePath}*${typeOutExtension}`;

        const conditionKey = type === "cjs" ? "require" : "import";

        globConditions[conditionKey] = addTypes
          ? { types: typeExportPath, default: exportPath }
          : exportPath;
      }
    }

    // 2b. Sub-directory Index Exports
    if (dir !== ".") {
      const dirIndexExists = await fs
        .stat(path.posix.join(scanDir, dir, getIndexFileName(baseBundle.type)))
        .then((s) => s.isFile())
        .catch(() => false);

      const dirKey = `./${dir}`;
      if (dirIndexExists && originalExports[dirKey] === undefined) {
        newExports[dirKey] ??= {};
        const dirConditions = newExports[
          dirKey
        ] as PackageJson.ExportConditions;

        for (const { type, dir: bundleDir } of bundles) {
          const outExtension = getOutExtension(type, {
            isFlat,
            packageType: resolvedPackageType,
          });
          const typeOutExtension = getOutExtension(type, {
            isFlat,
            isType: true,
            packageType: resolvedPackageType,
          });

          const dirPrefix = bundleDir === "." ? "" : `${bundleDir}/`;
          const basePath = `${dir}/`;
          const exportPath = `./${dirPrefix}${basePath}index${outExtension}`;
          const typeExportPath = `./${dirPrefix}${basePath}index${typeOutExtension}`;

          const typeExists =
            addTypes &&
            (await fs
              .stat(
                path.join(
                  outputDir,
                  bundleDir,
                  dir,
                  `index${typeOutExtension}`,
                ),
              )
              .then((s) => s.isFile())
              .catch(() => false));

          const conditionKey = type === "cjs" ? "require" : "import";
          dirConditions[conditionKey] = typeExists
            ? { types: typeExportPath, default: exportPath }
            : exportPath;
        }
      }
    }
  }

  for (const file of otherFiles) {
    const exportKey = `./${file}`;
    if (originalExports[exportKey] !== undefined) continue;

    const dirPrefix = baseBundle.dir === "." ? "" : `${baseBundle.dir}/`;
    newExports[exportKey] = `./${dirPrefix}${file}`;
  }

  // Handle custom manually declared non-root exports and final cleanups
  const exportKeys = Object.keys(originalExports);
  for (const key of exportKeys) {
    const importPath = originalExports[key];
    if (!importPath) {
      newExports[key] = null;
      continue;
    }

    if (key === ".") continue;
    await Promise.all(
      bundles.map(async ({ type, dir }) => {
        const outExtension = getOutExtension(type, {
          isFlat,
          packageType: resolvedPackageType,
        });
        const typeOutExtension = getOutExtension(type, {
          isFlat,
          isType: true,
          packageType: resolvedPackageType,
        });
        const indexFileExists = await fs
          .stat(path.join(outputDir, dir, `index${outExtension}`))
          .then(
            (stats) => stats.isFile(),
            () => false,
          );
        const typeFileExists =
          addTypes &&
          (await fs
            .stat(path.join(outputDir, dir, `index${typeOutExtension}`))
            .then(
              (stats) => stats.isFile(),
              () => false,
            ));
        const dirPrefix = dir === "." ? "" : `${dir}/`;
        const exportDir = `./${dirPrefix}index${outExtension}`;
        const typeExportDir = `./${dirPrefix}index${typeOutExtension}`;

        if (indexFileExists && originalExports["."] !== undefined) {
          if (type === "cjs") {
            result.main = exportDir;
          }

          if (
            typeof newExports["."] === "string" ||
            Array.isArray(newExports["."])
          ) {
            throw new Error(
              `The export "." is already defined as a string or Array.`,
            );
          }

          newExports["."] ??= {};

          const rootConditions = newExports[
            "."
          ] as PackageJson.ExportConditions;
          rootConditions[type === "cjs" ? "require" : "import"] = typeFileExists
            ? {
                types: typeExportDir,
                default: exportDir,
              }
            : exportDir;
        }
        if (typeFileExists && type === "cjs") {
          result.types = typeExportDir;
        }

        const subExportKeys = Object.keys(originalExports);
        for (const subKey of subExportKeys) {
          const subImportPath = originalExports[subKey];
          if (!subImportPath) {
            newExports[subKey] = null;
            continue;
          }
          if (subKey === ".") continue;

          await createExportsFor({
            importPath: subImportPath,
            key: subKey,
            cwd,
            dir,
            type,
            newExports,
            typeOutExtension,
            outExtension,
            addTypes,
          });
        }
      }),
    );
  }

  // Explicitly block access to bundle directories and internal package.json files
  bundles.forEach(({ dir }) => {
    if (dir !== ".") {
      newExports[`./${dir}/package.json`] = null;
      newExports[`./${dir}`] = null;
      newExports[`./${dir}/*`] = null;
    }
  });

  Object.keys(newExports).forEach((key) => {
    const exportVal = newExports[key] as PackageJson.ExportConditions;
    if (Array.isArray(exportVal)) {
      throw new Error(
        `Array form of package.json exports is not supported yet. Found in export "${key}".`,
      );
    }
    if (
      exportVal &&
      typeof exportVal === "object" &&
      (exportVal.import || exportVal.require)
    ) {
      const defaultExport = exportVal.import || exportVal.require;

      if (addTypes) {
        exportVal.default = defaultExport;
      } else {
        exportVal.default =
          defaultExport &&
          typeof defaultExport === "object" &&
          "default" in defaultExport
            ? (defaultExport as any).default
            : defaultExport;
      }
    }
  });

  return result;
}

interface CreatePackageBin {
  bin: PackageJson["bin"];
  bundles: { type: BundleType; dir: string }[];
  cwd: string;
  isFlat: boolean;
  packageType: PackageType;
}

export async function createPackageBin({
  bin,
  bundles,
  cwd,
  isFlat = false,
  packageType,
}: CreatePackageBin): Promise<string | Record<string, string> | undefined> {
  if (!bin) {
    return undefined;
  }

  const bundleToUse = bundles.find((b) => b.type === "esm") || bundles[0];
  const binOutExtension = getOutExtension(bundleToUse.type, {
    isFlat,
    packageType,
  });

  const binsToProcess = typeof bin === "string" ? { __bin__: bin } : bin;
  const newBin: Record<string, string> = {};

  for (const [binKey, binPath] of Object.entries(binsToProcess)) {
    // make sure the actual file exists
    const binFileExists =
      binPath &&
      // eslint-disable-next-line no-await-in-loop
      (await fs.stat(path.join(cwd, binPath)).then(
        (stats) => stats.isFile(),
        () => false,
      ));
    if (!binFileExists) {
      throw new Error(
        `The bin file "${binPath}" for key "${binKey}" does not exist in the package. Please fix the "bin" field in package.json and point it to the source file.`,
      );
    }
    if (typeof binPath !== "string") {
      throw new Error(`The bin path for "${binKey}" should be a string.`);
    }
    const ext = path.extname(binPath);
    newBin[binKey] = binPath
      .replace(
        /(\.\/)?src\//,
        bundleToUse.dir === "." ? "./" : `./${bundleToUse.dir}/`,
      )
      .replace(new RegExp(`\\${ext}$`), binOutExtension);
  }

  if (Object.keys(newBin).length === 1 && newBin.__bin__) {
    return newBin.__bin__;
  }

  return newBin;
}

/**
 * Validates the package.json before building.
 */
export function validatePkgJson(
  packageJson: Record<string, any>,
  options: { skipMainCheck?: boolean; enableReactCompiler?: boolean } = {},
): void {
  const { skipMainCheck = false, enableReactCompiler = false } = options;
  const errors: string[] = [];
  const buildDirBase = packageJson.publishConfig?.directory;
  if (!buildDirBase) {
    errors.push(
      `No build directory specified in "${packageJson.name}" package.json. Specify it in the "publishConfig.directory" field.`,
    );
  }

  if (packageJson.private === false) {
    errors.push(
      `Remove the field "private": false from "${packageJson.name}" package.json. This is redundant.`,
    );
  }

  if (!skipMainCheck) {
    if (packageJson.main) {
      errors.push(
        `Remove the field "main" from "${packageJson.name}" package.json. Add it as "exports["."]" instead.`,
      );
    }

    if (packageJson.module) {
      errors.push(
        `Remove the field "module" from "${packageJson.name}" package.json. Add it as "exports["."]" instead.`,
      );
    }

    if (packageJson.types || packageJson.typings) {
      errors.push(
        `Remove the field "types/typings" from "${packageJson.name}" package.json. Add it as "exports["."]" instead.`,
      );
    }
  }

  const reactVersion = packageJson.peerDependencies?.react;
  if (enableReactCompiler) {
    if (!reactVersion) {
      errors.push(
        'When building with React compiler, "react" must be specified as a peerDependency in package.json.',
      );
    }
    const minSupportedReactVersion = semver.minVersion(reactVersion);
    if (!minSupportedReactVersion) {
      errors.push(
        `Unable to determine the minimum supported React version from the peerDependency range: "${reactVersion}".`,
      );
    } else if (
      semver.lt(minSupportedReactVersion, "19.0.0") &&
      !packageJson.peerDependencies?.["react-compiler-runtime"] &&
      !packageJson.dependencies?.["react-compiler-runtime"]
    ) {
      errors.push(
        'When building with React compiler for React versions below 19, "react-compiler-runtime" must be specified as a dependency or peerDependency in package.json.',
      );
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors.join("\n"));
    throw error;
  }
}

/**
 * Marks the start and end of a function execution for performance measurement.
 * Uses the Performance API to create marks and measure the duration.
 */
export async function markFn<F extends () => Promise<any>>(
  label: string,
  fn: () => ReturnType<F>,
): Promise<ReturnType<F>> {
  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  performance.mark(startMark);
  const result = await fn();
  performance.mark(endMark);
  performance.measure(label, startMark, endMark);
  return result;
}

export function measureFn(label: string) {
  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  return performance.measure(label, startMark, endMark);
}

export const BASE_IGNORES = [
  "**/*.test.js",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.js",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.d.ts",
  "**/*.test/*.*",
  "**/test-cases/*.*",
];

/**
 * A utility to map a function over an array of items in a worker pool.
 *
 * This function will create a pool of workers and distribute the items to be processed among them.
 * Each worker will process items sequentially, but multiple workers will run in parallel.
 */
export async function mapConcurrently<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<(R | Error)[]> {
  if (!items.length) {
    return Promise.resolve([]);
  }

  const itemIterator = items.entries();
  const count = Math.min(concurrency, items.length);
  const workers = [];

  const results: (R | Error)[] = new Array(items.length);
  for (let i = 0; i < count; i += 1) {
    const worker = Promise.resolve().then(async () => {
      for (const [index, item] of itemIterator) {
        // eslint-disable-next-line no-await-in-loop
        const res = await mapper(item);
        results[index] = res;
      }
    });
    workers.push(worker);
  }

  await Promise.all(workers);
  return results;
}

interface AddLicenseOptions {
  name?: string;
  version?: string;
  license?: string;
  author?: string;
  isFlat: boolean;
  packageType?: "module" | "commonjs";
  bundle: BundleType;
  outputDir: string;
}

export async function addLicense({
  name,
  version,
  license,
  bundle,
  author,
  outputDir,
  isFlat,
  packageType,
}: AddLicenseOptions) {
  const outExtension = getOutExtension(bundle, { isFlat, packageType });
  const file = path.join(outputDir, `index${outExtension}`);

  if (
    !(await fs.stat(file).then(
      (stats) => stats.isFile(),
      () => false,
    ))
  ) {
    return;
  }

  const authorLine = author ? `\n * @author ${author}` : "";
  const content = await fs.readFile(file, { encoding: "utf8" });
  await fs.writeFile(
    file,
    `/**
 * ${name} v${version}
 * ${authorLine}
 * @license ${license}
 * This source code is licensed under the ${license} license found in the
 * LICENSE file in the root directory of this source tree.
 */

${content}`,
    { encoding: "utf8" },
  );

  if (process.env.SSE_BUILD_VERBOSE)
    console.log(chalk.gray(`License added to ${file}`));
}

interface WritePackageJsonOptions {
  packageJson: PackageJson;
  bundles: { type: BundleType; dir: string }[];
  outputDir: string;
  cwd: string;
  addTypes?: boolean;
  isFlat?: boolean;
  packageType?: PackageType;
  exportExtensions?: string[];
}

export async function writePackageJson({
  packageJson,
  bundles,
  outputDir,
  cwd,
  addTypes = false,
  isFlat = false,
  packageType,
  exportExtensions,
}: WritePackageJsonOptions) {
  delete packageJson.scripts;
  delete packageJson.publishConfig?.directory;
  delete packageJson.devDependencies;
  delete packageJson.imports;

  const resolvedPackageType = packageType || packageJson.type || "commonjs";
  packageJson.type = resolvedPackageType;

  const originalExports = packageJson.exports;
  delete packageJson.exports;
  const originalBin = packageJson.bin;
  delete packageJson.bin;

  const {
    exports: packageExports,
    main,
    types,
  } = await createPackageExports({
    exports: originalExports,
    bundles,
    outputDir,
    cwd,
    addTypes,
    isFlat,
    packageType: resolvedPackageType,
    exportExtensions,
  });

  packageJson.exports = packageExports;
  if (main) {
    packageJson.main = main;
  }

  if (types) {
    packageJson.types = types;
  }

  const bin = await createPackageBin({
    bin: originalBin,
    bundles,
    cwd,
    isFlat,
    packageType: resolvedPackageType,
  });

  if (bin) {
    packageJson.bin = bin;
  }

  await fs.writeFile(
    path.join(outputDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf-8",
  );
}
