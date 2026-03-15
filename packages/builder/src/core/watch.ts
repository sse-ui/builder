import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import chokidar, { FSWatcher } from "chokidar";
import { $ } from "execa";
import { build as esbuild } from "esbuild";
import { findWorkspacesRoot } from "find-workspaces";
import { loadConfig } from "../utils/loadConfig";
import {
  getOutExtension,
  writePackageJson,
  type BundleType,
} from "../utils/build";
import { getVersionEnvVariables } from "../utils/babel";
import { PackageJson } from "./packageJson";
import { getPackageManager, getPmExec } from "../utils/package-manager";

export const watchCommand = new Command("watch")
  .description(
    "Watches the src directory and incrementally rebuilds files on changes (Vite-style)",
  )
  .action(async () => {
    const cwd = process.cwd();
    const srcDir = path.join(cwd, "src");
    const pkgJsonPath = path.join(cwd, "package.json");

    let watcher: FSWatcher | null = null;
    let configWatcher: FSWatcher | null = null;

    const startWatcher = async (isReload = false) => {
      if (watcher) {
        await watcher.close();
      }

      const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
      if (isReload) {
        console.log(`\n🔄 Configuration change detected. Reloading...`);
      }

      const packageJsonContent = await fs.readFile(pkgJsonPath, "utf8");
      const packageJson: PackageJson = JSON.parse(packageJsonContent);
      const buildDirBase = packageJson.publishConfig?.directory || "build";
      const buildDir = path.join(cwd, buildDirBase);

      const fileConfig = await loadConfig();
      const bundles: BundleType[] = fileConfig.bundle || ["esm", "cjs"];
      const isFlat = fileConfig.flat ?? false;
      const packageType = packageJson.type === "module" ? "module" : "commonjs";

      // Determine Builder
      const isEsbuild = !!fileConfig.esbuild;
      const builder = isEsbuild ? "esbuild" : "babel";

      const workspaceDir = await findWorkspacesRoot(cwd);
      const rootDir = workspaceDir ? workspaceDir.location : cwd;

      const pm = getPackageManager();
      const pmExec = getPmExec();

      let babelRuntimeVersion = packageJson.dependencies?.["@babel/runtime"];
      const reactVersion = packageJson.peerDependencies?.react || "latest";

      console.log(`👀 Watching for changes (Builder: ${builder})...`);

      // 1. Initial Build
      try {
        await $({
          stdio: "inherit",
          preferLocal: true,
        })`${pmExec} sse-tools build`;
      } catch (err) {
        console.error(`❌ Initial build failed. Waiting for changes...\n`);
      }

      // 2. Incremental Build Logic
      const buildFile = async (filePath: string) => {
        const relativePath = path.relative(srcDir, filePath);

        if (builder === "esbuild") {
          if (isVerbose)
            console.log(
              `🚀 [esbuild] Incremental rebuild triggered by ${relativePath}...`,
            );

          const esbuildConfig = fileConfig.esbuild!;
          const entryPoints =
            typeof esbuildConfig.entry === "string"
              ? [esbuildConfig.entry]
              : esbuildConfig.entry;

          try {
            await Promise.all(
              bundles.map(async (bundle) => {
                const outExtension = getOutExtension(bundle, {
                  isFlat,
                  packageType,
                });
                const relativeOutDir = isFlat
                  ? "."
                  : bundle === "esm"
                    ? "esm"
                    : ".";
                const outputDir = path.join(buildDir, relativeOutDir);

                await esbuild({
                  entryPoints: entryPoints as string[] | Record<string, string>,
                  bundle: true,
                  outdir: outputDir,
                  format: bundle === "esm" ? "esm" : "cjs",
                  target: esbuildConfig.target || ["es2020", "node14"],
                  minify: esbuildConfig.minify ?? false,
                  outExtension: { ".js": outExtension },
                  external: [
                    ...Object.keys(packageJson.dependencies || {}),
                    ...Object.keys(packageJson.peerDependencies || {}),
                    ...(esbuildConfig.external || []),
                  ],
                });
              }),
            );
            if (isVerbose) console.log(`✅ [esbuild] Rebuild complete.`);
          } catch (err: any) {
            console.error(`❌ [esbuild] Rebuild failed:`, err.message);
          }
        } else {
          // BABEL LOGIC (Individual file transpilation)
          const ext = path.extname(filePath);
          if (
            ![".js", ".jsx", ".ts", ".tsx"].includes(ext) ||
            filePath.endsWith(".d.ts")
          )
            return;

          let babelConfigFile = path.join(rootDir, "babel.config.js");
          if (
            !(await fs
              .stat(babelConfigFile)
              .then(() => true)
              .catch(() => false))
          ) {
            babelConfigFile = path.join(rootDir, "babel.config.mjs");
          }

          await Promise.all(
            bundles.map(async (bundle) => {
              const outExtension = getOutExtension(bundle, {
                isFlat,
                packageType,
              });
              const relativeOutDir = isFlat
                ? "."
                : bundle === "esm"
                  ? "esm"
                  : ".";
              const outputDir = path.join(buildDir, relativeOutDir);
              const outFilePath = path.join(
                outputDir,
                relativePath.replace(new RegExp(`\\${ext}$`), outExtension),
              );

              await fs.mkdir(path.dirname(outFilePath), { recursive: true });

              const env = {
                NODE_ENV: "production",
                BABEL_ENV: bundle === "esm" ? "stable" : "node",
                SSE_OUT_FILE_EXTENSION: outExtension,
                SSE_BABEL_RUNTIME_VERSION: babelRuntimeVersion,
                ...getVersionEnvVariables(packageJson.version),
              };

              await $({
                stdio: "pipe",
                preferLocal: true,
                env: { ...process.env, ...env },
              })`babel --config-file ${babelConfigFile} --extensions .js,.jsx,.ts,.tsx ${filePath} --out-file ${outFilePath}`;
            }),
          );
          if (isVerbose) console.log(`✅ [babel] Updated ${relativePath}`);
        }
      };

      // 3. Update Exports
      const updateExports = async () => {
        try {
          const freshPkg: PackageJson = JSON.parse(
            await fs.readFile(pkgJsonPath, "utf8"),
          );
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
        } catch (e: any) {
          console.error(`❌ Failed to update exports: ${e.message}`);
        }
      };

      let exportTimeout: NodeJS.Timeout;
      const debouncedUpdateExports = () => {
        clearTimeout(exportTimeout);
        exportTimeout = setTimeout(() => updateExports(), 150);
      };

      // 4. Watcher Setup
      watcher = chokidar.watch(srcDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
      });

      watcher
        .on("change", async (filePath) => await buildFile(filePath))
        .on("add", async (filePath) => {
          await buildFile(filePath);
          debouncedUpdateExports();
        })
        .on("unlink", async (filePath) => {
          const relativePath = path.relative(srcDir, filePath);
          const ext = path.extname(filePath);
          for (const bundle of bundles) {
            const outExtension = getOutExtension(bundle, {
              isFlat,
              packageType,
              isType: false,
            });
            const relativeOutDir = isFlat
              ? "."
              : bundle === "esm"
                ? "esm"
                : ".";
            const outputDir = path.join(buildDir, relativeOutDir);
            const outRelativePath = relativePath.replace(
              new RegExp(`\\${ext}$`),
              outExtension,
            );
            await fs
              .rm(path.join(outputDir, outRelativePath), { force: true })
              .catch(() => {});
          }
          debouncedUpdateExports();
        })
        .on("unlinkDir", async (dirPath) => {
          const relativePath = path.relative(srcDir, dirPath);
          for (const bundle of bundles) {
            const relativeOutDir = isFlat
              ? "."
              : bundle === "esm"
                ? "esm"
                : ".";
            await fs
              .rm(path.join(buildDir, relativeOutDir, relativePath), {
                recursive: true,
                force: true,
              })
              .catch(() => {});
          }
          debouncedUpdateExports();
        });
    };

    const configFiles = [
      "sse.config.ts",
      "sse.config.js",
      "sse.config.mjs",
      "sse.config.cjs",
      "sse.config.mts",
      "sse.config.cts",
      "sse.config.json",
      "package.json",
    ];

    configWatcher = chokidar.watch(
      configFiles.map((f) => path.join(cwd, f)),
      {
        persistent: true,
        ignoreInitial: true,
      },
    );

    configWatcher.on("change", () => startWatcher(true));
    await startWatcher();
  });
