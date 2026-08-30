import { assertValid, DomainError, errorMessages } from '../domain/rules';
import { createBlankDiagram, createDemoDiagram, DEMO_DIAGRAM_ID, newId } from '../domain/seed';
import { parseDiagram } from '../domain/schema';
import type { Diagram, DiagramSummary } from '../domain/types';
import type { DiagramRepository, DraftRecord, NewDiagramInput } from './repository';
import { getBrowserStorage } from './browser-storage';

const INDEX_KEY = 'bochupath:v1:index';
const LEGACY_INDEX_KEY = 'pathway:v1:index';
const diagramKey = (id: string) => `bochupath:v1:diagram:${id}`;
const draftKey = (id: string) => `bochupath:v1:draft:${id}`;
const legacyDiagramKey = (id: string) => `pathway:v1:diagram:${id}`;
const legacyDraftKey = (id: string) => `pathway:v1:draft:${id}`;

function persistenceError(code: 'PERSISTENCE_CONFLICT' | 'PERSISTENCE_FAILED'): DomainError { return new DomainError({ code, message: errorMessages[code] }); }
function summary(diagram: Diagram): DiagramSummary { return { id: diagram.id, name: diagram.name, description: diagram.description, revision: diagram.revision, updatedAt: diagram.updatedAt, nodeCount: diagram.nodes.length, pathwayCount: diagram.pathways.length }; }

export class LocalStorageDiagramRepository implements DiagramRepository {
  constructor(private storage: Storage = getBrowserStorage()) { this.migrateLegacyData(); this.ensureSeed(); }
  private migrateLegacyData(): void {
    try {
      if (this.storage.getItem(INDEX_KEY) !== null) return;
      const legacyRaw = this.storage.getItem(LEGACY_INDEX_KEY);
      if (!legacyRaw) return;
      const legacyItems = JSON.parse(legacyRaw) as DiagramSummary[];
      legacyItems.forEach(({ id }) => {
        const diagram = this.storage.getItem(legacyDiagramKey(id));
        const draft = this.storage.getItem(legacyDraftKey(id));
        if (diagram !== null) this.storage.setItem(diagramKey(id), diagram);
        if (draft !== null) this.storage.setItem(draftKey(id), draft);
      });
      this.storage.setItem(INDEX_KEY, legacyRaw);
    } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  private ensureSeed(): void {
    try {
      if (this.storage.getItem(INDEX_KEY) === null) { const demo = createDemoDiagram(); this.storage.setItem(diagramKey(demo.id), JSON.stringify(demo)); this.storage.setItem(INDEX_KEY, JSON.stringify([summary(demo)])); }
    } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  private readIndex(): DiagramSummary[] {
    try { const raw = this.storage.getItem(INDEX_KEY); return raw ? JSON.parse(raw) as DiagramSummary[] : []; } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  private writeIndex(items: DiagramSummary[]): void { try { this.storage.setItem(INDEX_KEY, JSON.stringify(items)); } catch { throw persistenceError('PERSISTENCE_FAILED'); } }
  async list(): Promise<DiagramSummary[]> { return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string): Promise<Diagram> {
    try { const raw = this.storage.getItem(diagramKey(id)); if (!raw) throw persistenceError('PERSISTENCE_FAILED'); return assertValid(parseDiagram(JSON.parse(raw))); }
    catch (error) { if (error instanceof DomainError) throw error; throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async create(input: NewDiagramInput): Promise<Diagram> {
    const diagram = createBlankDiagram(input.name); diagram.description = input.description?.trim() || undefined; diagram.revision = 1;
    try { this.storage.setItem(diagramKey(diagram.id), JSON.stringify(diagram)); this.writeIndex([...this.readIndex(), summary(diagram)]); return structuredClone(diagram); }
    catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async save(diagram: Diagram, expectedRevision: number): Promise<Diagram> {
    const valid = assertValid(structuredClone(diagram)); let stored: Diagram;
    try { stored = await this.get(valid.id); } catch { throw persistenceError('PERSISTENCE_FAILED'); }
    if (stored.revision !== expectedRevision) throw persistenceError('PERSISTENCE_CONFLICT');
    const saved = { ...valid, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    try { this.storage.setItem(diagramKey(saved.id), JSON.stringify(saved)); this.writeIndex([...this.readIndex().filter((x) => x.id !== saved.id), summary(saved)]); await this.deleteDraft(saved.id); return structuredClone(saved); }
    catch (error) { if (error instanceof DomainError) throw error; throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async duplicate(id: string, name: string): Promise<Diagram> {
    const source = await this.get(id); const now = new Date().toISOString(); const copy = { ...structuredClone(source), id: newId('diagram'), name: name.trim(), revision: 1, createdAt: now, updatedAt: now };
    try { this.storage.setItem(diagramKey(copy.id), JSON.stringify(copy)); this.writeIndex([...this.readIndex(), summary(copy)]); return copy; } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async delete(id: string): Promise<void> {
    if (id === DEMO_DIAGRAM_ID && this.readIndex().length === 1) throw persistenceError('PERSISTENCE_FAILED');
    try { this.storage.removeItem(diagramKey(id)); this.storage.removeItem(draftKey(id)); this.writeIndex(this.readIndex().filter((x) => x.id !== id)); } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async getDraft(id: string): Promise<DraftRecord | null> {
    try {
      let raw = this.storage.getItem(draftKey(id));
      if (!raw) {
        raw = this.storage.getItem(legacyDraftKey(id));
        if (raw) this.storage.setItem(draftKey(id), raw);
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DraftRecord;
      return { savedAt: parsed.savedAt, diagram: assertValid(parseDiagram(parsed.diagram)) };
    } catch { throw persistenceError('PERSISTENCE_FAILED'); }
  }
  async saveDraft(diagram: Diagram): Promise<void> { try { this.storage.setItem(draftKey(diagram.id), JSON.stringify({ diagram, savedAt: new Date().toISOString() } satisfies DraftRecord)); } catch { throw persistenceError('PERSISTENCE_FAILED'); } }
  async deleteDraft(id: string): Promise<void> { try { this.storage.removeItem(draftKey(id)); } catch { throw persistenceError('PERSISTENCE_FAILED'); } }
}
