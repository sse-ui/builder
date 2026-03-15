import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { globby } from "globby";
import { PackageJson } from "./packageJson";

async function fileExists(filePath: string) {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

// Recursively search the exports object for string paths
function extractPaths(exportsObj: any): string[] {
  let paths: string[] = [];
  if (typeof exportsObj === "string") {
    return [exportsObj];
  }

  if (typeof exportsObj === "object" && exportsObj !== null) {
    for (const key of Object.values(exportsObj)) {
      paths = paths.concat(extractPaths(key));
    }
  }

  return paths;
}

export const checkExportsCommand = new Command("check-exports")
  .description(
    "Verifies that all files declared in package.json 'exports' actually exist in the build folder",
  )
  .action(async () => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const rootPkgContent = await fs.readFile(pkgJsonPath, {
        encoding: "utf8",
      });

      const publishDirBase =
        JSON.parse(rootPkgContent).publishConfig?.directory || "build";

      const buildPkgPath = path.join(cwd, publishDirBase, "package.json");

      if (!(await fileExists(buildPkgPath))) {
        throw new Error(
          `Could not find compiled package.json at ./${publishDirBase}/package.json. Did you build first?`,
        );
      }

      const buildPkgContent = await fs.readFile(buildPkgPath, {
        encoding: "utf8",
      });
      const buildPkg: PackageJson = JSON.parse(buildPkgContent);

      if (!buildPkg.exports) {
        if (isVerbose)
          console.log(chalk.yellow("⚠️ No 'exports' field found to check."));
        return;
      }

      console.log(
        chalk.blue(`🕵️ Checking exports mapping in ./${publishDirBase}...`),
      );

      const allPaths = extractPaths(buildPkg.exports);
      // Remove duplicates just in case multiple conditions point to the same path
      const uniquePaths = Array.from(new Set(allPaths));
      let hasErrors = false;

      const publishDirFullPath = path.join(cwd, publishDirBase);

      for (const relativePath of uniquePaths) {
        // If the path is a glob pattern (contains '*'), check if it matches anything
        if (relativePath.includes("*")) {
          const matchedFiles = await globby(relativePath, {
            cwd: publishDirFullPath,
          });

          if (matchedFiles.length > 0) {
            if (isVerbose)
              console.log(
                chalk.green(`  ✅ Found matches for pattern: ${relativePath}`),
              );
          } else {
            console.error(
              chalk.red(`  ❌ No files match pattern: ${relativePath}`),
            );
            hasErrors = true;
          }
        } else {
          // Exact file check
          const absolutePath = path.join(publishDirFullPath, relativePath);
          const exists = await fileExists(absolutePath);

          if (exists) {
            if (isVerbose)
              console.log(chalk.green(`  ✅ Found: ${relativePath}`));
          } else {
            console.error(chalk.red(`  ❌ Missing: ${relativePath}`));
            hasErrors = true;
          }
        }
      }

      if (hasErrors) {
        console.error(
          chalk.red(
            "\n❌ Export check failed! Some files declared in package.json are missing.",
          ),
        );
        process.exit(1);
      } else {
        console.log(
          chalk.green("\n✨ All exported files are present and accounted for!"),
        );
      }
    } catch (error) {
      if (error instanceof Error) console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
