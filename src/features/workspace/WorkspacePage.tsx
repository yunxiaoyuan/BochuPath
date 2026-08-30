import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usesSharedJsonRepository } from "../../app/runtime";
import { createPathway } from "../../editor/commands";
import { useEditorStore } from "../../editor/store";
import type { EditorMode } from "../../domain/types";
import { ObjectPanel } from "./components/ObjectPanel";
import { PathwayCanvas } from "./components/PathwayCanvas";
import { Inspector } from "./components/Inspector";

export type CreateKind =
  | "layer"
  | "node"
  | "nodeStyle"
  | "pathway"
  | "batch"
  | null;
interface Props {
  mode: EditorMode;
  theme: "light" | "dark";
  onTheme: () => void;
}

export function WorkspacePage({ mode, theme, onTheme }: Props) {
  const { diagramId = "" } = useParams();
  const navigate = useNavigate();
  const state = useEditorStore();
  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const shared = usesSharedJsonRepository();
  useEffect(() => {
    const current = useEditorStore.getState();
    if (current.diagram?.id === diagramId) current.setMode(mode);
    else void current.load(diagramId, mode);
  }, [diagramId, mode]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().saveState === "dirty") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
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
        void current.save();
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
        current.pathwayDraft.nodeIds.length >= 2
      ) {
        const draft = current.pathwayDraft;
        const before = new Set(
          current.diagram?.pathways.map((pathway) => pathway.id),
        );
        if (
          current.execute("新建通路", (diagram) =>
            createPathway(diagram, draft),
          )
        ) {
          const created = useEditorStore
            .getState()
            .diagram?.pathways.find((pathway) => !before.has(pathway.id));
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
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    if (
      state.saveState === "dirty" &&
      next === "view" &&
      !window.confirm(
        "当前有未保存修改。切换到查看模式会保留内存修改，但不会自动保存。继续吗？",
      )
    )
      return;
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
  const issueCount = 0;
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#canvas-region">
        跳到画布
      </a>
      <a className="skip-link" href="#inspector-region">
        跳到属性
      </a>
      <header className="global-header" aria-label="通路图顶部栏">
        <div className="breadcrumb">
          <button
            className="logo-button"
            onClick={() => navigate("/diagrams")}
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
            aria-pressed={mode === "view"}
            onClick={() => switchMode("view")}
          >
            查看
          </button>
          <button
            aria-pressed={mode === "edit"}
            onClick={() => switchMode("edit")}
          >
            编辑
          </button>
        </div>
        <div className="header-actions">
          {mode === "edit" && (
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
                onClick={() => void state.save()}
              >
                {state.saveState === "saving" ? "保存中…" : "保存"}
              </button>
            </>
          )}
          <button
            className="icon-button responsive-panel-button"
            onClick={() => setLeftOpen(!leftOpen)}
            aria-label="切换对象面板"
          >
            ☰
          </button>
          <button
            className="icon-button responsive-panel-button"
            onClick={() => setRightOpen(!rightOpen)}
            aria-label="切换属性面板"
          >
            ▤
          </button>
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
      {state.recoverableDraft && (
        <div className="draft-banner" role="alert">
          <span>发现比上次保存更新的本地草稿。</span>
          <button
            className="primary-button small"
            onClick={() => void state.recoverDraft(true)}
          >
            恢复草稿
          </button>
          <button onClick={() => void state.recoverDraft(false)}>
            放弃草稿
          </button>
        </div>
      )}
      <main
        className={`workspace-main ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"}`}
      >
        {leftOpen && (
          <ObjectPanel
            mode={mode}
            onCreate={(kind) => {
              if (kind === "pathway") {
                setCreateKind(null);
                state.setTool("connectPathway");
              } else setCreateKind(kind);
            }}
            onClose={() => setLeftOpen(false)}
          />
        )}
        <PathwayCanvas mode={mode} onCreateNode={() => setCreateKind("node")} />
        {rightOpen && (
          <Inspector
            mode={mode}
            createKind={createKind}
            onCreateHandled={() => setCreateKind(null)}
            onClose={() => setRightOpen(false)}
          />
        )}
      </main>
      <footer className="status-bar" aria-label="状态栏">
        <span>
          {mode === "edit" ? "编辑模式" : "查看模式"} ·{" "}
          {state.multiSelectedNodeIds.length
            ? `已选择 ${state.multiSelectedNodeIds.length} 个节点`
            : "未选择节点"}
        </span>
        <span aria-live="polite">
          {state.message || `${issueCount} 个校验问题`}
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
    </div>
  );
}

function saveText(state: string): string {
  if (state === "dirty") return "● 有未保存修改";
  if (state === "saving") return "◌ 正在保存";
  if (state === "saveError") return "⚠ 保存失败";
  return "✓ 已保存";
}
