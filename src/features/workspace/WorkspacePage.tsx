import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDialog } from "../../app/AppDialog";
import { isPageDropRuntime, usesSharedJsonRepository } from "../../app/runtime";
import { createPathway } from "../../editor/commands";
import { useEditorStore } from "../../editor/store";
import type { EditorMode } from "../../domain/types";
import { pathwayLayerGroups } from "../../domain/layer-order";
import { nodePathwayContext } from "../../domain/selectors";
import { ObjectPanel } from "./components/ObjectPanel";
import { PathwayCanvas } from "./components/PathwayCanvas";
import { Inspector } from "./components/Inspector";
import { StyleDimensionBatchDialog } from "./components/StyleDimensionBatchDialog";
import { DiagramExportDialog } from "../diagrams/DiagramExportDialog";
import { saveDiagramFile } from "../../persistence/exchange";
import {
  EDIT_LOCK_HEARTBEAT_MS,
  EDITOR_NAME_STORAGE_KEY,
  getEditLockRepository,
  getEditorSessionId,
  type DiagramEditLock,
} from "../../collaboration/edit-lock";

export type CreateKind =
  | "layer"
  | "node"
  | "nodeStyle"
  | "styleDimension"
  | "styleDimensionsBatch"
  | "pathway"
  | "batch"
  | null;
interface Props {
  mode: EditorMode;
  theme: "light" | "dark";
  onTheme: () => void;
}

type LockView =
  | { phase: "disabled" | "checking" | "available" | "error" }
  | { phase: "owned" | "blocked"; lock: DiagramEditLock };

let memoryEditorName = "";

