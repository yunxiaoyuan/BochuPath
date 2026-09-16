import { useEffect, useMemo, useState } from "react";
import type { EditorMode, Layer } from "../../../domain/types";
import {
  layerChildren,
  pathwaysContainingAll,
  styleReferenceCount,
} from "../../../domain/selectors";
import { sortStable } from "../../../domain/rules";
import { pathwayEdgeCount } from "../../../domain/layer-order";
import { singleLineNodeName } from "../../../domain/node-name";
import { styleDimensionPropertyLabel, styleDimensionReferenceCount } from "../../../domain/style-dimensions";
import { setPathwayVisibility } from "../../../editor/commands";
import { useEditorStore } from "../../../editor/store";
import type { CreateKind } from "../WorkspacePage";
import { NodeShape } from "./NodeShape";

type Tab = "structure" | "pathways" | "styles";
interface Props {
  mode: EditorMode;
  onCreate: (kind: CreateKind) => void;
  onClose: () => void;
}
export function ObjectPanel({ mode, onCreate, onClose }: Props) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const execute = useEditorStore((s) => s.execute);
  const focusPathway = useEditorStore((s) => s.focusPathway);
  const focusedPathwayId = useEditorStore((s) => s.focusedPathwayId);
  const selectedNodes = useEditorStore((s) => s.multiSelectedNodeIds);
  const [tab, setTab] = useState<Tab>("structure");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const matchedPathways = useMemo(
    () => pathwaysContainingAll(diagram, selectedNodes),
    [diagram, selectedNodes],
  );
  const roots = layerChildren(diagram, null);
  useEffect(() => {
    if (focusedPathwayId) setTab("pathways");
  }, [focusedPathwayId]);
  return (
    <aside className="object-panel" aria-label="对象面板">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">导航</span>
          <h2>对象</h2>
        </div>
        <button
          className="panel-close"
          onClick={onClose}
          aria-label="关闭对象面板"
        >
          ×
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="对象类型">
        <button
          role="tab"
          aria-selected={tab === "structure"}
          onClick={() => setTab("structure")}
        >
          结构
        </button>
        <button
          role="tab"
          aria-selected={tab === "pathways"}
          onClick={() => setTab("pathways")}
        >
          通路
        </button>
        <button
          role="tab"
          aria-selected={tab === "styles"}
          onClick={() => setTab("styles")}
        >
          样式
        </button>
      </div>
      <div className="object-actions">
        {mode === "edit" && tab === "structure" && (
          <>
            <button
              className="primary-button small"
              onClick={() => onCreate("node")}
            >
              ＋ 节点
            </button>
            <button onClick={() => onCreate("layer")}>＋ 层级</button>
            <button
              className="batch-create-button"
              onClick={() => onCreate("batch")}
              title="批量添加层级或节点"
            >
              批量
            </button>
          </>
        )}
        {mode === "edit" && tab === "pathways" && (
          <button
            className="primary-button small"
            onClick={() => onCreate("pathway")}
          >
            ＋ 新增通路
          </button>
        )}
        {mode === "edit" && tab === "styles" && (
          <>
            <button className="primary-button small" onClick={() => onCreate("styleDimension")}>＋ 维度</button>
            <button onClick={() => onCreate("nodeStyle")}>＋ 基础样式</button>
            <button className="batch-create-button" onClick={() => onCreate("styleDimensionsBatch")}>批量</button>
          </>
        )}
      </div>
      <label className="panel-search">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">搜索对象</span>
        <input
          id="object-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索节点、层级或通路"
        />
      </label>
      <div className="object-scroll">
        {tab === "structure" && (
          <div role="tree" aria-label="层级和节点结构">
            {roots.map((layer) => (
              <LayerBranch
                key={layer.id}
                layer={layer}
                query={normalized}
                selectedId={selection?.id}
                onSelect={(kind, id, additive) =>
                  kind === "layer"
                    ? select({ kind: "layer", id }, additive)
                    : select({ kind: "node", id }, additive)
                }
              />
            ))}
          </div>
        )}
        {tab === "pathways" && (
          <div className="object-list" role="list">
            {selectedNodes.length > 1 && (
              <div className="filter-note">
                包含所选 {selectedNodes.length} 个节点：{matchedPathways.length}{" "}
                条通路
              </div>
            )}
            {sortStable(diagram.pathways)
              .filter(
                (x) =>
                  (!normalized ||
                    x.name.toLocaleLowerCase().includes(normalized)) &&
                  (selectedNodes.length > 1
                    ? matchedPathways.some((item) => item.id === x.id)
                    : true),
              )
              .map((pathway) => (
                <div
                  key={pathway.id}
                  role="listitem"
                  className={`object-row pathway-row ${focusedPathwayId === pathway.id ? "selected active-pathway" : ""}`}
                  aria-current={focusedPathwayId === pathway.id ? "true" : undefined}
                >
                  {mode === "edit" ? (
                    <button
                      className="visibility-button"
                      aria-label={`${pathway.visible ? "隐藏" : "显示"} ${pathway.name}`}
                      onClick={() =>
                        execute(
                          pathway.visible ? "隐藏通路" : "显示通路",
                          (d) =>
                            setPathwayVisibility(
                              d,
                              pathway.id,
                              !pathway.visible,
                            ),
                        )
                      }
                    >
                      {pathway.visible ? "◉" : "○"}
                    </button>
                  ) : (
                    <span
                      className="visibility-indicator"
                      aria-label={pathway.visible ? "已显示" : "已隐藏"}
                    >
                      {pathway.visible ? "◉" : "○"}
                    </span>
                  )}
                  <button
                    className="row-main"
                    onClick={() => focusPathway(pathway.id)}
                  >
                    <i style={{ background: pathway.color }} />
                    <span>{pathway.name}</span>
                    {focusedPathwayId === pathway.id && <em>{mode === "edit" ? "编辑中" : "已高亮"}</em>}
                    <small>{pathway.nodeIds.length} 节点 · {pathwayEdgeCount(diagram, pathway.nodeIds)} 边</small>
                  </button>
                </div>
              ))}
          </div>
        )}
        {tab === "styles" && (
          <div className="object-list" role="list">
            <div className="object-section-label">样式维度</div>
            {diagram.styleDimensions
              .filter((dimension) => !normalized || dimension.name.toLocaleLowerCase().includes(normalized) || dimension.options.some((option) => option.name.toLocaleLowerCase().includes(normalized)))
              .map((dimension) => (
                <button key={dimension.id} role="listitem" className={`object-row dimension-row ${selection?.kind === "styleDimension" && selection.id === dimension.id ? "selected" : ""}`} onClick={() => select({ kind: "styleDimension", id: dimension.id })}>
                  <i>◆</i><span><b>{dimension.name}</b><small>{styleDimensionPropertyLabel(dimension.property)} · {dimension.options.length} 选项</small></span><em>{styleDimensionReferenceCount(diagram, dimension.id)}</em>
                </button>
              ))}
            {!diagram.styleDimensions.length && <div className="object-section-empty">尚未创建维度</div>}
            <div className="object-section-label">基础样式</div>
            {diagram.nodeStyles
              .filter(
                (x) =>
                  !normalized ||
                  x.name.toLocaleLowerCase().includes(normalized),
              )
              .map((style) => (
                <button
                  key={style.id}
                  role="listitem"
                  className={`object-row style-row ${selection?.id === style.id ? "selected" : ""}`}
                  onClick={() => select({ kind: "nodeStyle", id: style.id })}
                >
                  <i className="style-swatch">
                    <NodeShape style={style} width={20} height={20} />
                  </i>
                  <span>{style.name}</span>
                  <small>{styleReferenceCount(diagram, style.id)}</small>
                  {style.isSystem && <em>系统</em>}
                </button>
              ))}
          </div>
        )}
        {((tab === "structure" && !roots.length) ||
          (tab === "pathways" && !diagram.pathways.length)) && (
          <div className="panel-empty">
            <strong>还没有对象</strong>
            <span>
              {mode === "edit" ? "使用上方按钮开始创建" : "该图暂无可显示内容"}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function LayerBranch({
  layer,
  query,
  selectedId,
  onSelect,
}: {
  layer: Layer;
  query: string;
  selectedId?: string;
  onSelect: (kind: "layer" | "node", id: string, additive?: boolean) => void;
}) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const [open, setOpen] = useState(true);
  const children = layerChildren(diagram, layer.id);
  const nodes = sortStable(diagram.nodes.filter((x) => x.layerId === layer.id));
  const matches =
    !query ||
    layer.name.toLocaleLowerCase().includes(query) ||
    nodes.some((x) => singleLineNodeName(x.name).toLocaleLowerCase().includes(query));
  if (
    !matches &&
    !children.some((child) => child.name.toLocaleLowerCase().includes(query))
  )
    return null;
  const selectLayer = () => onSelect("layer", layer.id);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectLayer();
    } else if (event.key === "ArrowRight" && !open) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "ArrowLeft" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };
  return (
    <div className="tree-branch">
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={open}
        aria-selected={selectedId === layer.id}
        className={`tree-row layer-row ${selectedId === layer.id ? "selected" : ""}`}
        onClick={selectLayer}
        onKeyDown={onKeyDown}
      >
        <button
          className="disclosure"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
          aria-label={`${open ? "折叠" : "展开"} ${layer.name}`}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="tree-label">
          <span aria-hidden="true">▱</span>
          <span>{layer.name}</span>
          <small>{nodes.length}</small>
        </span>
      </div>
      {open && (
        <div role="group">
          {children.map((child) => (
            <LayerBranch
              key={child.id}
              layer={child}
              query={query}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {nodes
            .filter(
              (node) =>
                !query ||
                singleLineNodeName(node.name).toLocaleLowerCase().includes(query) ||
                layer.name.toLocaleLowerCase().includes(query),
            )
            .map((node) => (
              <button
                key={node.id}
                role="treeitem"
                aria-selected={selectedId === node.id}
                className={`tree-row node-row ${selectedId === node.id ? "selected" : ""}`}
                onClick={(event) =>
                  onSelect("node", node.id, event.ctrlKey || event.metaKey)
                }
              >
                <span aria-hidden="true">◇</span>
                <span>{singleLineNodeName(node.name)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
