# **Configuration**

The builder uses `c12` to load configuration files. You can define your project settings in an `sse.config.ts`, `sse.config.js`, `sse.config.mjs`, or within your `package.json`.

### **Configuration File**

Create a `defineConfig` helper in your project to provide autocompletion and type checking:

```ts
import { defineConfig } from "@sse-ui/builder/config";

export default defineConfig({
  // ---------------------------------------------------------------------------
  // Core Build Options
  // ---------------------------------------------------------------------------

  // The bundles to output. Options are "esm" (ES Modules) and "cjs" (CommonJS).
  // Default: ["esm", "cjs"]
  bundle: ["esm", "cjs"],

  // If true, builds the package in a flat structure (all files in the root of the build dir)
  // instead of separating them into /esm and /cjs subdirectories.
  // Default: false
  flat: false,

  // Determines the file extensions used when generating export wildcards in package.json.
  // Default: [".js", ".mjs", ".cjs"]
  exportExtensions: [".js", ".mjs", ".cjs"],

  // Files or directories to be copied directly to the output build directory.
  // Useful for static assets, READMEs, or global CSS files.
  // Accepts glob patterns.
  copy: ["README.md", "LICENSE", "src/assets/**/*.png"],

  // Enable verbose logging during the build process for debugging.
  // Default: false
  verbose: true,

  // ---------------------------------------------------------------------------
  // TypeScript & Type Generation Options
  // ---------------------------------------------------------------------------

  // Whether to build and output TypeScript declaration (.d.ts) files.
  // Default: true
  buildTypes: true,

  // Skip running the standard TypeScript compiler (tsc) for building types.
  // Default: false
  skipTsc: false,

  // Uses the highly experimental `tsgo` CLI instead of `tsc` for significantly
  // faster type generation (requires @typescript/native-preview).
  // Default: false
  tsgo: false,

  // ---------------------------------------------------------------------------
  // Builder Strategy: Esbuild OR Babel
  // Note: You can only define one of these blocks at a time.
  // ---------------------------------------------------------------------------

  /* --- Option A: Esbuild (For high-speed bundling into single files) --- */
  esbuild: {
    // The main entry point(s) for the bundle.
    entry: "src/index.ts", // Can also be an array: ["src/index.ts", "src/cli.ts"]

    // Whether to minify the generated bundle.
    minify: true,

    // Target environment for the generated JavaScript.
    target: ["es2020", "node14"],

    // External dependencies to explicitly exclude from the bundle
    // (dependencies and peerDependencies in package.json are excluded automatically).
    external: ["fsevents"],
  },

  /* --- Option B: Babel (For file-by-file transpilation) --- */
  /*
  babel: {
    // Enable support for the React Compiler (requires react-compiler-runtime if < React 19).
    enableReactCompiler: true,

    // Set to true if you are transpiling exceptionally large files (disables compact mode).
    hasLargeFiles: false,

    // Extra glob patterns to be ignored by Babel during transpilation.
    ignore: ["**/*.test-utils.ts"],
  }
  */
});
```

### Builder Choice

The tool automatically determines the builder based on your configuration:

- **esbuild**: Triggered if `esbuild` configuration or an `entry` point is provided.
- **Babel**: The default builder used if no esbuild settings are detected.

<details>
<summary>
While using Babel user is required to define `babel.config.js` or `babel.config.mjs`. You can use the default babel config.
</summary>

```js [babel.config.js]
import getBaseConfig from "@sse-ui/builder/babel-config";

export default function getBabelConfig(api) {
  const baseConfig = getBaseConfig(api);

  return {
    ...baseConfig,
    overrides: [
      {
        exclude: /\.test\.(m?js|ts|tsx)$/,
        plugins: ["@babel/plugin-transform-react-constant-elements"],
      },
    ],
  };
}
```

</details>