export function WorkspacePage({ mode, theme, onTheme }: Props) {
  const { diagramId = "" } = useParams();
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const state = useEditorStore();
  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [styleBatchOpen, setStyleBatchOpen] = useState(false);
  const shared = usesSharedJsonRepository();
  const [lockView, setLockView] = useState<LockView>({ phase: shared ? "checking" : "disabled" });
  const ownsLock = useRef(false);
  const editorName = useRef("");
  const sessionId = useRef(getEditorSessionId());
  const effectiveMode: EditorMode = mode === "edit" && (!shared || lockView.phase === "owned") ? "edit" : "view";

  useEffect(() => {
    if (effectiveMode === "edit") setCanvasFullscreen(false);
    else setCreateKind(null);
  }, [effectiveMode]);

  useEffect(() => {
    if (!canvasFullscreen) return;
    const exitFullscreen = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setCanvasFullscreen(false);
    };
    window.addEventListener("keydown", exitFullscreen, true);
    return () => window.removeEventListener("keydown", exitFullscreen, true);
  }, [canvasFullscreen]);

  useEffect(() => {
    const current = useEditorStore.getState();
    if (current.diagram?.id === diagramId) current.setMode(shared ? "view" : mode);
    else void current.load(diagramId, shared ? "view" : mode);
    current.setWriteAllowed(!shared && mode === "edit");
  }, [diagramId, mode, shared]);

  const loseLock = useCallback(async (message: string) => {
    ownsLock.current = false;
    const current = useEditorStore.getState();
    await current.preserveDraft(message);
    current.setMode("view");
    current.setWriteAllowed(false, message);
    setLockView({ phase: "error" });
    navigate(`/diagrams/${diagramId}/view`, { replace: true });
  }, [diagramId, navigate]);

  const releaseLock = useCallback(async () => {
    if (!shared || !ownsLock.current) return;
    ownsLock.current = false;
    useEditorStore.getState().setWriteAllowed(false);
    try {
      await getEditLockRepository().release(diagramId, sessionId.current);
    } catch {
      // The 60-second expiry remains the fallback when unload/network interrupts release.
    }
  }, [diagramId, shared]);

  const guardedSave = useCallback(async () => {
    if (shared) {
      try {
        const valid = await getEditLockRepository().verify(diagramId, sessionId.current);
        if (!valid) {
          await loseLock("编辑权已经转移，本机修改已保存为个人草稿");
          return;
        }
      } catch {
        await loseLock("暂时无法确认编辑权，本机修改已保存为个人草稿");
        return;
      }
    }
    await useEditorStore.getState().save();
  }, [diagramId, loseLock, shared]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const repository = getEditLockRepository();
    const current = useEditorStore.getState();
    ownsLock.current = false;

    if (!shared) {
      setLockView({ phase: "disabled" });
      current.setMode(mode);
      current.setWriteAllowed(mode === "edit");
      return;
    }

    current.setMode("view");
    current.setWriteAllowed(false);
    setLockView({ phase: "checking" });

    const observe = async () => {
      try {
        const lock = await repository.observe(diagramId);
        if (!stopped) setLockView(lock ? { phase: "blocked", lock } : { phase: "available" });
      } catch {
        if (!stopped) setLockView({ phase: "error" });
      }
    };

    const start = async () => {
      await waitForDiagramLoad(diagramId);
      if (stopped) return;
      if (mode === "view") {
        await observe();
        timer = setInterval(() => void observe(), EDIT_LOCK_HEARTBEAT_MS);
        return;
      }

      const name = await requireEditorName(dialog);
      if (stopped) return;
      if (!name) {
        navigate(`/diagrams/${diagramId}/view`, { replace: true });
        return;
      }
      editorName.current = name;
      try {
        const result = await repository.acquire(diagramId, sessionId.current, name);
        if (stopped) return;
        if (result.status === "blocked") {
          setLockView({ phase: "blocked", lock: result.lock });
          current.setWriteAllowed(false, `${result.lock.editorName} 正在编辑，当前仅可查看`);
          navigate(`/diagrams/${diagramId}/view`, { replace: true });
          return;
        }
        ownsLock.current = true;
        setLockView({ phase: "owned", lock: result.lock });
        await current.load(diagramId, "edit");
        if (stopped) return;
        current.setWriteAllowed(true, "已取得本图编辑权");
        timer = setInterval(async () => {
          try {
            const renewed = await repository.renew(diagramId, sessionId.current, editorName.current);
            if (stopped) return;
            if (!renewed) await loseLock("编辑权已失效，本机修改已保存为个人草稿");
            else setLockView({ phase: "owned", lock: renewed });
          } catch {
            if (!stopped) await loseLock("编辑权续期失败，本机修改已保存为个人草稿");
          }
        }, EDIT_LOCK_HEARTBEAT_MS);
      } catch {
        if (!stopped) {
          setLockView({ phase: "error" });
          current.setWriteAllowed(false, "无法取得编辑权，请检查连接后重试");
          navigate(`/diagrams/${diagramId}/view`, { replace: true });
        }
      }
    };
    void start();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (ownsLock.current) void releaseLock();
    };
  }, [diagramId, dialog, loseLock, mode, navigate, releaseLock, shared]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = useEditorStore.getState();
      const target = event.target as HTMLElement | null;
      const editing = target?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "s"
      ) {
        event.preventDefault();
        void guardedSave();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "f"
      ) {
        event.preventDefault();
        document.getElementById("object-search")?.focus();
        return;
      }
      if (event.key === "Escape" && current.tool === "connectPathway") {
        event.preventDefault();
        current.setTool("select");
        return;
      }
      if (event.key === "Escape" && current.focusedPathwayId) {
        event.preventDefault();
        current.focusPathway(null);
        return;
      }
      if (editing) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        current.undo();
      } else if (
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key.toLocaleLowerCase() === "z") ||
        (event.ctrlKey && event.key.toLocaleLowerCase() === "y")
      ) {
        event.preventDefault();
        current.redo();
      } else if (
        event.key === "Enter" &&
        current.tool === "connectPathway" &&
        current.pathwayDraft &&
        current.diagram &&
        pathwayLayerGroups(current.diagram, current.pathwayDraft.nodeIds).length >= 2
      ) {
        event.preventDefault();
        const draft = current.pathwayDraft;
        const before = new Set(
          current.diagram?.pathways.map((pathway) => pathway.id),
        );
        if (
          current.execute("新建通路", (diagram) => createPathway(diagram, draft))
        ) {
          const created = useEditorStore.getState().diagram?.pathways.find((pathway) => !before.has(pathway.id));
          current.setTool("select");
          if (created) current.select({ kind: "pathway", id: created.id });
        }
      } else if (
        current.mode === "edit" &&
        event.key.toLocaleLowerCase() === "c"
      )
        current.setTool("connectPathway");
      else if (event.key.toLocaleLowerCase() === "v") current.setTool("select");
      else if (event.key.toLocaleLowerCase() === "h") current.setTool("pan");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [guardedSave]);
  const returnToGallery = async () => {
    if (
      (state.saveState === "dirty" || state.saveState === "saveError") &&
      !await dialog.confirm({
        title: "返回通路图库",
        message: "当前有未保存修改。个人草稿已经保留，确定返回图库吗？",
        confirmLabel: "返回图库",
      })
    ) return;
    await releaseLock();
    navigate("/diagrams");
  };
  const switchMode = async (next: EditorMode) => {
    if (next === mode) return;
    if (
      (state.saveState === "dirty" || state.saveState === "saveError") &&
      next === "view" &&
      !await dialog.confirm({
        title: "切换到查看模式",
        message: "当前有未保存修改。切换后会保留内存修改，但不会自动保存。继续吗？",
        confirmLabel: "继续切换",
      })
    )
      return;
    if (next === "view") await releaseLock();
    navigate(`/diagrams/${diagramId}/${next}`);
  };
  if (state.loading)
    return (
      <div className="loading-screen" role="status">
        <span className="spinner" />
        正在打开通路图…
      </div>
    );
  if (!state.diagram)
    return (
      <div className="error-screen">
        <h1>无法打开通路图</h1>
        <p>{state.message}</p>
        <button onClick={() => navigate("/diagrams")}>返回图库</button>
      </div>
    );
  const diagram = state.diagram;
  const activePathway = state.focusedPathwayId
    ? diagram.pathways.find((pathway) => pathway.id === state.focusedPathwayId)
    : null;
  const highlightedNode =
    state.selection?.kind === "node" && state.multiSelectedNodeIds.length === 1
      ? state.selection.id
      : null;
  const highlightContext = highlightedNode
    ? nodePathwayContext(diagram, highlightedNode)
    : null;
  const highlightStatus = activePathway
    ? `${mode === "edit" ? "正在编辑" : "已高亮"}通路：${activePathway.name}`
    : highlightContext
      ? `已高亮 ${highlightContext.visiblePathways.length} 条可见通路、${highlightContext.relatedNodeIds.size} 个关联节点${highlightContext.hiddenPathways.length ? `；另有 ${highlightContext.hiddenPathways.length} 条隐藏通路` : ""}`
      : "";
  const issueCount = 0;
  return (
    <div className={`workspace-shell ${canvasFullscreen ? "canvas-fullscreen-mode" : ""}`}>
      <a className="skip-link" href="#canvas-region">
        跳到画布
      </a>
      {effectiveMode === "edit" && <a className="skip-link" href="#inspector-region">跳到属性</a>}
      <header className="global-header" aria-label="通路图顶部栏">
        <div className="breadcrumb">
          <button
            className="logo-button"
            onClick={() => void returnToGallery()}
            aria-label="返回通路图库"
          >
            <span className="product-mark">路</span>
          </button>
          <span>BochuPath</span>
          <span aria-hidden="true">/</span>
          <strong title={diagram.name}>{diagram.name}</strong>
        </div>
        <div className="mode-segment" role="group" aria-label="工作模式">
          <button
            aria-pressed={effectiveMode === "view"}
            onClick={() => void switchMode("view")}
          >
            查看
          </button>
          <button
            aria-pressed={effectiveMode === "edit"}
            onClick={() => void switchMode("edit")}
          >
            编辑
          </button>
        </div>
        <div className="header-actions">
          {effectiveMode === "edit" && (
            <>
              <button
                className="icon-button"
                aria-label="撤销"
                title="撤销 Ctrl+Z"
                disabled={!state.history.past.length}
                onClick={state.undo}
              >
                ↶
              </button>
              <button
                className="icon-button"
                aria-label="重做"
                title="重做 Ctrl+Shift+Z"
                disabled={!state.history.future.length}
                onClick={state.redo}
              >
                ↷
              </button>
              <span className={`save-indicator ${state.saveState}`}>
                {saveText(state.saveState)}
              </span>
              <button
                className="primary-button"
                disabled={
                  state.saveState === "clean" || state.saveState === "saving"
                }
                onClick={() => void guardedSave()}
              >
                {state.saveState === "saving" ? "保存中…" : "保存"}
              </button>
            </>
          )}
          <button
            className="export-button"
            onClick={() => void exportCurrentDiagram()}
            title="导出当前通路图 JSON"
          >
            导出
          </button>
          {effectiveMode === "edit" && <>
            <button className="icon-button responsive-panel-button" onClick={() => setLeftOpen(!leftOpen)} aria-label="切换对象面板">☰</button>
            <button className="icon-button responsive-panel-button" onClick={() => setRightOpen(!rightOpen)} aria-label="切换属性面板">▤</button>
          </>}
          <button
            className="icon-button"
            onClick={onTheme}
            aria-label={`切换到${theme === "light" ? "深色" : "浅色"}主题`}
            title="切换主题"
          >
            {theme === "light" ? "◐" : "○"}
          </button>
        </div>
      </header>
      {(shared || state.recoverableDraft) && <div className="workspace-notices">
        {shared && <CollaborationBanner
          view={lockView}
          name={editorName.current || readEditorName()}
          onChangeName={() => void changeEditorName()}
        />}
        {state.recoverableDraft && (
          <div className="draft-banner" role="alert">
            <span>{effectiveMode === "edit" ? "发现比上次保存更新的本地草稿。" : "本机有未恢复的个人草稿；取得编辑权后可以恢复。"}</span>
            {effectiveMode === "edit" && <>
              <button className="primary-button small" onClick={() => void state.recoverDraft(true)}>恢复草稿</button>
              <button onClick={() => void state.recoverDraft(false)}>放弃草稿</button>
            </>}
          </div>
        )}
      </div>}
      <main
        className={`workspace-main ${effectiveMode === "view" ? "view-only" : ""} ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"}`}
      >
        {effectiveMode === "edit" && leftOpen && (
          <ObjectPanel
            mode={effectiveMode}
            onCreate={(kind) => {
              if (kind === "pathway") {
                setCreateKind(null);
                state.setTool("connectPathway");
              } else if (kind === "styleDimensionsBatch") {
                setCreateKind(null);
                setStyleBatchOpen(true);
              } else setCreateKind(kind);
            }}
            onClose={() => setLeftOpen(false)}
          />
        )}
        <PathwayCanvas
          mode={effectiveMode}
          onCreateNode={() => setCreateKind("node")}
          isFullscreen={canvasFullscreen}
          onToggleFullscreen={() => setCanvasFullscreen((current) => !current)}
        />
        {effectiveMode === "edit" && rightOpen && (
          <Inspector
            mode={effectiveMode}
            createKind={createKind}
            onCreateHandled={() => setCreateKind(null)}
            onClose={() => setRightOpen(false)}
          />
        )}
      </main>
      <footer className="status-bar" aria-label="状态栏">
        <span>
          {effectiveMode === "edit" ? "编辑模式" : "查看模式"} ·{" "}
          {state.multiSelectedNodeIds.length
            ? `已选择 ${state.multiSelectedNodeIds.length} 个节点`
            : "未选择节点"}
        </span>
        <span aria-live="polite">
          {state.message || highlightStatus || `${issueCount} 个校验问题`}
        </span>
        <span>
          {diagram.layers.length} 层 · {diagram.nodes.length} 节点 ·{" "}
          {diagram.pathways.length} 通路 ·{" "}
          {theme === "light" ? "Light" : "Dark"} · {shared ? "共享数据" : "本机数据"}
        </span>
      </footer>
      <div className="small-viewport-warning">
        当前窗口小于 960×640，建议增大窗口；仅保留查看能力。
      </div>
      {exportMessage && <div className="export-toast" role="status">{exportMessage}</div>}
      {exportOpen && <DiagramExportDialog diagram={diagram} onClose={() => setExportOpen(false)} />}
      {styleBatchOpen && <StyleDimensionBatchDialog onClose={() => setStyleBatchOpen(false)} />}
    </div>
  );

  async function exportCurrentDiagram() {
    setExportMessage("");
    if (isPageDropRuntime()) {
      setExportOpen(true);
      return;
    }
    try {
      const result = await saveDiagramFile(diagram);
      if (result === "saved") setExportMessage("文件已保存");
      else if (result === "downloaded") setExportMessage("文件已开始下载");
    } catch {
      setExportMessage("导出失败，请稍后重试");
    }
  }

  async function changeEditorName() {
    const name = await promptEditorName(dialog, editorName.current || readEditorName());
    if (!name) return;
    writeEditorName(name);
    editorName.current = name;
    if (lockView.phase !== "owned") {
      setLockView({ ...lockView });
      return;
    }
    try {
      const renewed = await getEditLockRepository().renew(diagramId, sessionId.current, name);
      if (!renewed) await loseLock("编辑权已失效，本机修改已保存为个人草稿");
      else setLockView({ phase: "owned", lock: renewed });
    } catch {
      await loseLock("姓名更新时无法确认编辑权，本机修改已保存为个人草稿");
    }
  }
}

