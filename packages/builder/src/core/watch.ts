import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import chokidar from "chokidar";
import { $ } from "execa";
import { findWorkspacesRoot } from "find-workspaces";
import { loadConfig } from "../utils/loadConfig";
import {
  getOutExtension,
  writePackageJson,
  type BundleType,
} from "../utils/build";
import { getVersionEnvVariables } from "../utils/babel";
import { PackageJson } from "./packageJson";
import { getPackageManager } from "../utils/package-manager";

export const watchCommand = new Command("watch")
  .description(
    "Watches the src directory and incrementally rebuilds files on changes (Vite-style)",
  )
  .option("--verbose", "Enable verbose logging.", false)
  .action(async (option: { verbose: boolean }) => {
    const cwd = process.cwd();
    const srcDir = path.join(cwd, "src");
    const pkgJsonPath = path.join(cwd, "package.json");

    // 1. Initial configuration load
    const packageJsonContent = await fs.readFile(pkgJsonPath, {
      encoding: "utf8",
    });
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    const buildDirBase = packageJson.publishConfig?.directory || "build";
    const buildDir = path.join(cwd, buildDirBase);

    const fileConfig = await loadConfig();
    const bundles: BundleType[] = fileConfig.bundle || ["esm", "cjs"];
    const isFlat = fileConfig.flat ?? false;
    const packageType = packageJson.type === "module" ? "module" : "commonjs";

    const workspaceDir = await findWorkspacesRoot(cwd);
    const rootDir = workspaceDir ? workspaceDir.location : cwd;

    // Resolve Babel Config
    let configFile = path.join(rootDir, "babel.config.js");
    const exists = await fs
      .stat(configFile)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      configFile = path.join(rootDir, "babel.config.mjs");
    }

    // Resolve Babel Runtime Version
    const pm = getPackageManager();
    let babelRuntimeVersion = packageJson.dependencies?.["@babel/runtime"];
    if (babelRuntimeVersion === "catalog:") {
      if (pm === "pnpm") {
        try {
          const { stdout } = await $`pnpm config list --json`;
          babelRuntimeVersion = JSON.parse(stdout).catalog?.["@babel/runtime"];
        } catch (e) {
          // ignore gracefully
        }
      } else {
        console.warn(
          `\n⚠️ 'catalog:' dependency found but package manager is ${pm}. Falling back to default babel runtime version.`,
        );
        babelRuntimeVersion = "^7.25.0"; // Safe fallback
      }
    }
    const reactVersion = packageJson.peerDependencies?.react || "latest";

    console.log(`👀 Watching for changes in ./src...`);

    // 2. Perform an initial full build so all files & TS types are present first
    try {
      console.log(`\n⏳ Running initial full build...`);
      await $({ stdio: "inherit", preferLocal: true })`npx sse-tools build`;
      if (option.verbose)
        console.log(
          `✅ Initial build completed successfully! Waiting for changes...\n`,
        );
    } catch (err) {
      console.error(
        `❌ Initial build failed. Watching for changes to fix errors...\n`,
      );
    }

    // 3. Incrementally compile a single file directly with Babel
    const buildFile = async (filePath: string) => {
      const relativePath = path.relative(srcDir, filePath);
      const ext = path.extname(filePath);

      // Skip non-compilable files or TypeScript declarations
      if (
        ![".js", ".jsx", ".ts", ".tsx"].includes(ext) ||
        filePath.endsWith(".d.ts")
      ) {
        return;
      }

      console.log(`🔄 Rebuilding ${relativePath}...`);

      await Promise.all(
        bundles.map(async (bundle) => {
          const outExtension = getOutExtension(bundle, {
            isFlat,
            packageType,
            isType: false,
          });
          const relativeOutDir = isFlat ? "." : bundle === "esm" ? "esm" : ".";
          const outputDir = path.join(buildDir, relativeOutDir);

          const outRelativePath = relativePath.replace(
            new RegExp(`\\${ext}$`),
            outExtension,
          );
          const outFilePath = path.join(outputDir, outRelativePath);

          await fs.mkdir(path.dirname(outFilePath), { recursive: true });

          const env: Record<string, string | undefined> = {
            NODE_ENV: "production",
            BABEL_ENV: bundle === "esm" ? "stable" : "node",
            SSE_OUT_FILE_EXTENSION: outExtension,
            SSE_BABEL_RUNTIME_VERSION: babelRuntimeVersion,
            SSE_REACT_COMPILER_REACT_VERSION: fileConfig.enableReactCompiler
              ? reactVersion
              : undefined,
            ...getVersionEnvVariables(packageJson.version),
          };

          try {
            // Add preferLocal: true and explicit --extensions to fix the TS compilation bug
            await $({
              stdio: "pipe",
              preferLocal: true,
              env: { ...process.env, ...env },
            })`babel --config-file ${configFile} --extensions .js,.jsx,.ts,.tsx ${filePath} --out-file ${outFilePath}`;
          } catch (error: any) {
            console.error(
              `❌ Failed to compile ${relativePath} for ${bundle}:`,
            );
            console.error(error.stderr || error.message);
          }
        }),
      );
      console.log(`✅ Updated ${relativePath}`);
    };

    // 4. Update package.json exports dynamically
    const updateExports = async () => {
      console.log(`📦 Updating exports in ${buildDirBase}/package.json...`);
      try {
        const freshPkgContent = await fs.readFile(pkgJsonPath, {
          encoding: "utf8",
        });
        const freshPkg: PackageJson = JSON.parse(freshPkgContent);

        const relativeOutDirs: Record<BundleType, string> = !isFlat
          ? { cjs: ".", esm: "esm" }
          : { cjs: ".", esm: "." };

        await writePackageJson({
          cwd,
          packageJson: freshPkg,
          bundles: bundles.map((type) => ({
            type,
            dir: relativeOutDirs[type],
          })),
          outputDir: buildDir,
          addTypes: fileConfig.buildTypes ?? true,
          isFlat,
          packageType,
          exportExtensions: fileConfig.exportExtensions,
        });
        console.log(`✅ Exports updated.`);
      } catch (error: any) {
        console.error(`❌ Failed to update exports: ${error.message}`);
      }
    };

    // Debounce updateExports to prevent race conditions on folder deletes/adds
    let exportTimeout: NodeJS.Timeout;
    const debouncedUpdateExports = () => {
      clearTimeout(exportTimeout);
      exportTimeout = setTimeout(async () => {
        await updateExports();
      }, 150);
    };

    // 5. Setup file system Watcher
    const watcher = chokidar.watch(srcDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't trigger on startup, we handled it with full build
    });

    watcher
      .on("change", async (filePath) => {
        await buildFile(filePath);
      })
      .on("add", async (filePath) => {
        await buildFile(filePath);
        debouncedUpdateExports();
      })
      .on("unlink", async (filePath) => {
        const relativePath = path.relative(srcDir, filePath);
        console.log(`🗑️  Removed file ${relativePath}`);
        const ext = path.extname(filePath);

        for (const bundle of bundles) {
          const outExtension = getOutExtension(bundle, {
            isFlat,
            packageType,
            isType: false,
          });
          const relativeOutDir = isFlat ? "." : bundle === "esm" ? "esm" : ".";
          const outputDir = path.join(buildDir, relativeOutDir);

          const outRelativePath = relativePath.replace(
            new RegExp(`\\${ext}$`),
            outExtension,
          );
          const outFilePath = path.join(outputDir, outRelativePath);
          await fs.rm(outFilePath, { force: true }).catch(() => {});

          const typeOutExt = getOutExtension(bundle, {
            isFlat,
            packageType,
            isType: true,
          });
          const typeOutFilePath = path.join(
            outputDir,
            relativePath.replace(new RegExp(`\\${ext}$`), typeOutExt),
          );
          await fs.rm(typeOutFilePath, { force: true }).catch(() => {});
        }
        debouncedUpdateExports();
      })
      .on("unlinkDir", async (dirPath) => {
        // New handler for folder deletion!
        const relativePath = path.relative(srcDir, dirPath);
        console.log(`🗑️  Removed directory ${relativePath}`);

        for (const bundle of bundles) {
          const relativeOutDir = isFlat ? "." : bundle === "esm" ? "esm" : ".";
          const outputDir = path.join(buildDir, relativeOutDir);
          const outDirPath = path.join(outputDir, relativePath);

          // Recursively force delete the corresponding output folder
          await fs
            .rm(outDirPath, { recursive: true, force: true })
            .catch(() => {});
        }
        debouncedUpdateExports();
      });
  });
