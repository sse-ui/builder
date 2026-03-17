import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bundle-generator.ts"],
  format: ["esm", "cjs"],
  target: "node20",
  clean: true,
  dts: true,
  external: ["typescript"],
});
