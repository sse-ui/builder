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
