import { findWorkspacesRoot } from "find-workspaces";
import { $ } from "execa";
import { globby } from "globby";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sep as posixSep } from "node:path/posix";
import * as semver from "semver";
import { Command } from "commander";

import {
  createPackageBin,
  createPackageExports,
  getOutExtension,
  mapConcurrently,
  PackageType,
  validatePkgJson,
  type BundleType,
} from "../utils/build";
import { PackageJson } from "./packageJson";
import { loadConfig } from "../utils/loadConfig";

export interface BuildOptions {
  /** The bundles to build. */
  bundle: BundleType[];
  /** The large files to build. */
  hasLargeFiles: boolean;
  /** Whether to skip generating a package.json file in the /esm folder. */
  skipBundlePackageJson: boolean;
  /** Whether to enable verbose logging. */
  verbose: boolean;
  /** Whether to build types for the package. */
  buildTypes: boolean;
  /** Whether to build types for the package. */
  skipTsc: boolean;
  /** Whether to skip checking for Babel runtime dependencies in the package. */
  skipBabelRuntimeCheck: boolean;
  /** Whether to skip generating the package.json file in the bundle output. */
  skipPackageJson: boolean;
  /** Whether to skip checking for main field in package.json. */
  skipMainCheck: boolean;
  /** Globs to be ignored by Babel. */
  ignore: string[];
  /** Files/Directories to be copied. Can be a glob pattern. */
  copy: string[];
  /** Whether to use the React compiler. */
  enableReactCompiler: boolean;
  /** Whether to build types using typescript native (tsgo). */
  tsgo: boolean;
  /** Builds the package in a flat structure without subdirectories for each module type. */
  flat: boolean;
}

interface AddLicenseOptions {
  name?: string;
  version?: string;
  license?: string;
  isFlat: boolean;
  packageType?: "module" | "commonjs";
  bundle: BundleType;
  outputDir: string;
}

