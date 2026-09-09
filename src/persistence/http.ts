import { apiRequest, getCurrentUserId } from '../auth/client';
import { assertValid } from '../domain/rules';
import { parseDiagram } from '../domain/schema';
import type { Diagram, DiagramSummary } from '../domain/types';
import { getBrowserStorage } from './browser-storage';
import type { DiagramRepository, DraftRecord, NewDiagramInput } from './repository';

/** No fallback to writable PageDrop/local data if the secure service is unavailable. */
export class HttpDiagramRepository implements DiagramRepository {
  private revisions = new Map<string, number>();
  constructor(private storage: Storage = getBrowserStorage()) {}

  private remember(diagram: Diagram): Diagram {
    const parsed = assertValid(parseDiagram(diagram));
    this.revisions.set(parsed.id, parsed.revision);
    return parsed;
  }
  async list(): Promise<DiagramSummary[]> {
    const items = await apiRequest<DiagramSummary[]>('/diagrams');
    items.forEach(item => this.revisions.set(item.id, item.revision));
    return items;
  }
  async get(id: string): Promise<Diagram> {
    return this.remember(await apiRequest<Diagram>(`/diagrams/${encodeURIComponent(id)}`));
  }
  async create(input: NewDiagramInput): Promise<Diagram> {
    return this.remember(await apiRequest<Diagram>('/diagrams', { method: 'POST', body: JSON.stringify(input) }));
  }
  async importDiagram(diagram: Diagram): Promise<Diagram> {
    return this.remember(await apiRequest<Diagram>('/diagrams/import', { method: 'POST', body: JSON.stringify({ diagram }) }));
  }
  async save(diagram: Diagram, expectedRevision: number): Promise<Diagram> {
    const draftKey = this.draftKey(diagram.id);
    const saved = this.remember(await apiRequest<Diagram>(`/diagrams/${encodeURIComponent(diagram.id)}`, {
      method: 'PUT', headers: { 'If-Match': String(expectedRevision) }, body: JSON.stringify({ ...diagram, revision: expectedRevision }),
    }));
    // A command can have produced a newer draft while this request was pending.
    const current = this.storage.getItem(draftKey);
    if (current) {
      try {
        if (JSON.stringify((JSON.parse(current) as DraftRecord).diagram) === JSON.stringify(diagram)) this.storage.removeItem(draftKey);
      } catch { /* Keep unrecognized draft data available for manual recovery. */ }
    }
    return saved;
  }
  async duplicate(id: string, name: string): Promise<Diagram> {
    return this.remember(await apiRequest<Diagram>(`/diagrams/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST', body: JSON.stringify({ name }),
    }));
  }
  async delete(id: string): Promise<void> {
    // Prefer the version the user actually viewed, so a later update is not silently deleted.
    const revision = this.revisions.get(id) ?? (await this.get(id)).revision;
    const draftKey = this.draftKey(id);
    await apiRequest(`/diagrams/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'If-Match': String(revision) } });
    this.storage.removeItem(draftKey);
    this.revisions.delete(id);
  }
  private draftKey(id: string): string {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('登录后才能访问个人草稿');
    return `bochupath:v2:draft:${encodeURIComponent(userId)}:${encodeURIComponent(id)}`;
  }
  async getDraft(id: string): Promise<DraftRecord | null> {
    const raw = this.storage.getItem(this.draftKey(id));
    if (!raw) return null;
    const record = JSON.parse(raw) as DraftRecord;
    return { savedAt: record.savedAt, diagram: assertValid(parseDiagram(record.diagram)) };
  }
  async saveDraft(diagram: Diagram): Promise<void> {
    this.storage.setItem(this.draftKey(diagram.id), JSON.stringify({ diagram, savedAt: new Date().toISOString() }));
  }
  async deleteDraft(id: string): Promise<void> { this.storage.removeItem(this.draftKey(id)); }
}
