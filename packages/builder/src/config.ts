import { BuildOptions } from "./core/build";

export type { BuildOptions };

/**
 * Helper to provide autocomplete and type checking for the sse-tools config.
 */
export function defineConfig(
  config: Partial<BuildOptions>,
): Partial<BuildOptions> {
  return config;
}
