import { describe, expect, it } from "vitest";
import { isPageDropRuntime } from "../src/app/runtime";
import { createDemoDiagram } from "../src/domain/seed";
import { renameDiagram } from "../src/editor/commands";
import {
  PageDropDiagramRepository,
  type BochuPathSharedState,
  type SharedJsonClient,
} from "../src/persistence/pagedrop";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

class FakeSharedJsonClient implements SharedJsonClient {
  constructor(public state: unknown) {}
  async load(): Promise<unknown> { return structuredClone(this.state); }
  async save(state: BochuPathSharedState): Promise<void> {
    this.state = structuredClone(state);
  }
}

function initialState(): BochuPathSharedState {
  return {
    schemaVersion: "1.1",
    revision: 1,
    updatedAt: "2026-08-30T00:00:00.000Z",
    lastMutationId: "seed_v1",
    diagrams: [createDemoDiagram()],
  };
}

describe("PageDrop shared repository", () => {
  it("loads V1.0 shared JSON and writes V1.1 after the next save", async () => {
    const current = createDemoDiagram();
    const legacyDiagram = {
      ...current,
      schemaVersion: "1.0",
      pathways: current.pathways.map(({ nodeIds, ...pathway }) => ({
        ...pathway,
        steps: nodeIds.map((nodeId, index) => ({ id: `step_${index}`, nodeId, order: (index + 1) * 10 })),
      })),
    };
    const client = new FakeSharedJsonClient({
      schemaVersion: "1.0",
      revision: 1,
      updatedAt: "2026-08-30T00:00:00.000Z",
      lastMutationId: "legacy",
      diagrams: [legacyDiagram],
    });
    const repository = new PageDropDiagramRepository(client, new MemoryStorage());
    const loaded = await repository.get("diagram_demo");
    expect(loaded.schemaVersion).toBe("1.1");
    expect(loaded.pathways[0]?.nodeIds).toEqual(current.pathways[0]?.nodeIds);
    await repository.save(renameDiagram(loaded, { name: "已迁移" }), loaded.revision);
    expect((client.state as BochuPathSharedState).schemaVersion).toBe("1.1");
  });

  it("shares saved diagrams and detects a stale collaborator", async () => {
    const client = new FakeSharedJsonClient(initialState());
    const alice = new PageDropDiagramRepository(client, new MemoryStorage());
    const bob = new PageDropDiagramRepository(client, new MemoryStorage());
    const aliceCopy = await alice.get("diagram_demo");
    const bobCopy = await bob.get("diagram_demo");

    const saved = await alice.save(
      renameDiagram(aliceCopy, { name: "Alice 已保存" }),
      aliceCopy.revision,
    );

    expect((await bob.get("diagram_demo")).name).toBe("Alice 已保存");
    expect(saved.revision).toBe(2);
    await expect(
      bob.save(
        renameDiagram(bobCopy, { name: "Bob 的旧版本" }),
        bobCopy.revision,
      ),
    ).rejects.toThrow("PERSISTENCE_CONFLICT");
  });

  it("shares created diagrams but keeps drafts per browser", async () => {
    const client = new FakeSharedJsonClient(initialState());
    const alice = new PageDropDiagramRepository(client, new MemoryStorage());
    const bob = new PageDropDiagramRepository(client, new MemoryStorage());

    const created = await alice.create({ name: "协作新图" });
    expect((await bob.list()).some((item) => item.id === created.id)).toBe(true);

    await alice.saveDraft(renameDiagram(created, { name: "Alice 本地草稿" }));
    expect((await alice.getDraft(created.id))?.diagram.name).toBe("Alice 本地草稿");
    expect(await bob.getDraft(created.id)).toBeNull();
  });

  it("imports a Diagram as a new shared diagram", async () => {
    const client = new FakeSharedJsonClient(initialState());
    const repository = new PageDropDiagramRepository(client, new MemoryStorage());
    const source = createDemoDiagram();

    const imported = await repository.importDiagram(source);

    expect(imported.id).not.toBe(source.id);
    expect(imported.revision).toBe(1);
    expect((await repository.list()).filter((item) => item.name === source.name)).toHaveLength(2);
  });
});

describe("PageDrop runtime detection", () => {
  it("recognizes both the public host and an injected file route", () => {
    expect(isPageDropRuntime({ hostname: "pagedrop.fscut.com", pathname: "/page/id" })).toBe(true);
    expect(isPageDropRuntime({ hostname: "localhost", pathname: "/api/link/id/files/index.html" })).toBe(true);
    expect(isPageDropRuntime({ hostname: "localhost", pathname: "/diagrams" })).toBe(false);
  });
});
