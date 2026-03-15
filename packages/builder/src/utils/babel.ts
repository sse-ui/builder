import { findWorkspacesRoot } from "find-workspaces";
import { $ } from "execa";
import { globby } from "globby";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BASE_IGNORES, type BundleType } from "./build";

const TO_TRANSFORM_EXTENSIONS = [".js", ".ts", ".tsx"] as const;

export type VersionEnvVariables = Record<string, string | undefined>;

export function getVersionEnvVariables(
  pkgVersion?: string,
): VersionEnvVariables {
  if (!pkgVersion) {
    throw new Error("No version found in package.json");
  }

  const [versionNumber, prerelease] = pkgVersion.split("-");
  const [major, minor, patch] = versionNumber.split(".");

  if (!major || !minor || !patch) {
    throw new Error(`Couldn't parse version from package.json`);
  }

  return {
    SSE_VERSION: pkgVersion,
    SSE_MAJOR_VERSION: major,
    SSE_MINOR_VERSION: minor,
    SSE_PATCH_VERSION: patch,
    SSE_PRERELEASE: prerelease,
  };
}

export interface CjsCopyOptions {
  from: string;
  to: string;
}

export async function cjsCopy({ from, to }: CjsCopyOptions): Promise<void> {
  const exists = await fs
    .stat(to)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    console.warn(`path ${to} does not exists`);
    return;
  }

  const files = await globby("**/*.cjs", { cwd: from });
  const cmds = files.map((file) =>
    fs.cp(path.resolve(from, file), path.resolve(to, file)),
  );

  await Promise.all(cmds);
}

export interface ErrorCodeMetadata {
  outputPath: string;
  runtimeModule?: string;
}

export interface ReactCompilerOptions {
  reactVersion?: string;
}

export interface BuildOptions {
  cwd: string;
  pkgVersion?: string;
  sourceDir: string;
  outDir: string;
  outExtension?: string;
  babelRuntimeVersion?: string;
  hasLargeFiles: boolean;
  bundle: BundleType;
  verbose?: boolean;
  optimizeClsx?: boolean;
  removePropTypes?: boolean;
  ignores?: string[];
  reactCompiler?: ReactCompilerOptions;
}

export async function build({
  cwd,
  sourceDir,
  outDir,
  babelRuntimeVersion,
  hasLargeFiles,
  bundle,
  pkgVersion,
  outExtension,
  optimizeClsx = false,
  removePropTypes = false,
  verbose = false,
  ignores = [],
  reactCompiler,
}: BuildOptions): Promise<void> {
  if (verbose) {
    console.log(
      `Transpiling files to "${path.relative(path.dirname(sourceDir), outDir)}" for "${bundle}" bundle.`,
    );
  }

  const workspaceDir = await findWorkspacesRoot(cwd);
  const rootDir = workspaceDir ? workspaceDir.location : cwd;

  let configFile = path.join(rootDir, "babel.config.js");

  const exists = await fs
    .stat(configFile)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    configFile = path.join(rootDir, "babel.config.mjs");
  }

  const reactVersion = reactCompiler?.reactVersion;

  const env: Record<string, string | undefined> = {
    NODE_ENV: "production",
    BABEL_ENV: bundle === "esm" ? "stable" : "node",
    SSE_BUILD_VERBOSE: verbose ? "true" : undefined,
    SSE_OPTIMIZE_CLSX: optimizeClsx ? "true" : undefined,
    SSE_REMOVE_PROP_TYPES: removePropTypes ? "true" : undefined,
    SSE_BABEL_RUNTIME_VERSION: babelRuntimeVersion,
    SSE_OUT_FILE_EXTENSION: outExtension ?? ".js",
    ...getVersionEnvVariables(pkgVersion),
    SSE_REACT_COMPILER: reactVersion ? "1" : "0",
    SSE_REACT_COMPILER_REACT_VERSION: reactVersion,
  };

  const resolvedOutExtension = outExtension ?? ".js";

  const res = await $({
    stdio: "inherit",
    preferLocal: true,
    localDir: import.meta.dirname,
    env: {
      ...process.env,
      ...env,
    },
  })`babel --config-file ${configFile} --extensions ${TO_TRANSFORM_EXTENSIONS.join(
    ",",
  )} ${sourceDir} --out-dir ${outDir} --ignore ${BASE_IGNORES.concat(
    ignores,
  ).join(",")} --out-file-extension ${
    resolvedOutExtension !== ".js" ? resolvedOutExtension : ".js"
  } --compact ${hasLargeFiles ? "false" : "auto"}`;

  if (res.stderr) {
    throw new Error(
      `Command: '${res.escapedCommand}' failed with \n${res.stderr}`,
    );
  }

  if (verbose) {
    console.log(
      `Command: '${res.escapedCommand}' succeeded with \n${res.stdout}`,
    );
  }
}
