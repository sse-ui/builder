import * as path from "node:path";
import { Command } from "commander";
import chokidar from "chokidar";
import { $ } from "execa";

export const watchCommand = new Command("watch")
  .description(
    "Watches the src directory and rebuilds automatically on changes",
  )
  .action(() => {
    const cwd = process.cwd();
    const srcDir = path.join(cwd, "src");

    console.log(`👀 Watching for changes in ./src...`);

    let isBuilding = false;
    let buildQueued = false;

    const runBuild = async () => {
      if (isBuilding) {
        buildQueued = true;
        return;
      }
      isBuilding = true;
      console.log(`\n⏳ Detected changes. Rebuilding...`);

      try {
        // Calls your own CLI's build command natively
        await $({ stdio: "inherit" })`npx sse-tools build`;
        console.log(`✅ Build updated successfully! Waiting for changes...`);
      } catch (err) {
        console.error(`❌ Build failed during watch.`);
      } finally {
        isBuilding = false;
        if (buildQueued) {
          buildQueued = false;
          runBuild();
        }
      }
    };

    // Initialize watcher
    const watcher = chokidar.watch(srcDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't trigger on startup
    });

    watcher.on("add", runBuild).on("change", runBuild).on("unlink", runBuild);
  });
