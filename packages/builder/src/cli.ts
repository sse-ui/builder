#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { buildCommand } from "./core/build";
import { publishCommand } from "./core/publish";
import { cleanCommand } from "./core/clean";
import { typecheckCommand } from "./core/typecheck";
import { packCommand } from "./core/pack";
import { versionCommand } from "./core/version";
import { infoCommand } from "./core/info";
import { linkCommand } from "./core/link";
import { checkExportsCommand } from "./core/check-exports";
import { watchCommand } from "./core/watch";
import { initCommand } from "./core/init";
import { removeCommand } from "./core/remove";

async function main() {
  const program = new Command();

  program
    .name("sse-tools")
    .description(
      chalk.cyan("CLI utilities for managing and building SSE packages"),
    )
    .version("1.0.0")
    .option("-v, --verbose", "Enable verbose logging across all commands");

  program.hook("preAction", (thisCommand) => {
    if (thisCommand.opts().verbose) {
      process.env.SSE_BUILD_VERBOSE = "true";
    }
  });

  program.addCommand(initCommand);
  program.addCommand(buildCommand);
  program.addCommand(publishCommand);
  program.addCommand(cleanCommand);
  program.addCommand(typecheckCommand);
  program.addCommand(packCommand);
  program.addCommand(versionCommand);
  program.addCommand(infoCommand);
  program.addCommand(linkCommand);
  program.addCommand(checkExportsCommand);
  program.addCommand(watchCommand);
  program.addCommand(removeCommand);

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error("Error executing command:");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

main();
