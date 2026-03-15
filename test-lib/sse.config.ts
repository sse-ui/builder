import { defineConfig } from "../packages/builder/dist/config";

export default defineConfig({
  // Global options
  bundle: ["esm", "cjs"],
  verbose: true,
  buildTypes: true,

  esbuild: {
    entry: "src/index.ts",
    minify: false,
    target: ["es2020", "node14"],
    external: [],
  },
});
