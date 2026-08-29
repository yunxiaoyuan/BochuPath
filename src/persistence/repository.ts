import type { Diagram, DiagramSummary } from '../domain/types';

export interface NewDiagramInput { name: string; description?: string }
export interface DraftRecord { diagram: Diagram; savedAt: string }
export interface DiagramRepository {
  list(): Promise<DiagramSummary[]>;
  get(id: string): Promise<Diagram>;
  create(input: NewDiagramInput): Promise<Diagram>;
  save(diagram: Diagram, expectedRevision: number): Promise<Diagram>;
  duplicate(id: string, name: string): Promise<Diagram>;
  delete(id: string): Promise<void>;
  getDraft(id: string): Promise<DraftRecord | null>;
  saveDraft(diagram: Diagram): Promise<void>;
  deleteDraft(id: string): Promise<void>;
}
