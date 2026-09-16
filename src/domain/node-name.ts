export function normalizeNodeName(input: string): string {
  return input
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

export function isValidNodeName(input: string): boolean {
  const normalized = normalizeNodeName(input);
  const lines = normalized.split("\n");
  return normalized.length > 0 && normalized.length <= 80 && lines.length <= 2 && lines.every(Boolean);
}

export function singleLineNodeName(input: string): string {
  return normalizeNodeName(input).replace(/\n/g, " ");
}
