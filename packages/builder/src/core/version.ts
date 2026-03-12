import { Command } from "commander";
import { $ } from "execa";

export const versionCommand = new Command("version")
  .description("Bumps the package version (patch, minor, or major)")
  .argument(
    "<type>",
    "Version update type (patch, minor, major, or specific version like 1.2.3)",
  )
  .option("--no-git-tag-version", "Do not create a git tag")
  .action(async (type, options) => {
    const validTypes = [
      "patch",
      "minor",
      "major",
      "prepatch",
      "preminor",
      "premajor",
      "prerelease",
    ];

    // Basic validation to ensure they pass a valid type or a specific version number
    if (!validTypes.includes(type) && !/^\d+\.\d+\.\d+/.test(type)) {
      console.error(
        `❌ Invalid version type: ${type}. Use patch, minor, major, or a valid semver.`,
      );
      process.exit(1);
    }

    console.log(`📈 Bumping version (${type})...`);

    try {
      const args = ["version", type];
      if (!options.gitTagVersion) {
        args.push("--no-git-tag-version");
      }

      // Execute version bump
      await $({ stdio: "inherit" })`npm ${args}`;
      console.log("✅ Version bumped successfully!");
    } catch (error) {
      console.error("❌ Failed to bump version.");
      process.exit(1);
    }
  });
