import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { PackageJson } from "./packageJson";

export const cleanCommand = new Command("clean")
  .description(
    "Removes the build directory specified in package.json to start fresh",
  )
  .action(async () => {
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const packageJsonContent = await fs.readFile(pkgJsonPath, {
        encoding: "utf8",
      });

      const packageJson: PackageJson = JSON.parse(packageJsonContent);
      const buildDirBase = packageJson.publishConfig?.directory || "build";
      const buildDir = path.join(cwd, buildDirBase);
      console.log(`🧹 Cleaning build directory: ${buildDirBase}...`);
      await fs.rm(buildDir, { recursive: true, force: true });
      console.log("✨ Cleaned successfully!");
    } catch (error) {
      console.error("❌ Error executing clean command:");
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }
  });
