import { useEffect, useState } from "react";
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
import { DiagramExportDialog } from "../diagrams/DiagramExportDialog";
import { saveDiagramFile } from "../../persistence/exchange";

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
  const dialog = useAppDialog();
  const state = useEditorStore();
  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const shared = usesSharedJsonRepository();
  useEffect(() => {
    const current = useEditorStore.getState();
    if (current.diagram?.id === diagramId) current.setMode(mode);
    else void current.load(diagramId, mode);
  }, [diagramId, mode]);
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
      if (event.key === "Escape" && current.selection?.kind === "pathway") {
        event.preventDefault();
        current.select(null);
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
  }, []);
  const returnToGallery = async () => {
    if (
      (state.saveState === "dirty" || state.saveState === "saveError") &&
      !await dialog.confirm({
        title: "返回通路图库",
        message: "当前有未保存修改。个人草稿已经保留，确定返回图库吗？",
        confirmLabel: "返回图库",
      })
    ) return;
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
  const highlightedNode =
    state.selection?.kind === "node" && state.multiSelectedNodeIds.length === 1
      ? state.selection.id
      : null;
  const highlightContext = highlightedNode
    ? nodePathwayContext(diagram, highlightedNode)
    : null;
  const highlightStatus = highlightContext
    ? `已高亮 ${highlightContext.visiblePathways.length} 条可见通路、${highlightContext.relatedNodeIds.size} 个关联节点${highlightContext.hiddenPathways.length ? `；另有 ${highlightContext.hiddenPathways.length} 条隐藏通路` : ""}`
    : "";
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
            aria-pressed={mode === "view"}
            onClick={() => void switchMode("view")}
          >
            查看
          </button>
          <button
            aria-pressed={mode === "edit"}
            onClick={() => void switchMode("edit")}
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
            className="export-button"
            onClick={() => void exportCurrentDiagram()}
            title="导出当前通路图 JSON"
          >
            导出
          </button>
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
}

function saveText(state: string): string {
  if (state === "dirty") return "● 有未保存修改";
  if (state === "saving") return "◌ 正在保存";
  if (state === "saveError") return "⚠ 保存失败";
  return "✓ 已保存";
}
