import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import chalk from "chalk";
import { PackageJson } from "./packageJson";
import { getPackageManager } from "../utils/package-manager";

export const linkCommand = new Command("link")
  .description(
    "Symlinks the built package directory so it can be tested in other local projects",
  )
  .action(async () => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    const pm = getPackageManager();
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const packageJsonContent = await fs.readFile(pkgJsonPath, {
        encoding: "utf8",
      });

      const packageJson: PackageJson = JSON.parse(packageJsonContent);
      const publishDirBase = packageJson.publishConfig?.directory;
      if (!publishDirBase) {
        throw new Error(`No publish directory specified in package.json.`);
      }

      const publishDir = path.join(cwd, publishDirBase);
      if (isVerbose)
        console.log(
          chalk.blue(`🔗 Linking package from: ./${publishDirBase}...`),
        );

      await $({
        stdio: isVerbose ? "inherit" : "pipe",
        cwd: publishDir,
      })`${pm} link`;

      console.log(chalk.green(`\n✅ Successfully linked!`));
      console.log(
        `To use this in another project, go to that project and run:`,
      );
      console.log(chalk.cyan(`👉 ${pm} link ${packageJson.name}`));
    } catch (error) {
      console.error(chalk.red("❌ Error executing link command:"));
      if (error instanceof Error) console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
