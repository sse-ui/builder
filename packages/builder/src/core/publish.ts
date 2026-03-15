import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import chalk from "chalk";
import { PackageJson } from "./packageJson";
import { getPackageManager } from "../utils/package-manager";

export const publishCommand = new Command("publish")
  .description(
    "Automatically publishes the built package from the publishConfig.directory",
  )
  .option("--tag <tag>", "Registers the published package with the given tag")
  .option(
    "--access <access>",
    "Tells the registry whether this package should be published as public or restricted",
  )
  .option(
    "--dry-run",
    "Does everything publish would do except actually publishing",
  )
  .option(
    "--pm <manager>",
    "Force a specific package manager (npm, yarn, pnpm)",
  )
  .action(async (options) => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const packageJsonContent = await fs.readFile(pkgJsonPath, {
        encoding: "utf8",
      });

      const packageJson: PackageJson = JSON.parse(packageJsonContent);
      const publishDirBase = packageJson.publishConfig?.directory;

      if (!publishDirBase) {
        throw new Error(
          `No publish directory specified in "${packageJson.name}" package.json. Specify it in the "publishConfig.directory" field.`,
        );
      }

      const publishDir = path.join(cwd, publishDirBase);
      const dirExists = await fs.stat(publishDir).then(
        (stats) => stats.isDirectory(),
        () => false,
      );

      if (!dirExists) {
        throw new Error(
          `Publish directory "${publishDir}" does not exist. Please run the build command first.`,
        );
      }

      const pm = options.pm || getPackageManager();
      if (isVerbose) {
        console.log(
          chalk.blue(
            `🚀 Publishing via ${pm.toUpperCase()} from directory: ${publishDirBase}`,
          ),
        );
      }

      const args = ["publish"];
      if (options.tag) args.push("--tag", options.tag);
      if (options.access) args.push("--access", options.access);
      if (options.dryRun) args.push("--dry-run");

      if (
        pm === "yarn" &&
        !process.env.npm_config_user_agent?.includes("yarn/3") &&
        !process.env.npm_config_user_agent?.includes("yarn/4")
      ) {
        args.push("--non-interactive");
      }

      await $({
        stdio: "inherit",
        cwd: publishDir,
      })`${pm} ${args}`;

      console.log(chalk.green("✅ Successfully published!"));
    } catch (error) {
      console.error(chalk.red("❌ Error executing publish command:"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
