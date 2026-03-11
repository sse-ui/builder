import { formatName } from "./utils"; // This should be rewritten to ./utils.js or .mjs

export const greet = (name: string) => `Hello, ${formatName(name)}!`;
