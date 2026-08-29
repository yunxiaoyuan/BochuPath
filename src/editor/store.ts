import { create } from 'zustand';
import { DomainError, errorMessages, validateDiagram } from '../domain/rules';
import type { Diagram, EditorMode, EditorTool, PathwayDraft, SaveState, Selection } from '../domain/types';
import { createHistory, pushHistory, redo, undo, type HistoryState } from './history';
import type { DiagramCommand } from './commands';
import { getRepository } from '../persistence/local-storage';
import type { DraftRecord } from '../persistence/repository';

let draftTimer: ReturnType<typeof setTimeout> | undefined;

interface EditorState {
  diagram: Diagram | null; baseRevision: number; mode: EditorMode; tool: EditorTool; selection: Selection;
  multiSelectedNodeIds: string[]; focusedPathwayId: string | null; pathwayDraft: PathwayDraft | null;
  saveState: SaveState; history: HistoryState; message: string; loading: boolean; recoverableDraft: DraftRecord | null;
  load: (id: string, mode: EditorMode) => Promise<void>; execute: (label: string, command: DiagramCommand) => boolean;
  setMode: (mode: EditorMode) => void; setTool: (tool: EditorTool) => void; select: (selection: Selection, additive?: boolean) => void;
  focusPathway: (id: string | null) => void; setPathwayDraft: (draft: PathwayDraft | null) => void;
  undo: () => void; redo: () => void; save: () => Promise<void>; recoverDraft: (recover: boolean) => Promise<void>; clearMessage: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  diagram: null, baseRevision: 0, mode: 'edit', tool: 'select', selection: null, multiSelectedNodeIds: [], focusedPathwayId: null,
  pathwayDraft: null, saveState: 'clean', history: createHistory(), message: '', loading: true, recoverableDraft: null,
  load: async (id, mode) => {
    set({ loading: true, mode, message: '' });
    try {
      const repository = getRepository(); const diagram = await repository.get(id); const draft = await repository.getDraft(id);
      const recoverableDraft = draft && new Date(draft.savedAt) > new Date(diagram.updatedAt) ? draft : null;
      set({ diagram, baseRevision: diagram.revision, recoverableDraft, saveState: 'clean', history: createHistory(), selection: { kind: 'diagram', id: diagram.id }, loading: false });
    } catch (error) { set({ loading: false, message: domainMessage(error) }); }
  },
  execute: (label, command) => {
    const state = get(); if (state.mode !== 'edit' || !state.diagram) return false;
    try {
      const before = state.diagram; const after = command(before);
      set({ diagram: after, history: pushHistory(state.history, { label, before, after }), saveState: 'dirty', message: `${label}完成` });
      clearTimeout(draftTimer); draftTimer = setTimeout(() => { void getRepository().saveDraft(after).catch((error) => set({ message: domainMessage(error), saveState: 'saveError' })); }, 500);
      return true;
    } catch (error) { set({ message: domainMessage(error) }); return false; }
  },
  setMode: (mode) => set({ mode, tool: 'select', pathwayDraft: null, message: mode === 'view' ? '已切换到查看模式' : '已切换到编辑模式' }),
  setTool: (tool) => set({ tool, pathwayDraft: tool === 'connectPathway' ? { name: '新通路', nodeIds: [], color: '#2F64F7', lineStyle: 'solid' } : null }),
  select: (selection, additive = false) => {
    const current = get().multiSelectedNodeIds;
    if (selection?.kind === 'node' && additive) { const ids = current.includes(selection.id) ? current.filter((x) => x !== selection.id) : [...current, selection.id]; set({ selection, multiSelectedNodeIds: ids }); }
    else set({ selection, multiSelectedNodeIds: selection?.kind === 'node' ? [selection.id] : [] });
  },
  focusPathway: (id) => set({ focusedPathwayId: id, selection: id ? { kind: 'pathway', id } : null }),
  setPathwayDraft: (pathwayDraft) => set({ pathwayDraft }),
  undo: () => { const state = get(); if (state.mode !== 'edit' || !state.diagram) return; const result = undo(state.history, state.diagram); if (result) set({ ...result, saveState: 'dirty', message: '已撤销' }); },
  redo: () => { const state = get(); if (state.mode !== 'edit' || !state.diagram) return; const result = redo(state.history, state.diagram); if (result) set({ ...result, saveState: 'dirty', message: '已重做' }); },
  save: async () => {
    const state = get(); if (!state.diagram || state.mode !== 'edit') return;
    const issues = validateDiagram(state.diagram); if (issues.length) { set({ message: issues[0]?.message ?? '校验失败', saveState: 'saveError' }); return; }
    set({ saveState: 'saving', message: '正在保存' });
    try { const saved = await getRepository().save(state.diagram, state.baseRevision); set({ diagram: saved, baseRevision: saved.revision, saveState: 'clean', recoverableDraft: null, message: '保存成功', history: createHistory() }); }
    catch (error) { set({ saveState: 'saveError', message: domainMessage(error) }); }
  },
  recoverDraft: async (recover) => {
    const state = get(); if (!state.diagram || !state.recoverableDraft) return;
    if (recover) set({ diagram: state.recoverableDraft.diagram, saveState: 'dirty', history: createHistory(), recoverableDraft: null, message: '已恢复本地草稿' });
    else { await getRepository().deleteDraft(state.diagram.id); set({ recoverableDraft: null, message: '已放弃本地草稿' }); }
  },
  clearMessage: () => set({ message: '' }),
}));

function domainMessage(error: unknown): string {
  if (error instanceof DomainError) return error.issue.message;
  if (error instanceof Error && error.message in errorMessages) return errorMessages[error.message as keyof typeof errorMessages];
  return '操作失败，请稍后重试';
}
