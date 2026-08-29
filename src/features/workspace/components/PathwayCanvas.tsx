import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type {
  Diagram,
  DiagramNode,
  EditorMode,
  NodeStyle,
} from "../../../domain/types";
import { fullLayerPath, nodePathways } from "../../../domain/selectors";
import { createPathway } from "../../../editor/commands";
import { useEditorStore } from "../../../editor/store";
import { deriveEdges } from "../../../layout/derive-edges";
import { fitViewportToBounds } from "../../../layout/fit-viewport";
import {
  chooseNodeActionPosition,
  type NodeActionPosition,
} from "../../../layout/node-action-placement";
import { layoutDiagram } from "../../../layout/swimlane-layout";

interface Props {
  mode: EditorMode;
  onCreateNode: () => void;
}
interface BusinessData extends Record<string, unknown> {
  kind: "business";
  node: DiagramNode;
  style: NodeStyle;
  dimmed: boolean;
  step?: number;
  draftStep: boolean;
  finishAction?: {
    position: NodeActionPosition;
    nodeName: string;
    onFinish: () => void;
  };
}
interface LayerData extends Record<string, unknown> {
  kind: "layer";
  name: string;
  depth: number;
  isLeaf: boolean;
}
type BusinessFlowNode = Node<BusinessData, "business">;
type LayerFlowNode = Node<LayerData, "layer">;
type CanvasNode = BusinessFlowNode | LayerFlowNode;
interface ParallelData extends Record<string, unknown> {
  offset: number;
  direction: "TB" | "LR";
  dimmed: boolean;
  sequence: number;
  pathwayId?: string;
  draft?: boolean;
}
type CanvasEdge = Edge<ParallelData>;

const MIN_ZOOM = 0.001;
const MAX_ZOOM = 2.5;

