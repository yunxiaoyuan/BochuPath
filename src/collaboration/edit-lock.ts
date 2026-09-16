import { z } from "zod";
import { isPageDropRuntime } from "../app/runtime";

export const BOCHUPATH_LOCK_FILE = "bochupath-locks.json";
export const EDIT_LOCK_HEARTBEAT_MS = 15_000;
export const EDIT_LOCK_TTL_MS = 60_000;
export const EDITOR_NAME_STORAGE_KEY = "bochupath:static-editor-name";
const SESSION_STORAGE_KEY = "bochupath:static-editor-session";
let memorySessionId = "";

export interface DiagramEditLock {
  diagramId: string;
  sessionId: string;
  editorName: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface EditLockState {
  schemaVersion: "1.0";
  revision: number;
  updatedAt: string;
  lastMutationId: string;
  locks: Record<string, DiagramEditLock>;
}

export type AcquireLockResult =
  | { status: "owned"; lock: DiagramEditLock }
  | { status: "blocked"; lock: DiagramEditLock };

interface PageDropSdk {
  loadJSON(path: string): Promise<unknown>;
  saveJSON(path: string, data: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    __PAGEDROP__?: PageDropSdk;
  }
}

export interface EditLockJsonClient {
  load(): Promise<unknown>;
  save(state: EditLockState): Promise<void>;
}

const lockSchema = z.object({
  diagramId: z.string().min(1),
  sessionId: z.string().min(1),
  editorName: z.string().trim().min(1).max(20),
  acquiredAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const lockStateSchema = z.object({
  schemaVersion: z.literal("1.0"),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  lastMutationId: z.string(),
  locks: z.record(z.string(), lockSchema),
});

function newIdentifier(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`;
  return `${prefix}_${random}`;
}

function parseState(input: unknown): EditLockState {
  return lockStateSchema.parse(input) as EditLockState;
}

function isActive(lock: DiagramEditLock | undefined, now: number): lock is DiagramEditLock {
  return Boolean(lock && new Date(lock.expiresAt).getTime() > now);
}

export class BrowserEditLockJsonClient implements EditLockJsonClient {
  private fileUrl(): string {
    return isPageDropRuntime() ? `./${BOCHUPATH_LOCK_FILE}` : `/${BOCHUPATH_LOCK_FILE}`;
  }

  async load(): Promise<unknown> {
    if (window.__PAGEDROP__) return window.__PAGEDROP__.loadJSON(BOCHUPATH_LOCK_FILE);
    const response = await fetch(this.fileUrl(), {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("BOCHUPATH_LOCK_LOAD_FAILED");
    return response.json();
  }

  async save(state: EditLockState): Promise<void> {
    if (window.__PAGEDROP__) {
      await window.__PAGEDROP__.saveJSON(BOCHUPATH_LOCK_FILE, state);
      return;
    }
    const response = await fetch(this.fileUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      credentials: "include",
    });
    if (!response.ok) throw new Error("BOCHUPATH_LOCK_SAVE_FAILED");
  }
}

export class PageDropEditLockRepository {
  constructor(
    private client: EditLockJsonClient = new BrowserEditLockJsonClient(),
    private now: () => number = () => Date.now(),
  ) {}

  async observe(diagramId: string): Promise<DiagramEditLock | null> {
    const state = await this.read();
    const lock = state.locks[diagramId];
    return isActive(lock, this.now()) ? lock : null;
  }

  async acquire(diagramId: string, sessionId: string, editorName: string): Promise<AcquireLockResult> {
    const current = await this.read();
    const now = this.now();
    const existing = current.locks[diagramId];
    if (isActive(existing, now) && existing.sessionId !== sessionId) {
      return { status: "blocked", lock: existing };
    }
    const timestamp = new Date(now).toISOString();
    const lock: DiagramEditLock = {
      diagramId,
      sessionId,
      editorName: editorName.trim(),
      acquiredAt: existing?.sessionId === sessionId ? existing.acquiredAt : timestamp,
      heartbeatAt: timestamp,
      expiresAt: new Date(now + EDIT_LOCK_TTL_MS).toISOString(),
    };
    const confirmed = await this.commit(current, { ...current.locks, [diagramId]: lock });
    const winner = confirmed.locks[diagramId];
    if (isActive(winner, this.now()) && winner.sessionId === sessionId) {
      return { status: "owned", lock: winner };
    }
    if (isActive(winner, this.now())) return { status: "blocked", lock: winner };
    throw new Error("BOCHUPATH_LOCK_CONFLICT");
  }

  async renew(diagramId: string, sessionId: string, editorName: string): Promise<DiagramEditLock | null> {
    const current = await this.read();
    const now = this.now();
    const existing = current.locks[diagramId];
    if (!isActive(existing, now) || existing.sessionId !== sessionId) return null;
    const timestamp = new Date(now).toISOString();
    const lock: DiagramEditLock = {
      ...existing,
      editorName: editorName.trim(),
      heartbeatAt: timestamp,
      expiresAt: new Date(now + EDIT_LOCK_TTL_MS).toISOString(),
    };
    const confirmed = await this.commit(current, { ...current.locks, [diagramId]: lock });
    const winner = confirmed.locks[diagramId];
    return isActive(winner, this.now()) && winner.sessionId === sessionId ? winner : null;
  }

  async verify(diagramId: string, sessionId: string): Promise<boolean> {
    const lock = await this.observe(diagramId);
    return lock?.sessionId === sessionId;
  }

  async release(diagramId: string, sessionId: string): Promise<void> {
    const current = await this.read();
    if (current.locks[diagramId]?.sessionId !== sessionId) return;
    const locks = { ...current.locks };
    delete locks[diagramId];
    await this.commit(current, locks);
  }

  private async read(): Promise<EditLockState> {
    return parseState(await this.client.load());
  }

  private async commit(current: EditLockState, locks: Record<string, DiagramEditLock>): Promise<EditLockState> {
    const mutationId = newIdentifier("lockmutation");
    const next: EditLockState = {
      schemaVersion: "1.0",
      revision: current.revision + 1,
      updatedAt: new Date(this.now()).toISOString(),
      lastMutationId: mutationId,
      locks,
    };
    await this.client.save(next);
    const confirmed = await this.read();
    if (confirmed.lastMutationId !== mutationId) return confirmed;
    return confirmed;
  }
}

let repository: PageDropEditLockRepository | undefined;

export function getEditLockRepository(): PageDropEditLockRepository {
  repository ??= new PageDropEditLockRepository();
  return repository;
}

export function getEditorSessionId(storage?: Storage): string {
  try {
    const target = storage ?? window.sessionStorage;
    const existing = target.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = newIdentifier("editor");
    target.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    memorySessionId ||= newIdentifier("editor");
    return memorySessionId;
  }
}
