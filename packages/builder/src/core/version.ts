import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import { $ } from "execa";
import enquirer from "enquirer";
import * as semver from "semver";
import { getPackageManager } from "../utils/package-manager";

export const versionCommand = new Command("version")
  .description("Bumps the package version interactively or manually")
  .argument(
    "[type]",
    "Version update type (patch, minor, major, or specific version like 1.2.3). If omitted, an interactive prompt will appear.",
  )
  .option("--no-git-tag-version", "Do not create a git tag")
  .action(async (type, options) => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    const pm = getPackageManager();
    const cwd = process.cwd();

    const validTypes = [
      "patch",
      "minor",
      "major",
      "prepatch",
      "preminor",
      "premajor",
      "prerelease",
    ] as const;

    let selectedType = type;

    // If no type was passed in the CLI, trigger the enquirer prompt
    if (!selectedType) {
      let currentVersion = "0.0.0";

      try {
        const pkgJsonPath = path.join(cwd, "package.json");
        const pkgContent = await fs.readFile(pkgJsonPath, "utf-8");
        currentVersion = JSON.parse(pkgContent).version || "0.0.0";
      } catch (err) {
        if (isVerbose)
          console.warn(
            "⚠️ Could not read current version from package.json. Defaulting to 0.0.0",
          );
      }

      // Generate formatted choices with predicted next versions
      const choices = validTypes.map((bump) => {
        const nextVersion = semver.inc(currentVersion, bump);
        return {
          name: bump,
          message: `${bump.padEnd(10)} (v${nextVersion})`,
        };
      });

      const { bumpType } = await enquirer.prompt<{ bumpType: string }>({
        type: "select",
        name: "bumpType",
        message: `Current version: ${currentVersion}. Select version bump type:`,
        choices: [...choices, { name: "custom", message: "custom..." }],
      });

      if (bumpType === "custom") {
        const { customVersion } = await enquirer.prompt<{
          customVersion: string;
        }>({
          type: "input",
          name: "customVersion",
          message: "Enter custom version (e.g., 1.2.3):",
          validate: (value) => {
            if (semver.valid(value)) {
              return true;
            }
            return "Please enter a valid semver version (e.g., 1.2.3 or 1.2.3-beta.1)";
          },
        });
        selectedType = customVersion;
      } else {
        selectedType = bumpType;
      }
    } else {
      // Validate the manually provided type
      if (
        !validTypes.includes(selectedType as any) &&
        !semver.valid(selectedType)
      ) {
        console.error(
          `❌ Invalid version type: ${selectedType}. Use patch, minor, major, or a valid semver.`,
        );
        process.exit(1);
      }
    }

    if (isVerbose)
      console.log(`📈 Bumping version (${selectedType}) via ${pm}...`);

    try {
      const args = ["version", selectedType];
      if (!options.gitTagVersion) {
        args.push("--no-git-tag-version");
      }

      await $({ stdio: isVerbose ? "inherit" : "pipe" })`${pm} ${args}`;
      console.log("✅ Version bumped successfully!");
    } catch (error) {
      console.error("❌ Failed to bump version.");
      process.exit(1);
    }
  });