export function PathwayCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ mode, onCreateNode }: Props) {
  const diagram = useEditorStore((s) => s.diagram)!;
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const select = useEditorStore((s) => s.select);
  const selection = useEditorStore((s) => s.selection);
  const multiSelectedNodeIds = useEditorStore((s) => s.multiSelectedNodeIds);
  const focused = useEditorStore((s) => s.focusedPathwayId);
  const focusPathway = useEditorStore((s) => s.focusPathway);
  const draft = useEditorStore((s) => s.pathwayDraft);
  const setDraft = useEditorStore((s) => s.setPathwayDraft);
  const execute = useEditorStore((s) => s.execute);
  const { setViewport, zoomIn, zoomOut } = useReactFlow<
    CanvasNode,
    CanvasEdge
  >();
  const { x: viewportX, y: viewportY, zoom } = useViewport();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const focusedPath = useMemo(
    () => diagram.pathways.find((pathway) => pathway.id === focused),
    [diagram.pathways, focused],
  );
  const focusedIds = useMemo(
    () => new Set(focusedPath?.steps.map((step) => step.nodeId)),
    [focusedPath],
  );
  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    if (selection?.kind === "node") {
      ids.add(selection.id);
      deriveEdges(diagram)
        .filter(
          (edge) =>
            edge.sourceNodeId === selection.id ||
            edge.targetNodeId === selection.id,
        )
        .forEach((edge) => {
          ids.add(edge.sourceNodeId);
          ids.add(edge.targetNodeId);
        });
    }
    return ids;
  }, [diagram, selection]);

  const finishDraft = useCallback(() => {
    if (!draft || draft.nodeIds.length < 2) return;
    const before = new Set(diagram.pathways.map((pathway) => pathway.id));
    if (execute("新建通路", (current) => createPathway(current, draft))) {
      const created = useEditorStore
        .getState()
        .diagram?.pathways.find((pathway) => !before.has(pathway.id));
      setTool("select");
      if (created) select({ kind: "pathway", id: created.id });
    }
  }, [diagram.pathways, draft, execute, select, setTool]);

  const finishPosition = useMemo<NodeActionPosition>(() => {
    const lastId = draft?.nodeIds.at(-1);
    const anchor = layout.nodes.find((node) => node.id === lastId);
    if (!anchor) return "bottom";
    return chooseNodeActionPosition(
      anchor,
      layout.nodes.filter((node) => node.id !== lastId),
      { x: viewportX, y: viewportY, zoom },
      stageSize,
    );
  }, [draft?.nodeIds, layout.nodes, stageSize, viewportX, viewportY, zoom]);

  const nodes = useMemo<CanvasNode[]>(() => {
    const layerNodes: LayerFlowNode[] = [...layout.layers]
      .sort((left, right) => left.depth - right.depth)
      .map((rect) => {
        const layer = diagram.layers.find((item) => item.id === rect.id);
        return {
          id: `layer::${rect.id}`,
          type: "layer",
          position: { x: rect.x, y: rect.y },
          style: { width: rect.width, height: rect.height, zIndex: 0 },
          zIndex: 0,
          draggable: false,
          selectable: true,
          focusable: true,
          selected: selection?.kind === "layer" && selection.id === rect.id,
          ariaRole: "button",
          ariaLabel: `层级 ${layer?.name ?? "未命名"}，${rect.isLeaf ? "叶子泳道" : "分组层级"}`,
          data: {
            kind: "layer",
            name: layer?.name ?? "",
            depth: rect.depth,
            isLeaf: rect.isLeaf,
          },
        };
      });
    const businessNodes: BusinessFlowNode[] = layout.nodes.map((rect) => {
      const node = diagram.nodes.find((item) => item.id === rect.id)!;
      const style =
        diagram.nodeStyles.find((item) => item.id === node.styleId) ??
        diagram.nodeStyles[0]!;
      const focusedStep = focusedPath
        ? [...focusedPath.steps]
            .sort((left, right) => left.order - right.order)
            .findIndex((item) => item.nodeId === node.id) + 1
        : undefined;
      const draftStep = (draft?.nodeIds.indexOf(node.id) ?? -1) + 1;
      const step = draftStep > 0 ? draftStep : focusedStep;
      const dimmed = focusedIds.size
        ? !focusedIds.has(node.id)
        : relatedIds.size
          ? !relatedIds.has(node.id)
          : false;
      const participationCount = nodePathways(diagram, node.id).length;
      return {
        id: node.id,
        type: "business",
        position: { x: rect.x, y: rect.y },
        style: { width: rect.width, height: rect.height },
        zIndex: 4,
        draggable: false,
        selectable: true,
        focusable: true,
        selected:
          multiSelectedNodeIds.includes(node.id) || Boolean(draftStep > 0),
        ariaRole: "button",
        ariaLabel: `${node.name}，位于 ${fullLayerPath(diagram, node.layerId)}，参与 ${participationCount} 条通路`,
        data: {
          kind: "business",
          node,
          style,
          dimmed,
          step: step && step > 0 ? step : undefined,
          draftStep: draftStep > 0,
          finishAction:
            draftStep === draft?.nodeIds.length && draftStep >= 2
              ? {
                  position: finishPosition,
                  nodeName: node.name,
                  onFinish: finishDraft,
                }
              : undefined,
        },
      };
    });
    return [...layerNodes, ...businessNodes];
  }, [
    diagram,
    draft,
    finishDraft,
    finishPosition,
    focusedPath,
    focusedIds,
    layout,
    multiSelectedNodeIds,
    relatedIds,
    selection,
  ]);

  const edges = useMemo<CanvasEdge[]>(() => {
    const confirmed: CanvasEdge[] = deriveEdges(diagram).map((edge) => {
      const pathway = diagram.pathways.find(
        (item) => item.id === edge.pathwayId,
      );
      const source = diagram.nodes.find(
        (item) => item.id === edge.sourceNodeId,
      );
      const target = diagram.nodes.find(
        (item) => item.id === edge.targetNodeId,
      );
      const isFocused = focused === edge.pathwayId;
      return {
        id: edge.id,
        type: "parallel",
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        sourceHandle: diagram.layout.direction === "TB" ? "bottom" : "right",
        targetHandle: diagram.layout.direction === "TB" ? "top" : "left",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.color,
          width: 18,
          height: 18,
        },
        style: {
          stroke: edge.color,
          strokeWidth: isFocused ? 3 : 2,
          strokeDasharray: edge.lineStyle === "dashed" ? "7 5" : undefined,
          opacity: focused && !isFocused ? 0.14 : 1,
        },
        zIndex: isFocused ? 3 : 2,
        selected:
          selection?.kind === "pathway" && selection.id === edge.pathwayId,
        selectable: true,
        focusable: true,
        ariaRole: "button",
        ariaLabel: `${pathway?.name ?? "通路"}第 ${edge.sequence} 段：${source?.name ?? "未知节点"} 到 ${target?.name ?? "未知节点"}`,
        label: isFocused ? String(edge.sequence) : undefined,
        data: {
          offset: edge.parallelOffset,
          direction: diagram.layout.direction,
          dimmed: Boolean(focused && !isFocused),
          sequence: edge.sequence,
          pathwayId: edge.pathwayId,
        },
      };
    });
    const candidates: CanvasEdge[] =
      draft?.nodeIds.slice(0, -1).map((nodeId, index) => {
        const targetId = draft.nodeIds[index + 1]!;
        const source = diagram.nodes.find((item) => item.id === nodeId);
        const target = diagram.nodes.find((item) => item.id === targetId);
        return {
          id: `draft::${index}`,
          type: "parallel",
          source: nodeId,
          target: targetId,
          sourceHandle: diagram.layout.direction === "TB" ? "bottom" : "right",
          targetHandle: diagram.layout.direction === "TB" ? "top" : "left",
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: draft.color,
            width: 18,
            height: 18,
          },
          style: {
            stroke: draft.color,
            strokeWidth: 2,
            strokeDasharray: "6 5",
          },
          zIndex: 3,
          selectable: true,
          focusable: true,
          ariaLabel: `候选通路第 ${index + 1} 段：${source?.name ?? "未知节点"} 到 ${target?.name ?? "未知节点"}`,
          label: String(index + 1),
          className: "draft-edge",
          data: {
            offset: 0,
            direction: diagram.layout.direction,
            dimmed: false,
            sequence: index + 1,
            draft: true,
          },
        };
      }) ?? [];
    return [...confirmed, ...candidates];
  }, [diagram, draft, focused, selection]);

  const fitCanvas = useCallback(
    (duration = 200) => {
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage || stage.width <= 0 || stage.height <= 0) return;
      const viewport = fitViewportToBounds(
        layout.bounds,
        { width: stage.width, height: stage.height },
        { padding: 32, minZoom: MIN_ZOOM, maxZoom: 1 },
      );
      void setViewport(viewport, { duration });
    },
    [
      layout.bounds.height,
      layout.bounds.width,
      layout.bounds.x,
      layout.bounds.y,
      setViewport,
    ],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const refit = () => {
      const bounds = stage.getBoundingClientRect();
      setStageSize((current) =>
        current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height },
      );
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitCanvas(0));
    };
    const observer = new ResizeObserver(refit);
    observer.observe(stage);
    refit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitCanvas]);

  const selectCanvasNode = useCallback(
    (node: CanvasNode, additive = false) => {
      if (node.data.kind === "layer")
        select({ kind: "layer", id: node.id.replace("layer::", "") });
      else select({ kind: "node", id: node.id }, additive);
    },
    [select],
  );

  const handleNodeClick = (event: React.MouseEvent, node: CanvasNode) => {
    if (node.data.kind === "business" && tool === "connectPathway" && draft) {
      if (!draft.nodeIds.includes(node.id))
        setDraft({ ...draft, nodeIds: [...draft.nodeIds, node.id] });
      return;
    }
    if (tool !== "connectPathway")
      selectCanvasNode(node, event.ctrlKey || event.metaKey);
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    const flowElement = target.closest<HTMLElement>(
      ".react-flow__node, .react-flow__edge",
    );
    const id = flowElement?.dataset.id;
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();

    const node = nodes.find((item) => item.id === id);
    if (node) {
      if (node.data.kind === "business" && tool === "connectPathway" && draft) {
        if (!draft.nodeIds.includes(node.id))
          setDraft({ ...draft, nodeIds: [...draft.nodeIds, node.id] });
        return;
      }
      if (tool !== "connectPathway")
        selectCanvasNode(node, event.ctrlKey || event.metaKey);
      return;
    }

    const pathwayId = edges.find((edge) => edge.id === id)?.data?.pathwayId;
    if (pathwayId && tool !== "connectPathway") focusPathway(pathwayId);
  };

  return (
    <section
      id="canvas-region"
      className="canvas-workspace"
      aria-label="通路图工作区"
    >
      <div className="canvas-toolbar" role="toolbar" aria-label="画布工具栏">
        <div className="tool-group">
          <button
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
            title="选择 V"
          >
            ↖ <span>选择</span>
          </button>
          <button
            aria-pressed={tool === "marquee"}
            onClick={() => setTool("marquee")}
            title="框选"
          >
            ⬚
          </button>
          <button
            aria-pressed={tool === "pan"}
            onClick={() => setTool("pan")}
            title="平移 H"
          >
            ✥
          </button>
        </div>
        {mode === "edit" && (
          <div className="tool-group">
            <button onClick={onCreateNode} title="新增节点">
              ＋ 节点
            </button>
            <button
              aria-pressed={tool === "connectPathway"}
              onClick={() =>
                setTool(tool === "connectPathway" ? "select" : "connectPathway")
              }
              title="连接通路 C"
            >
              ⌁ 连接
            </button>
          </div>
        )}
        <div className="tool-group">
          <button onClick={() => fitCanvas()} title="自动布局并适应画布">
            布局
          </button>
          <button onClick={() => void zoomOut()} aria-label="缩小">
            −
          </button>
          <output className="zoom-value" aria-label="当前缩放比例">
            {Math.round(zoom * 100)}%
          </output>
          <button onClick={() => void zoomIn()} aria-label="放大">
            ＋
          </button>
          <button onClick={() => fitCanvas()} title="适应画布 0">
            适应
          </button>
        </div>
      </div>
      {tool === "connectPathway" && (
        <div className="connect-guide" role="status">
          <span>
            依次点击节点；“完成通路”会跟随最后一个节点，Enter 完成，Esc
            取消
          </span>
          <strong>已选 {draft?.nodeIds.length ?? 0} 个</strong>
          <button onClick={() => setTool("select")}>取消</button>
        </div>
      )}
      <div
        ref={stageRef}
        className="flow-wrap"
        role="region"
        aria-label="通路图画布"
        onKeyDownCapture={handleCanvasKeyDown}
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onEdgeClick={(_event, edge) => {
            if (edge.data?.pathwayId) focusPathway(edge.data.pathwayId);
          }}
          onPaneClick={() => {
            if (tool !== "connectPathway") select(null);
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable
          panOnDrag={tool === "pan" || tool === "select"}
          selectionOnDrag={tool === "marquee"}
          elementsSelectable={tool !== "pan"}
          autoPanOnNodeFocus
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls showFitView={false} showInteractive={false} />
          <MiniMap
            ariaLabel="画布缩略图"
            pannable
            zoomable
            nodeColor={(node) =>
              node.type === "layer" ? "transparent" : "var(--color-brand-5)"
            }
          />
        </ReactFlow>
        <CanvasTextAlternative diagram={diagram} />
        {!diagram.layers.length && (
          <div className="canvas-empty">
            <span>⌘</span>
            <h2>从层级开始搭建通路图</h2>
            <p>创建层级后即可放入节点，再用有序通路连接它们。</p>
            {mode === "edit" && (
              <button className="primary-button" onClick={onCreateNode}>
                开始创建
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CanvasTextAlternative({ diagram }: { diagram: Diagram }) {
  return (
    <section className="sr-only" aria-label="画布文本说明">
      <h3>节点与通路文本说明</h3>
      <ul>
        {diagram.nodes.map((node) => (
          <li key={node.id}>
            {node.name}，位于 {fullLayerPath(diagram, node.layerId)}
          </li>
        ))}
      </ul>
      <ul>
        {diagram.pathways.map((pathway) => (
          <li key={pathway.id}>
            {pathway.name}：
            {[...pathway.steps]
              .sort((left, right) => left.order - right.order)
              .map(
                (step) =>
                  diagram.nodes.find((node) => node.id === step.nodeId)?.name ??
                  "未知节点",
              )
              .join(" → ")}
          </li>
        ))}
      </ul>
    </section>
  );
}

const BusinessNode = memo(({ data, selected }: NodeProps<BusinessFlowNode>) => (
  <div
    className={`business-node ${selected ? "selected" : ""} ${data.dimmed ? "dimmed" : ""}`}
    style={{
      background: data.style.fillColor,
      borderColor: data.style.borderColor,
      borderStyle: data.style.borderStyle,
      borderWidth: data.style.borderWidth,
      borderRadius: data.style.shape === "rect" ? 0 : data.style.borderRadius,
      color: data.style.textColor,
    }}
  >
    {data.finishAction && (
      <NodeToolbar
        isVisible
        position={toolbarPositions[data.finishAction.position]}
        offset={12}
        className="pathway-finish-toolbar nodrag nopan nowheel"
        role="group"
        aria-label={`通路创建操作，靠近 ${data.finishAction.nodeName}`}
        data-placement={data.finishAction.position}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="primary-button"
          aria-label="完成通路"
          title="完成通路（Enter）"
          onClick={(event) => {
            event.stopPropagation();
            data.finishAction?.onFinish();
          }}
        >
          ✓ 完成通路
        </button>
      </NodeToolbar>
    )}
    <Handle id="top" type="target" position={Position.Top} />
    <Handle id="left" type="target" position={Position.Left} />
    {data.step && (
      <b className={`step-badge ${data.draftStep ? "draft" : ""}`}>
        {data.step}
      </b>
    )}
    <strong>{data.node.name}</strong>
    {data.node.decompositionItems.length > 0 && (
      <ul>
        {data.node.decompositionItems.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    )}
    <Handle id="bottom" type="source" position={Position.Bottom} />
    <Handle id="right" type="source" position={Position.Right} />
  </div>
));
BusinessNode.displayName = "BusinessNode";

const LayerNode = memo(({ data, selected }: NodeProps<LayerFlowNode>) => (
  <div
    className={`layer-canvas-node depth-${data.depth} ${selected ? "selected" : ""}`}
  >
    <strong>{data.name}</strong>
    {data.isLeaf && <span>泳道</span>}
  </div>
));
LayerNode.displayName = "LayerNode";

const ParallelEdge = memo((props: EdgeProps<CanvasEdge>) => {
  const offset = props.data?.offset ?? 0;
  const direction = props.data?.direction ?? "TB";
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX + (direction === "TB" ? offset : 0),
    sourceY: props.sourceY + (direction === "LR" ? offset : 0),
    sourcePosition: props.sourcePosition,
    targetX: props.targetX + (direction === "TB" ? offset : 0),
    targetY: props.targetY + (direction === "LR" ? offset : 0),
    targetPosition: props.targetPosition,
    borderRadius: 8,
    offset: 24,
  });
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={18}
      />
      {props.label && (
        <EdgeLabelRenderer>
          <span
            className={`edge-step-label ${props.data?.draft ? "draft" : ""}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {props.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
ParallelEdge.displayName = "ParallelEdge";

const nodeTypes = { business: BusinessNode, layer: LayerNode };
const edgeTypes = { parallel: ParallelEdge };

const toolbarPositions: Record<NodeActionPosition, Position> = {
  bottom: Position.Bottom,
  right: Position.Right,
  left: Position.Left,
  top: Position.Top,
};
