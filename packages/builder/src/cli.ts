#!/usr/bin/env node
import { Command } from "commander";
import { buildCommand } from "./core/build";

async function main() {
  const program = new Command();

  program
    .name("sse-tools")
    .description("CLI utilities for managing and building MUI packages")
    .version("1.0.0");

  program.addCommand(buildCommand);

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
