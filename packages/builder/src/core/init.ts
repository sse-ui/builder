import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import enquirer from "enquirer";
import chalk from "chalk";
import { $ } from "execa";
import { findWorkspacesRoot } from "find-workspaces";
import { getPackageManager } from "../utils/package-manager";
import { PackageJson } from "./packageJson";

export const initCommand = new Command("init")
  .description("Initializes the package with the required configuration files")
  .action(async () => {
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, "package.json");

    try {
      const pkgExists = await fs
        .stat(pkgJsonPath)
        .then(() => true)
        .catch(() => false);

      if (!pkgExists) {
        throw new Error("No package.json found in the current directory.");
      }

      const packageJsonContent = await fs.readFile(pkgJsonPath, "utf8");
      const packageJson: PackageJson = JSON.parse(packageJsonContent);

      const { builder } = await enquirer.prompt<{
        builder: "babel" | "esbuild";
      }>({
        type: "select",
        name: "builder",
        message: "Which bundler would you like to use?",
        choices: ["babel", "esbuild"],
      });

      const { buildDir } = await enquirer.prompt<{ buildDir: string }>({
        type: "input",
        name: "buildDir",
        message: "What is your build output directory?",
        initial: "build",
      });

      const { dts } = await enquirer.prompt<{ dts: string }>({
        type: "confirm",
        name: "dts",
        message: "Want .d.ts output also",
        initial: true,
      });

      let esbuildEntry = "src/index.ts";
      if (builder === "esbuild") {
        const response = await enquirer.prompt<{ entry: string }>({
          type: "input",
          name: "entry",
          message: "What is your esbuild entry point?",
          initial: "src/index.ts",
        });
        esbuildEntry = response.entry;
      }

      console.log(chalk.blue("\n⚙️  Applying configuration..."));
      packageJson.publishConfig = packageJson.publishConfig || {};
      packageJson.publishConfig.directory = buildDir;

      await fs.writeFile(
        pkgJsonPath,
        JSON.stringify(packageJson, null, 2) + "\n",
        "utf8",
      );

      console.log(
        chalk.gray(
          `📝 Updated publishConfig.directory to "${buildDir}" in package.json`,
        ),
      );
      const configPath = path.join(cwd, "sse.config.ts");
      let configContent = `import { defineConfig } from "@sse-ui/builder/config";\n\nexport default defineConfig({\n`;
      if (builder === "esbuild") {
        configContent += `  bundle: ["esm", "cjs"],\n`;
        configContent += `  buildTypes: ${dts},\n`;
        configContent += `  esbuild: {\n    entry: "${esbuildEntry}",\n    external: [],\n  },\n`;
      } else {
        configContent += `  bundle: ["esm", "cjs"],\n`;
        configContent += `  buildTypes: ${dts},\n`;
        configContent += `  babel: {\n  //   enableReactCompiler: false\n  // }\n`;
      }
      configContent += `});\n`;

      await fs.writeFile(configPath, configContent, "utf8");
      console.log(chalk.gray(`📝 Created sse.config.ts`));

      const tsconfigBuildPath = path.join(cwd, "tsconfig.build.json");
      const tsconfigBuildExists = await fs
        .stat(tsconfigBuildPath)
        .then(() => true)
        .catch(() => false);

      if (!tsconfigBuildExists) {
        await fs.writeFile(
          tsconfigBuildPath,
          `{\n  "extends": "./tsconfig.json",\n  "compilerOptions": {
    "types": [],
  }}\n`,
          "utf8",
        );
        console.log(chalk.gray(`📝 Created tsconfig.build.json`));
      }

      if (builder === "babel") {
        const workspaceDir = await findWorkspacesRoot(cwd);
        const rootDir = workspaceDir ? workspaceDir.location : cwd;

        let hasBabelConfig = false;
        for (const ext of [".js", ".mjs"]) {
          if (
            await fs
              .stat(path.join(rootDir, `babel.config${ext}`))
              .then(() => true)
              .catch(() => false)
          ) {
            hasBabelConfig = true;
            break;
          }
        }

        if (!hasBabelConfig) {
          const babelConfigPath = path.join(rootDir, "babel.config.mjs");
          const babelConfigContent = `import getBaseConfig from "@sse-ui/builder/babel-config";

export default function getBabelConfig(api) {
  const baseConfig = getBaseConfig(api);

  return {
    ...baseConfig,
    // Add custom overrides here if needed
  };
}
`;

          await fs.writeFile(babelConfigPath, babelConfigContent, "utf8");
          console.log(
            chalk.gray(
              `📝 Created babel.config.mjs in ${workspaceDir ? "workspace root" : "project root"}`,
            ),
          );
        } else {
          console.log(
            chalk.gray(
              `ℹ️  Babel config already exists in ${workspaceDir ? "workspace root" : "project root"}, skipping creation.`,
            ),
          );
        }

        const pm = getPackageManager();
        console.log(
          chalk.cyan(`\n⏳ Installing @babel/runtime using ${pm}...`),
        );

        try {
          // Dynamic import of ora for the spinner since it's ESM
          const ora = (await import("ora")).default;
          const spinner = ora(`Installing dependencies...`).start();

          if (pm === "yarn") {
            await $`${pm} add @babel/runtime`;
          } else {
            await $`${pm} install @babel/runtime`;
          }

          spinner.succeed("Installed @babel/runtime successfully");
        } catch (installError) {
          // Fallback if ora fails to import or command fails
          console.log(chalk.gray(`Falling back to silent install...`));
          const args =
            pm === "yarn"
              ? ["add", "@babel/runtime"]
              : ["install", "@babel/runtime"];
          await $({ stdio: "ignore" })`${pm} ${args}`;
          console.log(chalk.green(`✅ Installed @babel/runtime successfully`));
        }
      }

      console.log(
        chalk.green.bold(
          "\n✨ Initialization complete! You are ready to build.",
        ),
      );
    } catch (error) {
      console.error(chalk.red("\n❌ Error initializing project:"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  });
