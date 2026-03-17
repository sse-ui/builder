import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import enquirer from "enquirer";
import chalk from "chalk";
import { $ } from "execa";
import { findWorkspacesRoot } from "find-workspaces";
import { getPackageManager } from "../utils/package-manager";
import { PackageJson } from "./packageJson";

export const removeCommand = new Command("remove")
  .description(
    "Removes all configuration files and dependencies added by the init command",
  )
  .action(async () => {
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
        type: "confirm",
        name: "confirm",
        message: chalk.yellow(
          "Are you sure you want to remove all sse-tools configurations and the build directory?",
        ),
        initial: false,
      });

      if (!confirm) {
        console.log(chalk.gray("Operation cancelled."));
        return;
      }

      console.log(
        chalk.blue("\n🧹 Removing configurations and build files..."),
      );

      const configExts = [".ts", ".js", ".mjs", ".cjs"];
      for (const ext of configExts) {
        const configPath = path.join(cwd, `sse.config${ext}`);
        try {
          await fs.unlink(configPath);
          console.log(chalk.gray(`🗑️  Removed sse.config${ext}`));
        } catch (e) {}
      }

      try {
        await fs.unlink(path.join(cwd, "tsconfig.build.json"));
        console.log(chalk.gray(`🗑️  Removed tsconfig.build.json`));
      } catch (e) {}

      try {
        const workspaceDir = await findWorkspacesRoot(cwd);
        const rootDir = workspaceDir ? workspaceDir.location : cwd;
        const babelConfigPath = path.join(rootDir, "babel.config.mjs");

        const content = await fs.readFile(babelConfigPath, "utf8");
        if (content.includes("@sse-ui/builder/babel-config")) {
          await fs.unlink(babelConfigPath);
          console.log(
            chalk.gray(
              `🗑️  Removed babel.config.mjs from ${workspaceDir ? "workspace root" : "project root"}`,
            ),
          );
        }
      } catch (e) {}

      try {
        const packageJsonContent = await fs.readFile(pkgJsonPath, "utf8");
        const packageJson: PackageJson = JSON.parse(packageJsonContent);
        let pkgModified = false;

        // Extract the build directory name (defaulting to 'build')
        const buildDirBase = packageJson.publishConfig?.directory || "build";
        const buildDir = path.join(cwd, buildDirBase);

        // Remove the build directory
        try {
          await fs.rm(buildDir, { recursive: true, force: true });
          console.log(
            chalk.gray(`🗑️  Removed build directory: ./${buildDirBase}`),
          );
        } catch (e) {
          // Ignore if the directory is already deleted or doesn't exist
        }

        // Revert publishConfig.directory in package.json
        if (packageJson.publishConfig?.directory) {
          delete packageJson.publishConfig.directory;
          // If publishConfig is empty, remove it entirely
          if (Object.keys(packageJson.publishConfig).length === 0) {
            delete packageJson.publishConfig;
          }

          pkgModified = true;
          console.log(
            chalk.gray(`📝 Removed publishConfig.directory from package.json`),
          );
        }

        if (pkgModified) {
          await fs.writeFile(
            pkgJsonPath,
            JSON.stringify(packageJson, null, 2) + "\n",
            "utf8",
          );
        }

        // Uninstall @babel/runtime if present
        const hasBabelRuntime =
          packageJson.dependencies?.["@babel/runtime"] ||
          packageJson.devDependencies?.["@babel/runtime"];

        if (hasBabelRuntime) {
          const pm = getPackageManager();
          console.log(
            chalk.cyan(`\n⏳ Uninstalling @babel/runtime using ${pm}...`),
          );

          const args =
            pm === "yarn"
              ? ["remove", "@babel/runtime"]
              : ["uninstall", "@babel/runtime"];

          try {
            const ora = (await import("ora")).default;
            const spinner = ora(`Uninstalling dependencies...`).start();
            await $({ stdio: "ignore" })`${pm} ${args}`;
            spinner.succeed("Uninstalled @babel/runtime successfully");
          } catch (err) {
            console.log(chalk.gray(`Falling back to silent uninstall...`));
            await $({ stdio: "ignore" })`${pm} ${args}`;
            console.log(
              chalk.green(`✅ Uninstalled @babel/runtime successfully`),
            );
          }
        }
      } catch (e) {
        console.error(chalk.red("⚠️ Could not read or update package.json"));
      }

      console.log(chalk.green.bold("\n✨ Clean up complete!"));
    } catch (error) {
      console.error(chalk.red("\n❌ Error removing configuration:"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
