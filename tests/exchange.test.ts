import { describe, expect, it } from "vitest";
import { createDemoDiagram } from "../src/domain/seed";
import { parseImportedJson, safeDiagramFileName, serializeDiagram } from "../src/persistence/exchange";
import { LocalStorageDiagramRepository } from "../src/persistence/local-storage";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("Diagram JSON exchange", () => {
  it("round-trips the complete Diagram fact source", () => {
    const diagram = createDemoDiagram();

    expect(parseImportedJson(serializeDiagram(diagram))).toEqual(diagram);
  });

  it("accepts a migrated legacy Diagram and rejects invalid input", () => {
    const diagram = createDemoDiagram();
    const legacy = {
      ...diagram,
      schemaVersion: "1.0",
      pathways: diagram.pathways.map(({ nodeIds, ...pathway }) => ({
        ...pathway,
        steps: nodeIds.map((nodeId, index) => ({ id: `step_${index}`, nodeId, order: (index + 1) * 10 })),
      })),
    };

    expect(parseImportedJson(JSON.stringify(legacy)).schemaVersion).toBe("1.1");
    expect(() => parseImportedJson("not json")).toThrow("IMPORT_INVALID");
    expect(() => parseImportedJson(JSON.stringify({ schemaVersion: "1.1" }))).toThrow("IMPORT_INVALID");
  });

  it("imports as a new persisted Diagram without reusing identity metadata", async () => {
    const source = createDemoDiagram();
    const repository = new LocalStorageDiagramRepository(new MemoryStorage());

    const imported = await repository.importDiagram(parseImportedJson(serializeDiagram(source)));

    expect(imported.id).not.toBe(source.id);
    expect(imported.revision).toBe(1);
    expect(imported.name).toBe(source.name);
    expect(imported.createdAt).not.toBe(source.createdAt);
    expect((await repository.list()).some((item) => item.id === imported.id)).toBe(true);
    expect((await repository.get(imported.id)).pathways).toEqual(source.pathways);
  });

  it("creates a safe file name for browser export", () => {
    expect(safeDiagramFileName('  需求/交付:*  ')).toBe("需求_交付__");
    expect(safeDiagramFileName("   ")).toBe("未命名通路图");
  });
});
