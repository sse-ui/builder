import * as babel from "@babel/core";
import pluginTypescriptSyntax from "@ssets/babel/plugin/syntax-typescript";
import pluginResolveImports from "@ssets/babel/plugin/resolve-imports";
import { findWorkspacesRoot } from "find-workspaces";
import pluginRemoveImports from "@ssets/babel/plugin/transform-remove-imports";
import { $ } from "execa";
import { globby } from "globby";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  BundleType,
  getOutExtension,
  mapConcurrently,
  PackageType,
} from "./build";

const $$ = $({ stdio: "inherit" });

/**
 * Checks if tsgo CLI is available in the workspace's node_modules.
 */
async function findTsgo(cwd: string): Promise<string | null> {
  const workspaceDir = await findWorkspacesRoot(cwd);
  if (!workspaceDir) {
    return null;
  }
  const tsgoPath = path.join(
    workspaceDir.location,
    "node_modules",
    ".bin",
    "tsgo",
  );
  const exists = await fs.stat(tsgoPath).then(
    (stat) => stat.isFile(),
    () => false,
  );
  return exists ? tsgoPath : null;
}

/**
 * Emits TypeScript declaration files.
 * @param {string} tsconfig - The path to the tsconfig.json file.
 * @param {string} outDir - The output directory for the declaration files.
 * @param {Object} options
 * @param {boolean} [options.useTsgo] - Whether to use typescript native (tsgo).
 */
export async function emitDeclarations(
  tsconfig: string,
  outDir: string,
  options: { useTsgo?: boolean } = {},
) {
  const { useTsgo = false } = options ?? {};
  const tsconfigDir = path.dirname(tsconfig);
  const rootDir = path.resolve(tsconfigDir, "./src");

  const tsgoPath = useTsgo ? await findTsgo(tsconfigDir) : null;
  if (useTsgo && !tsgoPath) {
    throw new Error(
      '--tsgo flag was passed or MUI_USE_TSGO environment was set but no tsgo cli was found. Either remove the flag to use tsc or install the native package "@typescript/native-preview" at the workspace level to use tsgo.',
    );
  }

  if (tsgoPath) {
    console.log("Using tsgo for declaration emit");
    await $$`${tsgoPath}
      -p ${tsconfig}
      --rootDir ${rootDir}
      --outDir ${outDir}
      --declaration
      --emitDeclarationOnly
      --noEmit false
      --composite false
      --incremental false
      --declarationMap false`;
  } else {
    await $$`tsc
      -p ${tsconfig}
      --rootDir ${rootDir}
      --outDir ${outDir}
      --declaration
      --emitDeclarationOnly
      --noEmit false
      --composite false
      --incremental false
      --declarationMap false`;
  }
}

/**
 * @param {string} sourceDirectory
 * @param {string} destinationDirectory
 * @param {Object} [options]
 * @param {boolean} [options.verbose=false]
 */
export async function copyDeclarations(
  sourceDirectory: string,
  destinationDirectory: string,
  options: { verbose?: boolean } = {},
) {
  const fullSourceDirectory = path.resolve(sourceDirectory);
  const fullDestinationDirectory = path.resolve(destinationDirectory);

  if (options.verbose) {
    console.log(
      `Copying declarations from ${fullSourceDirectory} to ${fullDestinationDirectory}`,
    );
  }

  await fs.cp(fullSourceDirectory, fullDestinationDirectory, {
    recursive: true,
    filter: async (src) => {
      // Ignore dotfiles and dot-directories based on basename for cross-platform correctness
      if (path.basename(src).startsWith(".")) {
        // ignore dotfiles
        return false;
      }
      const stats = await fs.stat(src);
      if (stats.isDirectory()) {
        return true;
      }
      return (
        src.endsWith(".d.ts") ||
        src.endsWith(".d.mts") ||
        src.endsWith(".d.cts")
      );
    },
  });
}

interface MoveAndTransformDeclarationsOptions {
  inputDir: string;
  buildDir: string;
  bundles: { type: BundleType; dir: string }[];
  isFlat?: boolean;
  packageType?: PackageType;
}

