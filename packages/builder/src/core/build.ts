import { findWorkspacesRoot } from "find-workspaces";
import { $ } from "execa";
import { globby } from "globby";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sep as posixSep } from "node:path/posix";
import * as semver from "semver";
import { Command } from "commander";
import { build as esbuild } from "esbuild";
import chalk from "chalk";

import {
  addLicense,
  getOutExtension,
  mapConcurrently,
  validatePkgJson,
  writePackageJson,
  type BundleType,
} from "../utils/build";
import { PackageJson } from "./packageJson";
import { loadConfig } from "../utils/loadConfig";
import { getPackageManager } from "../utils/package-manager";

export interface BuildCliOptions {
  bundle?: BundleType[];
  entry?: string;
  hasLargeFiles?: boolean;
  skipBundlePackageJson?: boolean;
  verbose?: boolean;
  buildTypes?: boolean;
  skipTsc?: boolean;
  skipBabelRuntimeCheck?: boolean;
  skipPackageJson?: boolean;
  skipMainCheck?: boolean;
  ignore?: string[];
  copy?: string[];
  minify?: boolean;
  enableReactCompiler?: boolean;
  tsgo?: boolean;
  flat?: boolean;
  exportExtensions?: string[];
}

export const buildCommand = new Command("build")
  .description(chalk.cyan("Builds the package for publishing."))
  .option("--bundle <bundles...>", "Bundles to output", ["esm", "cjs"])
  .option("--entry <entry>", "Entry point for esbuild (e.g., src/index.ts)")
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
    "Uses tsgo cli instead of tsc for type generation.",
    process.env.SSE_USE_TSGO === "1" || process.env.SSE_USE_TSGO === "true",
  )
  .option(
    "--flat",
    "Builds the package in a flat structure without subdirectories for each module type.",
    process.env.SSE_BUILD_FLAT === "1",
  )
  .option(
    "--exportExtensions <exts...>",
    "Available extensions for generating exports wildcards.",
    [".js", ".mjs", ".cjs"],
  )
  .option("--minify", "Minify the generated output.")
  .action(async (cliOptions: BuildCliOptions) => {
    const fileConfig = await loadConfig();

    // 1. Resolve verbose explicitly
    const isVerbose =
      cliOptions.verbose ||
      fileConfig.verbose ||
      process.env.SSE_BUILD_VERBOSE === "true";
    if (isVerbose) process.env.SSE_BUILD_VERBOSE = "true";

    // 2. Infer Builder (esbuild if esbuild config/entry is present, babel otherwise)
    const isEsbuild = !!fileConfig.esbuild || !!cliOptions.entry;
    const builder = isEsbuild ? "esbuild" : "babel";

    const bundles: BundleType[] = cliOptions.bundle ||
      fileConfig.bundle || ["esm", "cjs"];

    const isFlat = cliOptions.flat ?? fileConfig.flat ?? false;
    const minify = cliOptions.minify ?? fileConfig.minify ?? false;
    const buildTypes = cliOptions.buildTypes ?? fileConfig.buildTypes ?? true;
    const skipTsc = cliOptions.skipTsc ?? fileConfig.skipTsc ?? false;
    const skipBundlePackageJson =
      cliOptions.skipBundlePackageJson ??
      fileConfig.skipBundlePackageJson ??
      false;

    const skipBabelRuntimeCheck = cliOptions.skipBabelRuntimeCheck ?? false;
    const skipPackageJson = cliOptions.skipPackageJson ?? false;
    const enableReactCompiler =
      cliOptions.enableReactCompiler ??
      fileConfig.babel?.enableReactCompiler ??
      false;

    const useTsgo = cliOptions.tsgo ?? fileConfig.tsgo ?? false;
    const exportExtensions = cliOptions.exportExtensions ??
      fileConfig.exportExtensions ?? [".js", ".mjs", ".cjs"];

    const copyGlobs = [...(fileConfig.copy || []), ...(cliOptions.copy || [])];

    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");
    const packageJson: PackageJson = JSON.parse(
      await fs.readFile(pkgJsonPath, { encoding: "utf8" }),
    );

    validatePkgJson(packageJson, {
      skipMainCheck: cliOptions.skipMainCheck,
      enableReactCompiler,
    });

    const buildDirBase = packageJson.publishConfig?.directory as string;
    const buildDir = path.join(cwd, buildDirBase);
    const packageType = packageJson.type === "module" ? "module" : "commonjs";

    if (isVerbose) {
      console.log(chalk.blue(`Selected output directory: "${buildDirBase}"`));
      if (isFlat)
        console.log(chalk.blue("Building package in flat structure."));
    }

    await fs.rm(buildDir, { recursive: true, force: true });
    const pm = getPackageManager();

    let babelRuntimeVersion = packageJson.dependencies?.["@babel/runtime"];
    if (babelRuntimeVersion === "catalog:") {
      if (pm === "pnpm") {
        try {
          const { stdout: configStdout } = await $`pnpm config list --json`;
          const pnpmWorkspaceConfig = JSON.parse(configStdout);
          babelRuntimeVersion = pnpmWorkspaceConfig.catalog["@babel/runtime"];
        } catch (error) {
          if (isVerbose)
            console.warn(
              `\n⚠️ Failed to resolve 'catalog:' using pnpm. Falling back to default.`,
            );
          babelRuntimeVersion = "^7.25.0";
        }
      } else {
        if (isVerbose)
          console.warn(
            `\n⚠️ 'catalog:' dependency found but package manager is ${pm}. Falling back to default babel runtime version.`,
          );
        babelRuntimeVersion = "^7.25.0";
      }
    }

    if (builder === "babel" && !babelRuntimeVersion && !skipBabelRuntimeCheck) {
      throw new Error(
        "package.json needs to have a dependency on `@babel/runtime` when building with `@babel/plugin-transform-runtime`.",
      );
    }

    if (!bundles || bundles.length === 0) {
      console.error(
        chalk.red(
          "No bundles specified. Use --bundle to specify which bundles to build.",
        ),
      );
      return;
    }

    const relativeOutDirs: Record<BundleType, string> = !isFlat
      ? { cjs: ".", esm: "esm" }
      : { cjs: ".", esm: "." };

    const sourceDir = path.join(cwd, "src");
    const reactVersion =
      semver.minVersion(packageJson.peerDependencies?.react || "")?.version ??
      "latest";

    if (enableReactCompiler && isVerbose) {
      const mode = process.env.SSE_REACT_COMPILER_MODE ?? "opt-in";
      console.log(
        `[feature] Building with React compiler enabled. The compiler mode is "${mode}" right now.${mode === "opt-in" ? ' Use explicit "use memo" directives in your components to enable the React compiler for them.' : ""}`,
      );
    }

    // ==========================================
    // ESBUILD COMPILATION
    // ==========================================
    if (builder === "esbuild") {
      if (isVerbose)
        console.log(
          chalk.green("📦 Bundling package into single files via esbuild..."),
        );

      const esbuildConfig = fileConfig.esbuild || { entry: "src/index.ts" };
      let rawEntryPoints = cliOptions.entry || esbuildConfig.entry;

      if (!rawEntryPoints) {
        throw new Error(
          chalk.red(
            "Esbuild requires an 'entry' point. Please define it in your config (esbuild.entry) or via --entry.",
          ),
        );
      }

      const entryPoints =
        typeof rawEntryPoints === "string" ? [rawEntryPoints] : rawEntryPoints;

      await Promise.all(
        bundles.map(async (bundle) => {
          const outExtension = getOutExtension(bundle, {
            isFlat: !!isFlat,
            isType: false,
            packageType,
          });

          const relativeOutDir = relativeOutDirs[bundle];
          const outputDir = path.join(buildDir, relativeOutDir);
          await fs.mkdir(outputDir, { recursive: true });

          await esbuild({
            entryPoints: entryPoints as string[] | Record<string, string>,
            bundle: true,
            outdir: outputDir,
            format: bundle === "esm" ? "esm" : "cjs",
            target: esbuildConfig.target || ["es2020", "node14"],
            minify: minify,
            outExtension: { ".js": outExtension }, // Forces the correct extension output
            external: [
              ...Object.keys(packageJson.dependencies || {}),
              ...Object.keys(packageJson.peerDependencies || {}),
              ...(esbuildConfig.external || []),
            ],
          });

          if (buildDir !== outputDir && !skipBundlePackageJson && !isFlat) {
            await fs.writeFile(
              path.join(outputDir, "package.json"),
              JSON.stringify({
                type: bundle === "esm" ? "module" : "commonjs",
                sideEffects: packageJson.sideEffects ?? false,
              }),
            );
          }

          await addLicense({
            bundle,
            license: packageJson.license,
            name: packageJson.name,
            version: packageJson.version,
            author:
              typeof packageJson.author === "string"
                ? packageJson.author
                : packageJson.author?.name,
            outputDir,
            isFlat: !!isFlat,
            packageType,
          });
        }),
      );
    } else {
      // ==========================================
      // BABEL COMPILATION
      // ==========================================
      if (isVerbose)
        console.log(chalk.green("📦 Transpiling package via Babel..."));

      const { build: babelBuild, cjsCopy } = await import("../utils/babel");

      const hasLargeFiles =
        cliOptions.hasLargeFiles ?? fileConfig.babel?.hasLargeFiles ?? false;

      const extraIgnores = [
        ...(fileConfig.babel?.ignore || []),
        ...(cliOptions.ignore || []),
      ];

      await Promise.all(
        bundles.map(async (bundle) => {
          const outExtension = getOutExtension(bundle, {
            isFlat: !!isFlat,
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
              verbose: isVerbose,
              minify,
              optimizeClsx:
                packageJson.dependencies?.clsx !== undefined ||
                packageJson.dependencies?.classnames !== undefined,
              removePropTypes:
                packageJson.dependencies?.["prop-types"] !== undefined,
              pkgVersion: packageJson.version,
              ignores: extraIgnores,
              outExtension,
              reactCompiler: enableReactCompiler
                ? { reactVersion: reactVersion || "latest" }
                : undefined,
            }),
          );

          if (buildDir !== outputDir && !skipBundlePackageJson && !isFlat) {
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

          if (!isFlat) {
            promises.push(cjsCopy({ from: sourceDir, to: outputDir }));
          }

          await Promise.all(promises);
          await addLicense({
            bundle,
            license: packageJson.license,
            name: packageJson.name,
            version: packageJson.version,
            outputDir,
            isFlat: !!isFlat,
            packageType,
          });
        }),
      );

      if (isFlat) {
        await cjsCopy({ from: sourceDir, to: buildDir });
      }
    }

    // ==========================================
    // TYPES & POST-BUILD
    // ==========================================
    if (buildTypes === true) {
      if (isVerbose)
        console.log(chalk.cyan("📝 Generating TypeScript declarations..."));

      const tsMod = await import("../utils/typescript");
      const bundleMap = bundles.map((type) => ({
        type,
        dir: relativeOutDirs[type],
      }));

      let esbuildEntryPoints: string[] | undefined;
      if (builder === "esbuild") {
        const esbuildConfig = fileConfig.esbuild || { entry: "src/index.ts" };
        const rawEntryPoints = cliOptions.entry || esbuildConfig.entry;
        esbuildEntryPoints =
          typeof rawEntryPoints === "string"
            ? [rawEntryPoints]
            : (rawEntryPoints as string[]);
      }

      await tsMod.createTypes({
        bundles: bundleMap,
        srcDir: sourceDir,
        cwd,
        skipTsc,
        isFlat: !!isFlat,
        buildDir,
        useTsgo,
        packageType,
        verbose: isVerbose,
        builder,
        entryPoints: esbuildEntryPoints,
      });
    }

    if (skipPackageJson) {
      if (isVerbose)
        console.log(
          "Skipping package.json generation in the output directory.",
        );
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
      isFlat: !!isFlat,
      packageType,
      exportExtensions,
    });

    await copyHandler({
      cwd,
      globs: copyGlobs,
      buildDir,
      verbose: isVerbose,
    });

    console.log(chalk.green.bold("✔ Build completed successfully"));
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

  if (verbose) console.log(`📋 Copied ${defaultFiles.length} files.`);
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
      console.log(chalk.gray(`📄 Copied ${source} → ${target}`));
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
      console.warn(chalk.yellow(`⚠ Source does not exist: ${source}`));
    }

    throw err;
  }
}
