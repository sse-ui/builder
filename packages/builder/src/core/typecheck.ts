import { Command } from "commander";
import { $ } from "execa";

export const typecheckCommand = new Command("typecheck")
  .description(
    "Runs TypeScript validation across the project without emitting files",
  )
  .option("--watch", "Run typechecking in watch mode")
  .action(async (options) => {
    const isVerbose = process.env.SSE_BUILD_VERBOSE === "true";
    if (isVerbose) console.log("🔍 Running typecheck...");

    try {
      const args = ["tsc", "--noEmit"];
      if (options.watch) {
        args.push("--watch");
      }

      await $({ stdio: "inherit" })`${args.join(" ")}`;
      if (!options.watch) {
        console.log("✅ Typecheck passed! No errors found.");
      }
    } catch (error) {
      console.error(
        "❌ Typecheck failed. Please fix the TypeScript errors above.",
      );
      process.exit(1);
    }
  });
