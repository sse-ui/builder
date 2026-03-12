import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import { PackageJson } from "./packageJson";

export const packCommand = new Command("pack")
  .description(
    "Creates a tarball (.tgz) of the built package to inspect before publishing",
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
      console.log(`📦 Packing package from directory: ${publishDirBase}...`);

      // Run npm pack inside the build directory
      await $({
        stdio: "inherit",
        cwd: publishDir,
      })`npm pack`;

      console.log(
        "✅ Pack successful! You can inspect the generated .tgz file.",
      );
    } catch (error) {
      console.error("❌ Error executing pack command:");
      if (error instanceof Error) console.error(error.message);
      process.exit(1);
    }
  });
