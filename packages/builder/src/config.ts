import { type BundleType } from "./utils/build";

export interface BabelOptions {
  /** Globs to be ignored by Babel. */
  ignore?: string[];
  /** Set to `true` if you know you are transpiling large files. */
  hasLargeFiles?: boolean;
  /** Whether to use the React compiler. */
  enableReactCompiler?: boolean;
}

export interface EsbuildOptions {
  /** * Entry points for esbuild.
   * Example: "src/index.ts" or ["src/index.ts"] or { main: "src/index.ts" }
   */
  entry: string | string[] | Record<string, string>;
  /** Target environment for the generated JavaScript. */
  target?: string | string[];
  /** External dependencies to exclude from the bundle. */
  external?: string[];
}

export interface BaseBuildConfig {
  /** The bundles to build. Default: ["esm", "cjs"] */
  bundle?: BundleType[];
  /** Builds the package in a flat structure without subdirectories */
  flat?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Whether to build types for the package */
  buildTypes?: boolean;
  /** Skip running TypeScript compiler */
  skipTsc?: boolean;
  /** Uses tsgo cli instead of tsc for type generation */
  tsgo?: boolean;
  /** Available extensions for generating exports wildcards */
  exportExtensions?: string[];
  /** Files/Directories to be copied */
  copy?: string[];
  /** Skip generating a package.json file in the bundle output */
  skipBundlePackageJson?: boolean;
  /** Minify the generated bundle. */
  minify?: boolean;
}

/**
 * The user can define EITHER `babel` OR `esbuild` configuration.
 */
export type BuildConfig = BaseBuildConfig &
  (
    | { babel?: BabelOptions; esbuild?: never }
    | { esbuild: EsbuildOptions; babel?: never }
  );

/**
 * Helper to provide autocomplete and type checking for the sse-tools config.
 */
export function defineConfig(config: BuildConfig): BuildConfig {
  return config;
}
