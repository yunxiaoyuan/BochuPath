import { assertValid, DomainError, errorMessages } from "../domain/rules";
import { parseDiagram } from "../domain/schema";
import type { Diagram } from "../domain/types";

/**
 * Export the Diagram itself rather than a render snapshot. This keeps the
 * exported file portable between the local and PageDrop repositories and
 * makes it usable as a normal Diagram Schema document.
 */
export function serializeDiagram(diagram: Diagram): string {
  return `${JSON.stringify(assertValid(structuredClone(diagram)), null, 2)}\n`;
}

/**
 * Accept the native Diagram export and a small forward-compatible envelope
 * containing a `diagram` property. The latter makes it possible to consume
 * exports produced by integrations without weakening Diagram validation.
 */
export function parseImportedDiagram(input: unknown): Diagram {
  try {
    const candidate = isRecord(input) && "diagram" in input
      ? input.diagram
      : input;
    return assertValid(parseDiagram(candidate));
  } catch {
    throw new DomainError({
      code: "IMPORT_INVALID",
      message: errorMessages.IMPORT_INVALID,
    });
  }
}

export function parseImportedJson(json: string): Diagram {
  try {
    return parseImportedDiagram(JSON.parse(json.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError({
      code: "IMPORT_INVALID",
      message: errorMessages.IMPORT_INVALID,
    });
  }
}

export function safeDiagramFileName(name: string): string {
  const normalized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return (normalized || "未命名通路图").slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
