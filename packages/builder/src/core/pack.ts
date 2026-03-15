import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import chalk from "chalk";
import { PackageJson } from "./packageJson";
import { getPackageManager } from "../utils/package-manager";

export const packCommand = new Command("pack")
  .description(
    "Creates a tarball (.tgz) of the built package to inspect before publishing",
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
          chalk.blue(`📦 Packing package from directory: ${publishDirBase}...`),
        );

      await $({
        stdio: "inherit",
        cwd: publishDir,
      })`${pm} pack`;

      console.log(
        chalk.green(
          "✅ Pack successful! You can inspect the generated .tgz file.",
        ),
      );
    } catch (error) {
      console.error(chalk.red("❌ Error executing pack command:"));
      if (error instanceof Error) console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
