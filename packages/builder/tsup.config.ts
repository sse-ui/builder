import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/babel-config.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
});
