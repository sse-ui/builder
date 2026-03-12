import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import { PackageJson } from "./packageJson";

export const linkCommand = new Command("link")
  .description(
    "Symlinks the built package directory so it can be tested in other local projects",
  )
  .action(async () => {
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
      console.log(`🔗 Linking package from: ./${publishDirBase}...`);

      await $({
        stdio: "inherit",
        cwd: publishDir,
      })`npm link`;

      console.log(`\n✅ Successfully linked!`);
      console.log(
        `To use this in another project, go to that project and run:`,
      );
      console.log(`👉 npm link ${packageJson.name}`);
    } catch (error) {
      console.error("❌ Error executing link command:");
      if (error instanceof Error) console.error(error.message);
      process.exit(1);
    }
  });
