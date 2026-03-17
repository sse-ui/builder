import { defineConfig } from "@sse-ui/builder/config";

export default defineConfig({
  bundle: ["esm", "cjs"],
  buildTypes: true,
  esbuild: {
    entry: "src/index.ts",
    external: [],
  },
});
