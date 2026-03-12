import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { PackageJson } from "./packageJson";

// Helper to recursively calculate directory size
async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  const files = await fs.readdir(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stats = await fs.stat(fullPath);
      size += stats.size;
    }
  }
  return size;
}

export const infoCommand = new Command("info")
  .description("Displays size and file statistics of the built package")
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

      const sizeBytes = await getDirSize(publishDir);
      const sizeKB = (sizeBytes / 1024).toFixed(2);
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

      console.log(`\n📊 Package Info: ${packageJson.name}`);
      console.log(`================================`);
      console.log(`Version:       ${packageJson.version}`);
      console.log(`Build Folder:  ./${publishDirBase}`);

      if (sizeBytes > 1024 * 1024) {
        console.log(
          `Total Size:    ${sizeMB} MB ⚠️ (Consider keeping packages under 1MB)`,
        );
      } else {
        console.log(`Total Size:    ${sizeKB} KB ✅`);
      }
      console.log(`================================\n`);
    } catch (error) {
      console.error(
        "❌ Error fetching package info. Did you build the project first?",
      );
      process.exit(1);
    }
  });