function CollaborationBanner({ view, name, onChangeName }: {
  view: LockView;
  name: string;
  onChangeName: () => void;
}) {
  let message = "正在检查本图的编辑状态…";
  let tone = "checking";
  if (view.phase === "available") {
    message = "当前无人编辑；进入编辑模式后，本图会为你保留 60 秒并自动续期。";
    tone = "available";
  } else if (view.phase === "owned") {
    message = `你（${view.lock.editorName}）正在编辑；其他协作者目前只能查看。`;
    tone = "owned";
  } else if (view.phase === "blocked") {
    message = `${view.lock.editorName} 正在编辑；当前仅可查看。最近活动：${formatActivity(view.lock.heartbeatAt)}。`;
    tone = "blocked";
  } else if (view.phase === "error") {
    message = "暂时无法确认编辑状态，为保护共享数据，当前仅可查看。";
    tone = "error";
  }
  return <div className={`collaboration-banner ${tone}`} role="status">
    <span>{message}</span>
    <small>姓名由协作者本人填写，非企业微信认证身份。</small>
    <button className="quiet-button" onClick={onChangeName}>{name ? `我的标识：${name}` : "填写我的标识"}</button>
  </div>;
}

async function requireEditorName(dialog: ReturnType<typeof useAppDialog>): Promise<string | null> {
  const existing = readEditorName();
  if (existing) return existing;
  return promptEditorName(dialog, "");
}

