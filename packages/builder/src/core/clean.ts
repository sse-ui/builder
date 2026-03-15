import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { PackageJson } from "./packageJson";
import chalk from "chalk";

export const cleanCommand = new Command("clean")
  .description(
    "Removes the build directory specified in package.json to start fresh",
  )
  .action(async () => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const packageJsonContent = await fs.readFile(pkgJsonPath, {
        encoding: "utf8",
      });

      const packageJson: PackageJson = JSON.parse(packageJsonContent);
      const buildDirBase = packageJson.publishConfig?.directory || "build";
      const buildDir = path.join(cwd, buildDirBase);

      if (isVerbose)
        console.log(
          chalk.blue(`🧹 Cleaning build directory: ${buildDirBase}...`),
        );

      await fs.rm(buildDir, { recursive: true, force: true });
      console.log(chalk.green("✨ Cleaned successfully!"));
    } catch (error) {
      console.error(chalk.red("❌ Error executing clean command:"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
