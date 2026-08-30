import { describe, expect, it } from "vitest";
import { createDemoDiagram } from "../src/domain/seed";
import { createHistory, pushHistory, redo, undo } from "../src/editor/history";
import { renameDiagram } from "../src/editor/commands";
import { LocalStorageDiagramRepository } from "../src/persistence/local-storage";
import { diagramsHaveSameContent } from "../src/editor/store";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe("history and repository", () => {
  it("undoes, redoes, clears redo and applies the history limit", () => {
    const before = createDemoDiagram();
    const after = renameDiagram(before, { name: "新版" });
    let history = pushHistory(createHistory(1), {
      label: "重命名",
      before,
      after,
    });
    const undone = undo(history, after)!;
    expect(undone.diagram.name).toBe(before.name);
    const redone = redo(undone.history, undone.diagram)!;
    expect(redone.diagram.name).toBe("新版");
    history = pushHistory(undone.history, {
      label: "新命令",
      before: undone.diagram,
      after,
    });
    expect(history.future).toHaveLength(0);
    expect(history.past).toHaveLength(1);
  });
  it("persists, detects revision conflicts and handles drafts", async () => {
    const repo = new LocalStorageDiagramRepository(new MemoryStorage());
    const created = await repo.create({ name: "持久化测试" });
    const saved = await repo.save(
      renameDiagram(created, { name: "已保存" }),
      created.revision,
    );
    expect(saved.revision).toBe(created.revision + 1);
    await expect(repo.save(saved, created.revision)).rejects.toThrow(
      "PERSISTENCE_CONFLICT",
    );
    const draft = renameDiagram(saved, { name: "草稿" });
    await repo.saveDraft(draft);
    expect((await repo.getDraft(saved.id))?.diagram.name).toBe("草稿");
    await repo.deleteDraft(saved.id);
    expect(await repo.getDraft(saved.id)).toBeNull();
  });
  it("migrates the legacy pathway namespace without deleting it", async () => {
    const storage = new MemoryStorage();
    const diagram = createDemoDiagram();
    const legacySummary = [{
      id: diagram.id,
      name: diagram.name,
      description: diagram.description,
      revision: diagram.revision,
      updatedAt: diagram.updatedAt,
      nodeCount: diagram.nodes.length,
      pathwayCount: diagram.pathways.length,
    }];
    storage.setItem("pathway:v1:index", JSON.stringify(legacySummary));
    storage.setItem(`pathway:v1:diagram:${diagram.id}`, JSON.stringify(diagram));

    const repo = new LocalStorageDiagramRepository(storage);

    expect((await repo.get(diagram.id)).name).toBe(diagram.name);
    expect(storage.getItem("bochupath:v1:index")).toBeTruthy();
    expect(storage.getItem(`bochupath:v1:diagram:${diagram.id}`)).toBeTruthy();
    expect(storage.getItem("pathway:v1:index")).toBeTruthy();
  });
  it("compares saved factual content without revision metadata noise", () => {
    const saved = createDemoDiagram();
    const sameContent = {
      ...structuredClone(saved),
      revision: 99,
      updatedAt: "2030-01-01T00:00:00.000Z",
    };
    expect(diagramsHaveSameContent(saved, sameContent)).toBe(true);
    sameContent.name = "已修改";
    expect(diagramsHaveSameContent(saved, sameContent)).toBe(false);
  });
});