async function promptEditorName(dialog: ReturnType<typeof useAppDialog>, defaultValue: string): Promise<string | null> {
  const value = await dialog.prompt({
    title: "填写编辑标识",
    message: "其他协作者会看到这个名字。它由你本人填写，不代表企业微信已认证。",
    label: "姓名或常用称呼（1–20 个字符）",
    defaultValue,
    confirmLabel: "继续",
  });
  const name = value?.trim();
  if (!name) return null;
  const normalized = [...name].slice(0, 20).join("");
  writeEditorName(normalized);
  return normalized;
}

function readEditorName(): string {
  try {
    return window.localStorage.getItem(EDITOR_NAME_STORAGE_KEY)?.trim() || memoryEditorName;
  } catch {
    return memoryEditorName;
  }
}

function writeEditorName(name: string): void {
  memoryEditorName = name;
  try {
    window.localStorage.setItem(EDITOR_NAME_STORAGE_KEY, name);
  } catch {
    // Sandboxed browsers may deny persistent storage; the in-memory ref still works for this visit.
  }
}

function formatActivity(timestamp: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (elapsed < 10_000) return "刚刚";
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1000)} 秒前`;
  return new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function waitForDiagramLoad(diagramId: string): Promise<void> {
  const current = useEditorStore.getState();
  if (!current.loading && current.diagram?.id === diagramId) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useEditorStore.subscribe((next) => {
      if (!next.loading && next.diagram?.id === diagramId) {
        unsubscribe();
        resolve();
      }
    });
  });
}

function saveText(state: string): string {
  if (state === "dirty") return "● 有未保存修改";
  if (state === "saving") return "◌ 正在保存";
  if (state === "saveError") return "⚠ 保存失败";
  return "✓ 已保存";
}