async function addLicense({
  name,
  version,
  license,
  bundle,
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

  const content = await fs.readFile(file, { encoding: "utf8" });
  await fs.writeFile(
    file,
    `/**
 * ${name} v${version}
 *
 * @license ${license}
 * This source code is licensed under the ${license} license found in the
 * LICENSE file in the root directory of this source tree.
 */
${content}`,
    { encoding: "utf8" },
  );
  console.log(`License added to ${file}`);
}

interface WritePackageJsonOptions {
  packageJson: PackageJson;
  bundles: { type: BundleType; dir: string }[];
  outputDir: string;
  cwd: string;
  addTypes?: boolean;
  isFlat?: boolean;
  packageType?: PackageType;
}

async function writePackageJson({
  packageJson,
  bundles,
  outputDir,
  cwd,
  addTypes = false,
  isFlat = false,
  packageType,
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

export const buildCommand = new Command("build")
  .description("Builds the package for publishing.")
  .option("--bundle <bundles...>", "Bundles to output", ["esm", "cjs"])
  .option(
    "--hasLargeFiles",
    "Set to `true` if you know you are transpiling large files.",
    false,
  )
  .option(
    "--skipBundlePackageJson",
    "Set to `true` if you don't want to generate a package.json file in the bundle output.",
    false,
  )
  // commander interprets `--no-buildTypes` as setting `buildTypes` to false, defaulting to true otherwise.
  .option("--buildTypes", "Do not build types for the package.")
  .option(
    "--skipTsc",
    "Skip running TypeScript compiler (tsc) for building types.",
    false,
  )
  .option("--ignore <globs...>", "Extra globs to be ignored by Babel.", [])
  .option(
    "--skipBabelRuntimeCheck",
    "Skip checking for Babel runtime dependencies in the package.",
    false,
  )
  .option(
    "--skipPackageJson",
    "Skip generating the package.json file in the bundle output.",
    false,
  )
  .option(
    "--skipMainCheck",
    "Skip checking for main field in package.json.",
    false,
  )
  .option(
    "--copy <globs...>",
    "Files/Directories to be copied to the output directory. Can be a glob pattern.",
    [],
  )
  .option("--enableReactCompiler", "Whether to use the React compiler.", false)
  .option(
    "--tsgo",
    'Uses tsgo cli instead of tsc for type generation. Can also be set via env var "SSE_USE_TSGO"',
    process.env.SSE_USE_TSGO === "1" || process.env.SSE_USE_TSGO === "true",
  )
  .option(
    "--flat",
    "Builds the package in a flat structure without subdirectories for each module type.",
    process.env.SSE_BUILD_FLAT === "1",
  )
  .option("--verbose", "Enable verbose logging.", false)
  .action(async (cliOptions: BuildOptions) => {
    const fileConfig = await loadConfig();

    const options: BuildOptions = {
      bundle: cliOptions.bundle || fileConfig.bundle || ["esm", "cjs"],
      hasLargeFiles:
        cliOptions.hasLargeFiles ?? fileConfig.hasLargeFiles ?? false,
      skipBundlePackageJson:
        cliOptions.skipBundlePackageJson ??
        fileConfig.skipBundlePackageJson ??
        false,
      buildTypes: cliOptions.buildTypes ?? fileConfig.buildTypes ?? true,
      skipTsc: cliOptions.skipTsc ?? fileConfig.skipTsc ?? false,
      ignore: [...(fileConfig.ignore || []), ...(cliOptions.ignore || [])],
      copy: [...(fileConfig.copy || []), ...(cliOptions.copy || [])],
      enableReactCompiler:
        cliOptions.enableReactCompiler ??
        fileConfig.enableReactCompiler ??
        false,
      tsgo: cliOptions.tsgo ?? fileConfig.tsgo ?? false,
      flat: cliOptions.flat ?? fileConfig.flat ?? false,
      verbose: cliOptions.verbose ?? fileConfig.verbose ?? false,
      skipBabelRuntimeCheck: false,
      skipPackageJson: false,
      skipMainCheck: false,
    };

    const {
      bundle: bundles,
      hasLargeFiles,
      skipBundlePackageJson,
      verbose = false,
      ignore: extraIgnores,
      buildTypes,
      skipTsc,
      skipBabelRuntimeCheck = false,
      skipPackageJson = false,
      enableReactCompiler = false,
      tsgo: useTsgo = false,
    } = options;

    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");
    const packageJson: PackageJson = JSON.parse(
      await fs.readFile(pkgJsonPath, { encoding: "utf8" }),
    );

    validatePkgJson(packageJson, {
      skipMainCheck: options.skipMainCheck,
      enableReactCompiler,
    });

    const buildDirBase = packageJson.publishConfig?.directory as string;
    const buildDir = path.join(cwd, buildDirBase);
    const packageType = packageJson.type === "module" ? "module" : "commonjs";

    console.log(`Selected output directory: "${buildDirBase}"`);
    if (options.flat) {
      console.log("Building package in flat structure.");
    }

    await fs.rm(buildDir, { recursive: true, force: true });

    let babelRuntimeVersion = packageJson.dependencies?.["@babel/runtime"];
    if (babelRuntimeVersion === "catalog:") {
      // resolve the version from the given package
      // outputs the pnpm-workspace.yaml config as json
      const { stdout: configStdout } = await $`pnpm config list --json`;
      const pnpmWorkspaceConfig = JSON.parse(configStdout);
      babelRuntimeVersion = pnpmWorkspaceConfig.catalog["@babel/runtime"];
    }

    if (!babelRuntimeVersion && !skipBabelRuntimeCheck) {
      throw new Error(
        "package.json needs to have a dependency on `@babel/runtime` when building with `@babel/plugin-transform-runtime`.",
      );
    }

    if (!bundles || bundles.length === 0) {
      console.error(
        "No bundles specified. Use --bundle to specify which bundles to build.",
      );
      return;
    }

    // Assuming utils are also converted to TS, otherwise change to .mjs where needed
    const { build: babelBuild, cjsCopy } = await import("../utils/babel");

    const relativeOutDirs: Record<BundleType, string> = !options.flat
      ? {
          cjs: ".",
          esm: "esm",
        }
      : {
          cjs: ".",
          esm: ".",
        };

    const sourceDir = path.join(cwd, "src");
    const reactVersion =
      semver.minVersion(packageJson.peerDependencies?.react || "")?.version ??
      "latest";

    if (enableReactCompiler) {
      const mode = process.env.SSE_REACT_COMPILER_MODE ?? "opt-in";
      console.log(
        `[feature] Building with React compiler enabled. The compiler mode is "${mode}" right now.${mode === "opt-in" ? ' Use explicit "use memo" directives in your components to enable the React compiler for them.' : ""}`,
      );
    }

    // js build start
    await Promise.all(
      bundles.map(async (bundle) => {
        const outExtension = getOutExtension(bundle, {
          isFlat: !!options.flat,
          isType: false,
          packageType,
        });
        const relativeOutDir = relativeOutDirs[bundle];
        const outputDir = path.join(buildDir, relativeOutDir);
        await fs.mkdir(outputDir, { recursive: true });

        const promises: Promise<any>[] = [];

        promises.push(
          babelBuild({
            cwd,
            sourceDir,
            outDir: outputDir,
            babelRuntimeVersion,
            hasLargeFiles,
            bundle,
            verbose,
            optimizeClsx:
              packageJson.dependencies?.clsx !== undefined ||
              packageJson.dependencies?.classnames !== undefined,
            removePropTypes:
              packageJson.dependencies?.["prop-types"] !== undefined,
            pkgVersion: packageJson.version,
            ignores: extraIgnores,
            outExtension,
            reactCompiler: enableReactCompiler
              ? {
                  reactVersion: reactVersion || "latest",
                }
              : undefined,
          }),
        );

        if (buildDir !== outputDir && !skipBundlePackageJson && !options.flat) {
          promises.push(
            fs.writeFile(
              path.join(outputDir, "package.json"),
              JSON.stringify({
                type: bundle === "esm" ? "module" : "commonjs",
                sideEffects: packageJson.sideEffects ?? false,
              }),
            ),
          );
        }

        if (!options.flat) {
          promises.push(cjsCopy({ from: sourceDir, to: outputDir }));
        }

        await Promise.all(promises);
        await addLicense({
          bundle,
          license: packageJson.license,
          name: packageJson.name,
          version: packageJson.version,
          outputDir,
          isFlat: !!options.flat,
          packageType,
        });
      }),
    );

    if (options.flat) {
      await cjsCopy({ from: sourceDir, to: buildDir });
    }
    // js build end

    if (buildTypes) {
      const tsMod = await import("../utils/typescript");
      const bundleMap = bundles.map((type) => ({
        type,
        dir: relativeOutDirs[type],
      }));

      await tsMod.createTypes({
        bundles: bundleMap,
        srcDir: sourceDir,
        cwd,
        skipTsc,
        isFlat: !!options.flat,
        buildDir,
        useTsgo,
        packageType,
        verbose: options.verbose,
      });
    }

    if (skipPackageJson) {
      console.log("Skipping package.json generation in the output directory.");
      return;
    }

    await writePackageJson({
      cwd,
      packageJson,
      bundles: bundles.map((type) => ({
        type,
        dir: relativeOutDirs[type],
      })),
      outputDir: buildDir,
      addTypes: buildTypes,
      isFlat: !!options.flat,
      packageType,
    });

    await copyHandler({
      cwd,
      globs: options.copy ?? [],
      buildDir,
      verbose: options.verbose,
    });
  });

interface CopyHandlerOptions {
  cwd: string;
  globs?: string[];
  buildDir: string;
  verbose?: boolean;
}

async function copyHandler({
  cwd,
  globs = [],
  buildDir,
  verbose = false,
}: CopyHandlerOptions) {
  const defaultFiles: (string | { targetPath: string; sourcePath: string })[] =
    [];

  // const workspaceRoot = await findWorkspacesRoot(cwd);
  // if (!workspaceRoot) {
  //   throw new Error("Workspace directory not found");
  // }

  // const { location: workspaceDir } = workspaceRoot;
  // const localOrRootFiles = [
  //   [path.join(cwd, "README.md"), path.join(workspaceDir, "README.md")],
  //   [path.join(cwd, "LICENSE"), path.join(workspaceDir, "LICENSE")],
  //   [path.join(cwd, "CHANGELOG.md"), path.join(workspaceDir, "CHANGELOG.md")],
  // ];

  const workspaceRoot = await findWorkspacesRoot(cwd);

  // Set up the local files to check first
  const localOrRootFiles = [
    [path.join(cwd, "README.md")],
    [path.join(cwd, "LICENSE")],
    [path.join(cwd, "CHANGELOG.md")],
  ];

  // If a workspace exists, append the workspace root files as fallbacks
  if (workspaceRoot) {
    localOrRootFiles[0].push(path.join(workspaceRoot.location, "README.md"));
    localOrRootFiles[1].push(path.join(workspaceRoot.location, "LICENSE"));
    localOrRootFiles[2].push(path.join(workspaceRoot.location, "CHANGELOG.md"));
  }

  await Promise.all(
    localOrRootFiles.map(async (filesToCopy) => {
      for (const file of filesToCopy) {
        if (
          // eslint-disable-next-line no-await-in-loop
          await fs.stat(file).then(
            () => true,
            () => false,
          )
        ) {
          defaultFiles.push(file);
          break;
        }
      }
    }),
  );

  if (globs.length) {
    const res = globs.map((globPattern) => {
      const [pattern, baseDir] = globPattern.split(":");
      return { pattern, baseDir };
    });
    /**
     * Avoids redundant globby calls for the same pattern.
     */
    const globToResMap = new Map<string, Promise<string[]>>();

    const result = await Promise.all(
      res.map(async ({ pattern, baseDir }) => {
        if (!globToResMap.has(pattern)) {
          const promise = globby(pattern, { cwd });
          globToResMap.set(pattern, promise);
        }
        const files = await globToResMap.get(pattern);
        return { files: files ?? [], baseDir };
      }),
    );
    globToResMap.clear();

    result.forEach(({ files, baseDir }) => {
      files.forEach((file) => {
        const sourcePath = path.resolve(cwd, file);
        // Use posix separator for the relative paths. So devs can only specify globs with `/` even on Windows.
        const pathSegments = file.split(posixSep);
        const relativePath =
          // Use index 2 (when required) since users can also specify paths like `./src/index.js`
          pathSegments.slice(pathSegments[0] === "." ? 2 : 1).join(posixSep) ||
          file;
        const targetPath = baseDir
          ? path.resolve(buildDir, baseDir, relativePath)
          : path.resolve(buildDir, relativePath);
        defaultFiles.push({ sourcePath, targetPath });
      });
    });
  }

  if (!defaultFiles.length) {
    if (verbose) {
      console.log("⓿ No files to copy.");
    }
  }
  await mapConcurrently(
    defaultFiles,
    async (file) => {
      if (typeof file === "string") {
        const sourcePath = file;
        const fileName = path.basename(file);
        const targetPath = path.join(buildDir, fileName);
        await recursiveCopy({
          source: sourcePath,
          target: targetPath,
          verbose,
        });
      } else {
        await fs.mkdir(path.dirname(file.targetPath), { recursive: true });
        await recursiveCopy({
          source: file.sourcePath,
          target: file.targetPath,
          verbose,
        });
      }
    },
    20,
  );
  console.log(`📋 Copied ${defaultFiles.length} files.`);
}

interface RecursiveCopyOptions {
  source: string;
  target: string;
  verbose?: boolean;
}

/**
 * Recursively copies files and directories from a source path to a target path.
 */
async function recursiveCopy({
  source,
  target,
  verbose = true,
}: RecursiveCopyOptions): Promise<boolean> {
  try {
    await fs.cp(source, target, { recursive: true });
    if (verbose) {
      console.log(`Copied ${source} to ${target}`);
    }
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code !== "ENOENT"
    ) {
      throw err;
    }
    if (verbose) {
      console.warn(`Source does not exist: ${source}`);
    }
    throw err;
  }
}
