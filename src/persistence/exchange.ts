import { assertValid, DomainError, errorMessages } from "../domain/rules";
import { parseDiagram } from "../domain/schema";
import type { Diagram } from "../domain/types";

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

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

export type DiagramFileSaveResult = "saved" | "downloaded" | "cancelled";

/**
 * Save through the native file picker when the browser exposes it. The
 * download fallback keeps the export usable in browsers without the File
 * System Access API.
 */
export async function saveDiagramFile(diagram: Diagram): Promise<DiagramFileSaveResult> {
  const json = serializeDiagram(diagram);
  const suggestedName = `${safeDiagramFileName(diagram.name)}.json`;
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: "BochuPath 通路图 JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "downloaded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
