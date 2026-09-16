import { describe, expect, it } from "vitest";
import {
  EDIT_LOCK_TTL_MS,
  PageDropEditLockRepository,
  type EditLockJsonClient,
  type EditLockState,
} from "./edit-lock";

function seed(): EditLockState {
  return {
    schemaVersion: "1.0",
    revision: 0,
    updatedAt: "2026-09-16T00:00:00.000Z",
    lastMutationId: "initial",
    locks: {},
  };
}

class MemoryClient implements EditLockJsonClient {
  constructor(public state: EditLockState = seed()) {}
  async load(): Promise<unknown> { return structuredClone(this.state); }
  async save(state: EditLockState): Promise<void> { this.state = structuredClone(state); }
}

describe("PageDropEditLockRepository", () => {
  it("allows one editor and blocks another while the lease is active", async () => {
    const client = new MemoryClient();
    const now = Date.parse("2026-09-16T08:00:00.000Z");
    const repository = new PageDropEditLockRepository(client, () => now);

    const first = await repository.acquire("diagram_1", "session_alice", "Alice");
    const second = await repository.acquire("diagram_1", "session_bob", "Bob");

    expect(first.status).toBe("owned");
    expect(second).toMatchObject({ status: "blocked", lock: { editorName: "Alice" } });
    expect(await repository.verify("diagram_1", "session_alice")).toBe(true);
    expect(await repository.verify("diagram_1", "session_bob")).toBe(false);
  });

  it("renews, releases and lets another editor take an expired lease", async () => {
    const client = new MemoryClient();
    let now = Date.parse("2026-09-16T08:00:00.000Z");
    const repository = new PageDropEditLockRepository(client, () => now);
    await repository.acquire("diagram_1", "session_alice", "Alice");

    now += 15_000;
    const renewed = await repository.renew("diagram_1", "session_alice", "Alice W");
    expect(renewed?.editorName).toBe("Alice W");
    expect(new Date(renewed!.expiresAt).getTime()).toBe(now + EDIT_LOCK_TTL_MS);

    await repository.release("diagram_1", "session_alice");
    expect(await repository.observe("diagram_1")).toBeNull();
    await repository.acquire("diagram_1", "session_alice", "Alice");
    now += EDIT_LOCK_TTL_MS + 1;
    const replacement = await repository.acquire("diagram_1", "session_bob", "Bob");
    expect(replacement).toMatchObject({ status: "owned", lock: { editorName: "Bob" } });
  });
});
