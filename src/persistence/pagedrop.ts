import { z } from "zod";
import { isPageDropRuntime } from "../app/runtime";
import { assertValid, DomainError, errorMessages } from "../domain/rules";
import { createBlankDiagram, DEMO_DIAGRAM_ID, newId } from "../domain/seed";
import { parseDiagram } from "../domain/schema";
import type { Diagram, DiagramSummary } from "../domain/types";
import { getBrowserStorage } from "./browser-storage";
import type {
  DiagramRepository,
  DraftRecord,
  NewDiagramInput,
} from "./repository";

export const BOCHUPATH_SHARED_FILE = "bochupath-data.json";
const draftKey = (id: string) => `bochupath:v1:draft:${id}`;

interface PageDropSdk {
  loadJSON(path: string): Promise<unknown>;
  saveJSON(path: string, data: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    __PAGEDROP__?: PageDropSdk;
  }
}

export interface BochuPathSharedState {
  schemaVersion: "1.1";
  revision: number;
  updatedAt: string;
  lastMutationId: string;
  diagrams: Diagram[];
}

export interface SharedJsonClient {
  load(): Promise<unknown>;
  save(state: BochuPathSharedState): Promise<void>;
}

const sharedStateSchema = z.object({
  schemaVersion: z.union([z.literal("1.0"), z.literal("1.1")]),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  lastMutationId: z.string(),
  diagrams: z.array(z.unknown()).min(1),
});

function persistenceError(
  code: "PERSISTENCE_CONFLICT" | "PERSISTENCE_FAILED",
): DomainError {
  return new DomainError({ code, message: errorMessages[code] });
}

function summary(diagram: Diagram): DiagramSummary {
  return {
    id: diagram.id,
    name: diagram.name,
    description: diagram.description,
    revision: diagram.revision,
    updatedAt: diagram.updatedAt,
    nodeCount: diagram.nodes.length,
    pathwayCount: diagram.pathways.length,
  };
}

function parseSharedState(input: unknown): BochuPathSharedState {
  const state = sharedStateSchema.parse(input);
  return {
    ...state,
    schemaVersion: "1.1",
    diagrams: state.diagrams.map((diagram) =>
      assertValid(parseDiagram(diagram)),
    ),
  };
}

export class BrowserPageDropJsonClient implements SharedJsonClient {
  private fileUrl(): string {
    return isPageDropRuntime()
      ? `./${BOCHUPATH_SHARED_FILE}`
      : `/${BOCHUPATH_SHARED_FILE}`;
  }

  async load(): Promise<unknown> {
    if (window.__PAGEDROP__) {
      return window.__PAGEDROP__.loadJSON(BOCHUPATH_SHARED_FILE);
    }
    const response = await fetch(this.fileUrl(), {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("BOCHUPATH_SHARED_LOAD_FAILED");
    return response.json();
  }

  async save(state: BochuPathSharedState): Promise<void> {
    if (window.__PAGEDROP__) {
      await window.__PAGEDROP__.saveJSON(BOCHUPATH_SHARED_FILE, state);
      return;
    }
    const response = await fetch(this.fileUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      credentials: "include",
    });
    if (!response.ok) throw new Error("BOCHUPATH_SHARED_SAVE_FAILED");
  }
}

export class PageDropDiagramRepository implements DiagramRepository {
  constructor(
    private client: SharedJsonClient = new BrowserPageDropJsonClient(),
    private draftStorage: Storage = getBrowserStorage(),
  ) {}

  private async readState(): Promise<BochuPathSharedState> {
    try {
      return parseSharedState(await this.client.load());
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw persistenceError("PERSISTENCE_FAILED");
    }
  }

  private async commit(
    current: BochuPathSharedState,
    diagrams: Diagram[],
  ): Promise<void> {
    const mutationId = newId("mutation");
    const next: BochuPathSharedState = {
      schemaVersion: "1.1",
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      lastMutationId: mutationId,
      diagrams,
    };
    try {
      await this.client.save(next);
      const confirmed = await this.readState();
      if (confirmed.lastMutationId !== mutationId) {
        throw persistenceError("PERSISTENCE_CONFLICT");
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw persistenceError("PERSISTENCE_FAILED");
    }
  }

  async list(): Promise<DiagramSummary[]> {
    const state = await this.readState();
    return state.diagrams
      .map(summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Diagram> {
    const state = await this.readState();
    const diagram = state.diagrams.find((item) => item.id === id);
    if (!diagram) throw persistenceError("PERSISTENCE_FAILED");
    return structuredClone(diagram);
  }

  async create(input: NewDiagramInput): Promise<Diagram> {
    const state = await this.readState();
    const diagram = createBlankDiagram(input.name);
    diagram.description = input.description?.trim() || undefined;
    diagram.revision = 1;
    await this.commit(state, [...state.diagrams, diagram]);
    return structuredClone(diagram);
  }

  async save(diagram: Diagram, expectedRevision: number): Promise<Diagram> {
    const valid = assertValid(structuredClone(diagram));
    const state = await this.readState();
    const stored = state.diagrams.find((item) => item.id === valid.id);
    if (!stored) throw persistenceError("PERSISTENCE_FAILED");
    if (stored.revision !== expectedRevision) {
      throw persistenceError("PERSISTENCE_CONFLICT");
    }
    const saved = {
      ...valid,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.commit(
      state,
      state.diagrams.map((item) => (item.id === saved.id ? saved : item)),
    );
    await this.deleteDraft(saved.id);
    return structuredClone(saved);
  }

  async duplicate(id: string, name: string): Promise<Diagram> {
    const state = await this.readState();
    const source = state.diagrams.find((item) => item.id === id);
    if (!source) throw persistenceError("PERSISTENCE_FAILED");
    const now = new Date().toISOString();
    const copy = {
      ...structuredClone(source),
      id: newId("diagram"),
      name: name.trim(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.commit(state, [...state.diagrams, copy]);
    return copy;
  }

  async delete(id: string): Promise<void> {
    const state = await this.readState();
    if (id === DEMO_DIAGRAM_ID && state.diagrams.length === 1) {
      throw persistenceError("PERSISTENCE_FAILED");
    }
    if (!state.diagrams.some((item) => item.id === id)) {
      throw persistenceError("PERSISTENCE_FAILED");
    }
    await this.commit(
      state,
      state.diagrams.filter((item) => item.id !== id),
    );
    await this.deleteDraft(id);
  }

  async getDraft(id: string): Promise<DraftRecord | null> {
    try {
      const raw = this.draftStorage.getItem(draftKey(id));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DraftRecord;
      return {
        savedAt: parsed.savedAt,
        diagram: assertValid(parseDiagram(parsed.diagram)),
      };
    } catch {
      throw persistenceError("PERSISTENCE_FAILED");
    }
  }

  async saveDraft(diagram: Diagram): Promise<void> {
    try {
      this.draftStorage.setItem(
        draftKey(diagram.id),
        JSON.stringify({
          diagram,
          savedAt: new Date().toISOString(),
        } satisfies DraftRecord),
      );
    } catch {
      throw persistenceError("PERSISTENCE_FAILED");
    }
  }

  async deleteDraft(id: string): Promise<void> {
    try {
      this.draftStorage.removeItem(draftKey(id));
    } catch {
      throw persistenceError("PERSISTENCE_FAILED");
    }
  }
}