export async function moveAndTransformDeclarations({
  inputDir,
  buildDir,
  bundles,
  isFlat,
  packageType,
}: MoveAndTransformDeclarationsOptions) {
  // Directly copy to the bundle directory if there's only one bundle, mainly for esm, since
  // the js files are inside 'esm' folder. resolve-imports plugin needs d.ts to be alongside js files to
  // resolve paths correctly.
  const toCopyDir =
    bundles.length === 1 ? path.join(buildDir, bundles[0].dir) : buildDir;
  await fs.cp(inputDir, toCopyDir, {
    recursive: true,
    force: false,
  });

  const dtsFiles = await globby("**/*.d.ts", {
    absolute: true,
    cwd: toCopyDir,
  });
  if (dtsFiles.length === 0) {
    console.log(
      `No d.ts files found in ${toCopyDir}. Skipping transformation.`,
    );
    return;
  }

  await mapConcurrently(
    dtsFiles,
    async (dtsFile) => {
      // Normalize to native separators to make path comparisons reliable on Windows
      const nativeDtsFile = path.normalize(dtsFile);
      const content = await fs.readFile(nativeDtsFile, "utf8");
      const relativePath = path.relative(toCopyDir, nativeDtsFile);

      const writesToOriginalPath =
        isFlat &&
        bundles.some((bundle) => {
          const newFileExtension = getOutExtension(bundle.type, {
            isFlat,
            isType: true,
            packageType,
          });
          const outFileRelative = relativePath.replace(
            /\.d\.ts$/,
            newFileExtension,
          );
          const outFilePath = path.join(buildDir, bundle.dir, outFileRelative);
          // Ensure both paths are normalized before comparison (fixes Windows posix vs win32 separators)
          return path.resolve(outFilePath) === path.resolve(nativeDtsFile);
        });

      await Promise.all(
        bundles.map(async (bundle) => {
          const importExtension = getOutExtension(bundle.type, {
            isFlat,
            packageType,
          });
          const newFileExtension = getOutExtension(bundle.type, {
            isFlat,
            isType: true,
            packageType,
          });
          const outFileRelative = isFlat
            ? relativePath.replace(/\.d\.ts$/, newFileExtension)
            : relativePath;
          const outFilePath = path.join(buildDir, bundle.dir, outFileRelative);

          const babelPlugins: babel.PluginItem[] = [
            [pluginTypescriptSyntax, { dts: true }],
            [pluginResolveImports, { outExtension: importExtension }],
            [pluginRemoveImports, { test: /\.css$/ }],
          ];

          const result = await babel.transformAsync(content, {
            configFile: false,
            plugins: babelPlugins,
            filename: nativeDtsFile,
          });
          if (typeof result?.code === "string") {
            await fs.mkdir(path.dirname(outFilePath), { recursive: true });
            await fs.writeFile(outFilePath, result.code);
          } else {
            console.error("failed to transform", dtsFile);
          }
        }),
      );
      if (isFlat && !writesToOriginalPath) {
        await fs.unlink(nativeDtsFile);
      }
    },
    30,
  );
}

export interface CreateDeclarationOptions {
  /**
   * Whether to place generated declaration files in a flattened directory.
   */
  isFlat?: boolean;

  /**
   * Whether to log additional information while generating and moving declaration files.
   */
  verbose?: boolean;

  /**
   * The bundles to create declarations for.
   */
  bundles: { type: BundleType; dir: string }[];

  /**
   * The source directory.
   */
  srcDir: string;

  /**
   * The build directory.
   */
  buildDir: string;

  /**
   * The current working directory.
   */
  cwd: string;

  /**
   * Whether to skip running TypeScript compiler (tsc) for building types.
   */
  skipTsc: boolean;

  /**
   * Whether to build types using typescript native (tsgo).
   */
  useTsgo?: boolean;

  /**
   * The package.json type field.
   */
  packageType?: PackageType;
}

/**
 * Creates TypeScript declaration files for the specified bundles.
 * Types are first created in a temporary directory and then copied to the appropriate bundle directories parallelly.
 * After copying, babel transformations are applied to the copied files because they need to be alongside the actual js files for proper resolution.
 */
export async function createTypes({
  bundles,
  srcDir,
  buildDir,
  cwd,
  skipTsc,
  useTsgo = false,
  isFlat = false,
  packageType,
  verbose,
}: CreateDeclarationOptions) {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "code-infra-build-tsc-"),
  );

  try {
    await copyDeclarations(srcDir, tmpDir, { verbose });
    const tsconfigPath = path.join(cwd, "tsconfig.build.json");
    const tsconfigExists = await fs.stat(tsconfigPath).then(
      (file) => file.isFile(),
      () => false,
    );
    if (!skipTsc) {
      if (!tsconfigExists) {
        throw new Error(
          "Unable to find a tsconfig to build this project. " +
            `The package root needs to contain a 'tsconfig.build.json'. ` +
            `The package root is '${cwd}'`,
        );
      }
      console.log(`Building types for ${tsconfigPath} in ${tmpDir}`);
      await emitDeclarations(tsconfigPath, tmpDir, { useTsgo });
    }
    await moveAndTransformDeclarations({
      inputDir: tmpDir,
      buildDir,
      bundles,
      isFlat,
      packageType,
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
