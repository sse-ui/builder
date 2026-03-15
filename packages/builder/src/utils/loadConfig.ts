import { loadConfig as loadC12Config } from "c12";
import { BuildConfig } from "../config";

export async function loadConfig(): Promise<BuildConfig> {
  try {
    const { config, configFile } = await loadC12Config<BuildConfig>({
      name: "sse",
      rcFile: false,
      globalRc: false,
    });

    if (
      configFile &&
      (config?.verbose || process.env.SSE_BUILD_VERBOSE === "true")
    ) {
      console.log(`📝 Loaded config from ${configFile}`);
    }

    return config || {};
  } catch (error) {
    console.error(`❌ Failed to parse configuration:`);
    console.error(error);
    process.exit(1);
  }
}
