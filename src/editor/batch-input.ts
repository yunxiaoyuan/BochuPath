/**
 * Parses compact batch input without treating punctuation inside a name as a
 * separator. Both Chinese/English semicolons and line breaks are supported.
 */
export function parseBatchNames(value: string): string[] {
  return value
    .split(/[;；\r\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
