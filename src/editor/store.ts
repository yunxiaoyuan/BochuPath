import { create } from "zustand";
import { DomainError, errorMessages, validateDiagram } from "../domain/rules";
import type {
  Diagram,
  EditorMode,
  EditorTool,
  PathwayDraft,
  SaveState,
  Selection,
} from "../domain/types";
import {
  createHistory,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from "./history";
import type { DiagramCommand } from "./commands";
import { getRepository } from "../persistence/get-repository";
import type { DraftRecord } from "../persistence/repository";

let draftTimer: ReturnType<typeof setTimeout> | undefined;

interface EditorState {
  diagram: Diagram | null;
  savedDiagram: Diagram | null;
  baseRevision: number;
  mode: EditorMode;
  tool: EditorTool;
  selection: Selection;
  multiSelectedNodeIds: string[];
  focusedPathwayId: string | null;
  pathwayDraft: PathwayDraft | null;
  saveState: SaveState;
  history: HistoryState;
  message: string;
  loading: boolean;
  recoverableDraft: DraftRecord | null;
  load: (id: string, mode: EditorMode) => Promise<void>;
  execute: (label: string, command: DiagramCommand) => boolean;
  setMode: (mode: EditorMode) => void;
  setTool: (tool: EditorTool) => void;
  select: (selection: Selection, additive?: boolean) => void;
  focusPathway: (id: string | null) => void;
  setPathwayDraft: (draft: PathwayDraft | null) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  recoverDraft: (recover: boolean) => Promise<void>;
  clearMessage: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  diagram: null,
  savedDiagram: null,
  baseRevision: 0,
  mode: "edit",
  tool: "select",
  selection: null,
  multiSelectedNodeIds: [],
  focusedPathwayId: null,
  pathwayDraft: null,
  saveState: "clean",
  history: createHistory(),
  message: "",
  loading: true,
  recoverableDraft: null,
  load: async (id, mode) => {
    clearTimeout(draftTimer);
    set({ loading: true, mode, message: "" });
    try {
      const repository = getRepository();
      const diagram = await repository.get(id);
      const draft = await repository.getDraft(id);
      const recoverableDraft =
        draft && new Date(draft.savedAt) > new Date(diagram.updatedAt)
          ? draft
          : null;
      set({
        diagram,
        savedDiagram: structuredClone(diagram),
        baseRevision: diagram.revision,
        recoverableDraft,
        saveState: "clean",
        history: createHistory(),
        selection: { kind: "diagram", id: diagram.id },
        loading: false,
      });
    } catch (error) {
      set({ loading: false, message: domainMessage(error) });
    }
  },
  execute: (label, command) => {
    const state = get();
    if (state.mode !== "edit" || !state.diagram) return false;
    try {
      const before = state.diagram;
      const after = command(before);
      if (diagramsHaveSameContent(before, after)) {
        set({ message: "没有可提交的修改" });
        return true;
      }
      const dirty =
        !state.savedDiagram ||
        !diagramsHaveSameContent(after, state.savedDiagram);
      set({
        diagram: after,
        history: pushHistory(state.history, { label, before, after }),
        saveState: dirty ? "dirty" : "clean",
        message: `${label}完成`,
      });
      queueDraft(after, dirty, (error) =>
        set({ message: domainMessage(error), saveState: "saveError" }),
      );
      return true;
    } catch (error) {
      set({ message: domainMessage(error) });
      return false;
    }
  },
  setMode: (mode) => {
    const state = get();
    set({
      mode,
      tool: "select",
      pathwayDraft: null,
      selection:
        state.selection?.kind === "pathwayDraft" && state.diagram
          ? { kind: "diagram", id: state.diagram.id }
          : state.selection,
      message: mode === "view" ? "已切换到查看模式" : "已切换到编辑模式",
    });
  },
  setTool: (tool) => {
    const state = get();
    if (tool === "connectPathway")
      set({
        tool,
        pathwayDraft: {
          name: "新通路",
          nodeIds: [],
          color: "#2F64F7",
          lineStyle: "solid",
        },
        selection: { kind: "pathwayDraft", id: "new" },
        multiSelectedNodeIds: [],
        focusedPathwayId: null,
      });
    else
      set({
        tool,
        pathwayDraft: null,
        selection:
          state.selection?.kind === "pathwayDraft" && state.diagram
            ? { kind: "diagram", id: state.diagram.id }
            : state.selection,
      });
  },
  select: (selection, additive = false) => {
    const state = get();
    const current = state.multiSelectedNodeIds;
    if (selection?.kind === "node" && additive) {
      const ids = current.includes(selection.id)
        ? current.filter((x) => x !== selection.id)
        : [...current, selection.id];
      set({ selection, multiSelectedNodeIds: ids });
    } else {
      const nextNodeIds = selection?.kind === "node" ? [selection.id] : [];
      const sameSelection =
        state.selection?.kind === selection?.kind &&
        state.selection?.id === selection?.id;
      const sameNodes =
        current.length === nextNodeIds.length &&
        current.every((id, index) => id === nextNodeIds[index]);
      if (sameSelection && sameNodes) return;
      set({
        selection,
        multiSelectedNodeIds: nextNodeIds,
      });
    }
  },
  focusPathway: (id) => {
    const state = get();
    if (
      state.focusedPathwayId === id &&
      state.selection?.kind === "pathway" &&
      state.selection.id === id
    )
      return;
    set({
      focusedPathwayId: id,
      selection: id ? { kind: "pathway", id } : null,
      multiSelectedNodeIds: [],
    });
  },
  setPathwayDraft: (pathwayDraft) => set({ pathwayDraft }),
  undo: () => {
    const state = get();
    if (state.mode !== "edit" || !state.diagram) return;
    const result = undo(state.history, state.diagram);
    if (result) {
      const dirty =
        !state.savedDiagram ||
        !diagramsHaveSameContent(result.diagram, state.savedDiagram);
      set({
        ...result,
        saveState: dirty ? "dirty" : "clean",
        message: "已撤销",
      });
      queueDraft(result.diagram, dirty, (error) =>
        set({ message: domainMessage(error), saveState: "saveError" }),
      );
    }
  },
  redo: () => {
    const state = get();
    if (state.mode !== "edit" || !state.diagram) return;
    const result = redo(state.history, state.diagram);
    if (result) {
      const dirty =
        !state.savedDiagram ||
        !diagramsHaveSameContent(result.diagram, state.savedDiagram);
      set({
        ...result,
        saveState: dirty ? "dirty" : "clean",
        message: "已重做",
      });
      queueDraft(result.diagram, dirty, (error) =>
        set({ message: domainMessage(error), saveState: "saveError" }),
      );
    }
  },
  save: async () => {
    const state = get();
    if (!state.diagram || state.mode !== "edit") return;
    const issues = validateDiagram(state.diagram);
    if (issues.length) {
      set({
        message: issues[0]?.message ?? "校验失败",
        saveState: "saveError",
      });
      return;
    }
    clearTimeout(draftTimer);
    set({ saveState: "saving", message: "正在保存" });
    try {
      const saved = await getRepository().save(
        state.diagram,
        state.baseRevision,
      );
      set({
        diagram: saved,
        savedDiagram: structuredClone(saved),
        baseRevision: saved.revision,
        saveState: "clean",
        recoverableDraft: null,
        message: "保存成功",
        history: createHistory(),
      });
    } catch (error) {
      set({ saveState: "saveError", message: domainMessage(error) });
      queueDraft(state.diagram, true, (draftError) =>
        set({ message: domainMessage(draftError), saveState: "saveError" }),
      );
    }
  },
  recoverDraft: async (recover) => {
    const state = get();
    if (!state.diagram || !state.recoverableDraft) return;
    if (recover) {
      const recovered = state.recoverableDraft.diagram;
      const dirty =
        !state.savedDiagram ||
        !diagramsHaveSameContent(recovered, state.savedDiagram);
      set({
        diagram: recovered,
        saveState: dirty ? "dirty" : "clean",
        history: createHistory(),
        recoverableDraft: null,
        message: "已恢复本地草稿",
      });
    } else {
      await getRepository().deleteDraft(state.diagram.id);
      set({ recoverableDraft: null, message: "已放弃本地草稿" });
    }
  },
  clearMessage: () => set({ message: "" }),
}));

export function diagramsHaveSameContent(
  left: Diagram,
  right: Diagram,
): boolean {
  return diagramContent(left) === diagramContent(right);
}

function diagramContent(diagram: Diagram): string {
  const { revision: _revision, updatedAt: _updatedAt, ...content } = diagram;
  return JSON.stringify(content);
}

function queueDraft(
  diagram: Diagram,
  dirty: boolean,
  onError: (error: unknown) => void,
): void {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const operation = dirty
      ? getRepository().saveDraft(diagram)
      : getRepository().deleteDraft(diagram.id);
    void operation.catch(onError);
  }, 500);
}

function domainMessage(error: unknown): string {
  if (error instanceof DomainError) return error.issue.message;
  if (error instanceof Error && error.message in errorMessages)
    return errorMessages[error.message as keyof typeof errorMessages];
  return "操作失败，请稍后重试";
}
