/**
 * Auto-detects the package manager currently being used.
 * Looks at the npm_config_user_agent environment variable.
 */
export function getPackageManager(): "npm" | "yarn" | "pnpm" {
  const userAgent = process.env.npm_config_user_agent || "";
  if (userAgent.includes("pnpm")) return "pnpm";
  if (userAgent.includes("yarn")) return "yarn";
  return "npm";
}

/**
 * Gets the executor command for the current package manager.
 * Returns an array so `execa` string interpolation correctly expands arguments.
 */
export function getPmExec(): string[] {
  const pm = getPackageManager();
  if (pm === "pnpm") return ["pnpm", "exec"];
  if (pm === "yarn") return ["yarn"]; // yarn natively runs local bins
  return ["npx"];
}
