import { loadConfig as loadC12Config } from "c12";
import { BuildOptions } from "../config";

export async function loadConfig(): Promise<Partial<BuildOptions>> {
  try {
    const { config, configFile } = await loadC12Config<BuildOptions>({
      name: "sse",
      rcFile: false,
      globalRc: false,
    });

    if (configFile) {
      console.log(`📝 Loaded config from ${configFile}`);
    }

    return config || {};
  } catch (error) {
    console.error(`❌ Failed to parse configuration:`);
    console.error(error);
    process.exit(1);
  }
}
