/**
 * Formats a string by trimming whitespace and capitalizing the first letter.
 * * @param name - The raw name string to format.
 * @returns The formatted name string.
 */
export function formatName(name: string): string {
  if (!name) return "";

  const trimmedName = name.trim();
  if (!trimmedName) return "";

  return (
    trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1).toLowerCase()
  );
}
