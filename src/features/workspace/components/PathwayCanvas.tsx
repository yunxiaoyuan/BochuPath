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
  useNodesState,
  useReactFlow,
  useViewport,
  type CoordinateExtent,
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
import { descendantIds, sortStable } from "../../../domain/rules";
import {
  fullLayerPath,
  nodePathwayContext,
  nodePathways,
  pathwayCandidateNodes,
} from "../../../domain/selectors";
import {
  createPathway,
  reorderLayer,
  reorderNode,
  updatePathway,
} from "../../../editor/commands";
import { useEditorStore } from "../../../editor/store";
import { deriveEdges } from "../../../layout/derive-edges";
import { fitViewportToBounds } from "../../../layout/fit-viewport";
import {
  chooseNodeActionPosition,
  type NodeActionPosition,
} from "../../../layout/node-action-placement";
import {
  layoutDiagram,
  type DiagramLayout,
  type LayoutBusinessNode,
  type Rect,
} from "../../../layout/swimlane-layout";

interface Props {
  mode: EditorMode;
  onCreateNode: () => void;
}
interface BusinessData extends Record<string, unknown> {
  kind: "business";
  node: DiagramNode;
  style: NodeStyle;
  dimmed: boolean;
  related: boolean;
  candidate: boolean;
  step?: number;
  draftStep: boolean;
  fontSize: number;
  descriptionFontSize: number;
  canReorder: boolean;
  reorderAxis: "横向" | "纵向";
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
  canReorder: boolean;
  reorderAxis: "横向" | "纵向";
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

interface DragPreview {
  kind: "layer" | "node";
  draggedId: string;
  targetIndex: number;
  position: { x: number; y: number };
}

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
  const draggingRef = useRef(false);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const layout = useMemo(
    () => layoutDiagram(diagram, stageSize),
    [diagram, stageSize],
  );
  const focusedPath = useMemo(
    () => diagram.pathways.find((pathway) => pathway.id === focused),
    [diagram.pathways, focused],
  );
  const focusedIds = useMemo(
    () => new Set(focusedPath?.steps.map((step) => step.nodeId)),
    [focusedPath],
  );
  const selectedNodeContext = useMemo(
    () =>
      selection?.kind === "node" && multiSelectedNodeIds.length === 1
        ? nodePathwayContext(diagram, selection.id)
        : null,
    [diagram, multiSelectedNodeIds.length, selection],
  );
  const relatedPathwayIds = useMemo(
    () => new Set(selectedNodeContext?.visiblePathways.map((pathway) => pathway.id)),
    [selectedNodeContext],
  );
  const draftCandidateIds = useMemo(() => {
    const action = draft?.candidateAction;
    if (!draft || !action) return new Set<string>();
    const baseIds = action.kind === "replace"
      ? draft.nodeIds.filter((_, index) => index !== action.index)
      : draft.nodeIds;
    return new Set(
      pathwayCandidateNodes(diagram, baseIds, action.index).map((node) => node.id),
    );
  }, [diagram, draft]);

  const applyDraftCandidate = useCallback(
    (nodeId: string) => {
      if (!draft?.candidateAction || !draftCandidateIds.has(nodeId)) return;
      const action = draft.candidateAction;
      const nodeIds = [...draft.nodeIds];
      if (action.kind === "replace") nodeIds[action.index] = nodeId;
      else nodeIds.splice(action.index, 0, nodeId);
      setDraft({
        ...draft,
        nodeIds,
        candidateAction:
          draft.pathwayId === null && action.kind === "insert"
            ? { kind: "insert", index: action.index + 1 }
            : null,
      });
    },
    [draft, draftCandidateIds, setDraft],
  );

  const finishDraft = useCallback(() => {
    if (!draft || draft.nodeIds.length < 2) return;
    const before = new Set(diagram.pathways.map((pathway) => pathway.id));
    if (execute(draft.pathwayId ? "更新通路" : "新建通路", (current) =>
      draft.pathwayId
        ? updatePathway(current, draft.pathwayId, draft)
        : createPathway(current, draft),
    )) {
      const created = draft.pathwayId
        ? useEditorStore.getState().diagram?.pathways.find((pathway) => pathway.id === draft.pathwayId)
        : useEditorStore.getState().diagram?.pathways.find((pathway) => !before.has(pathway.id));
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

  const derivedNodes = useMemo<CanvasNode[]>(() => {
    const layerNodes: LayerFlowNode[] = [...layout.layers]
      .sort((left, right) => left.depth - right.depth)
      .map((rect) => {
        const layer = diagram.layers.find((item) => item.id === rect.id);
        const siblings = layer
          ? diagram.layers.filter((item) => item.parentId === layer.parentId)
          : [];
        const canReorder = mode === "edit" && tool === "select" && siblings.length > 1;
        return {
          id: `layer::${rect.id}`,
          type: "layer",
          position: { x: rect.x, y: rect.y },
          style: { width: rect.width, height: rect.height, zIndex: 0 },
          zIndex: 0,
          draggable: canReorder,
          extent: canReorder
            ? layerDragExtent(rect, layout.bounds, diagram.layout.direction)
            : undefined,
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
            canReorder,
            reorderAxis: diagram.layout.direction === "TB" ? "纵向" : "横向",
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
      const candidateMode = Boolean(draft?.candidateAction);
      const candidate = draftCandidateIds.has(node.id);
      const related = Boolean(
        selectedNodeContext?.relatedNodeIds.has(node.id) &&
        selection?.kind === "node" &&
        selection.id !== node.id,
      );
      const dimmed = candidateMode
        ? !candidate && draftStep <= 0
        : focusedIds.size
          ? !focusedIds.has(node.id)
          : selectedNodeContext
            ? !selectedNodeContext.relatedNodeIds.has(node.id)
            : false;
      const participationCount = nodePathways(diagram, node.id).length;
      const siblingRects = layout.nodes.filter((item) => item.layerId === node.layerId);
      const canReorder = mode === "edit" && tool === "select" && siblingRects.length > 1;
      return {
        id: node.id,
        type: "business",
        position: { x: rect.x, y: rect.y },
        style: { width: rect.width, height: rect.height },
        zIndex: 4,
        draggable: canReorder,
        extent: canReorder ? nodeDragExtent(siblingRects) : undefined,
        selectable: tool !== "connectPathway" || candidate,
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
          related,
          candidate,
          step: step && step > 0 ? step : undefined,
          draftStep: draftStep > 0,
          fontSize: diagram.layout.fontSize,
          descriptionFontSize: diagram.layout.descriptionFontSize,
          canReorder,
          reorderAxis: diagram.layout.direction === "TB" ? "横向" : "纵向",
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
    selectedNodeContext,
    selection,
    mode,
    tool,
    draftCandidateIds,
  ]);

  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<CanvasNode>(derivedNodes);

  useEffect(() => {
    if (!draggingRef.current) setFlowNodes(derivedNodes);
  }, [derivedNodes, setFlowNodes]);

  const edges = useMemo<CanvasEdge[]>(() => {
    const confirmed: CanvasEdge[] = deriveEdges(diagram)
      .filter((edge) => !draft?.pathwayId || edge.pathwayId !== draft.pathwayId)
      .map((edge) => {
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
      const isNodeRelated = relatedPathwayIds.has(edge.pathwayId);
      const dimmed = focused
        ? !isFocused
        : selectedNodeContext
          ? !isNodeRelated
          : false;
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
          strokeWidth: isFocused || isNodeRelated ? 3 : 2,
          strokeDasharray: edge.lineStyle === "dashed" ? "7 5" : undefined,
          opacity: dimmed ? 0.12 : 1,
        },
        zIndex: isFocused || isNodeRelated ? 3 : 2,
        className: isNodeRelated ? "related-edge" : dimmed ? "dimmed-edge" : undefined,
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
          dimmed,
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
  }, [diagram, draft, focused, relatedPathwayIds, selectedNodeContext, selection]);

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
      applyDraftCandidate(node.id);
      return;
    }
    if (tool !== "connectPathway")
      selectCanvasNode(node, event.ctrlKey || event.metaKey);
  };

  const resetDraggedNodes = useCallback(() => {
    draggingRef.current = false;
    dragPreviewRef.current = null;
    setFlowNodes(derivedNodes);
  }, [derivedNodes, setFlowNodes]);

  const handleNodeDrag = useCallback(
    (_event: MouseEvent | TouchEvent, dragged: CanvasNode) => {
      if (mode !== "edit" || tool !== "select") return;
      if (dragged.data.kind === "layer") {
        const id = dragged.id.replace("layer::", "");
        const source = diagram.layers.find((layer) => layer.id === id);
        const sourceRect = layout.layers.find((rect) => rect.id === id);
        if (!source || !sourceRect) return;
        const siblings = sortStable(
          diagram.layers.filter((layer) => layer.parentId === source.parentId),
        );
        const slots = siblings.map((layer) => layout.layers.find((rect) => rect.id === layer.id));
        const targetIndex = closestAxisSlotIndex(
          dragged.position,
          sourceRect,
          slots,
          diagram.layout.direction === "TB" ? "y" : "x",
        );
        const preview: DragPreview = {
          kind: "layer",
          draggedId: dragged.id,
          targetIndex,
          position: { ...dragged.position },
        };
        dragPreviewRef.current = preview;
        setFlowNodes((current) =>
          applyDragPreview(current, preview, diagram, layout),
        );
        return;
      }

      const source = diagram.nodes.find((node) => node.id === dragged.id);
      const sourceRect = layout.nodes.find((rect) => rect.id === dragged.id);
      if (!source || !sourceRect) return;
      const siblings = sortStable(
        diagram.nodes.filter((node) => node.layerId === source.layerId),
      );
      const slots = siblings.map((node) => layout.nodes.find((rect) => rect.id === node.id));
      const targetIndex = closestNodeSlotIndex(dragged.position, sourceRect, slots);
      const preview: DragPreview = {
        kind: "node",
        draggedId: dragged.id,
        targetIndex,
        position: { ...dragged.position },
      };
      const previous = dragPreviewRef.current;
      dragPreviewRef.current = preview;
      if (
        previous?.kind === preview.kind &&
        previous.draggedId === preview.draggedId &&
        previous.targetIndex === preview.targetIndex
      )
        return;
      setFlowNodes((current) =>
        applyDragPreview(current, preview, diagram, layout),
      );
    },
    [diagram, layout, mode, setFlowNodes, tool],
  );

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, dragged: CanvasNode) => {
      draggingRef.current = false;
      dragPreviewRef.current = null;
      if (mode !== "edit" || tool !== "select") {
        resetDraggedNodes();
        return;
      }
      if (dragged.data.kind === "layer") {
        const id = dragged.id.replace("layer::", "");
        const source = diagram.layers.find((layer) => layer.id === id);
        if (!source) return resetDraggedNodes();
        const siblings = sortStable(
          diagram.layers.filter((layer) => layer.parentId === source.parentId),
        );
        const sourceRect = layout.layers.find((rect) => rect.id === id);
        if (!sourceRect) return resetDraggedNodes();
        const targetIndex = closestAxisSlotIndex(
          dragged.position,
          sourceRect,
          siblings.map((layer) => layout.layers.find((rect) => rect.id === layer.id)),
          diagram.layout.direction === "TB" ? "y" : "x",
        );
        if (targetIndex === siblings.findIndex((layer) => layer.id === id)) {
          resetDraggedNodes();
          selectCanvasNode(dragged);
          return;
        }
        if (!execute("调整层级顺序", (current) => reorderLayer(current, id, targetIndex)))
          resetDraggedNodes();
        selectCanvasNode(dragged);
        return;
      }

      const source = diagram.nodes.find((node) => node.id === dragged.id);
      const sourceRect = layout.nodes.find((rect) => rect.id === dragged.id);
      if (!source || !sourceRect) return resetDraggedNodes();
      const siblings = sortStable(
        diagram.nodes.filter((node) => node.layerId === source.layerId),
      );
      const targetIndex = closestNodeSlotIndex(
        dragged.position,
        sourceRect,
        siblings.map((node) => layout.nodes.find((rect) => rect.id === node.id)),
      );
      if (targetIndex === siblings.findIndex((node) => node.id === dragged.id)) {
        resetDraggedNodes();
        selectCanvasNode(dragged);
        return;
      }
      if (!execute("调整节点顺序", (current) => reorderNode(current, dragged.id, targetIndex)))
        resetDraggedNodes();
      selectCanvasNode(dragged);
    },
    [diagram, execute, layout.layers, layout.nodes, mode, resetDraggedNodes, selectCanvasNode, tool],
  );

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const flowElement = target.closest<HTMLElement>(
      ".react-flow__node, .react-flow__edge",
    );
    const id = flowElement?.dataset.id;
    if (!id) return;

    if (event.altKey && mode === "edit" && tool === "select") {
      const backwardKey = diagram.layout.direction === "TB" ? "ArrowUp" : "ArrowLeft";
      const forwardKey = diagram.layout.direction === "TB" ? "ArrowDown" : "ArrowRight";
      const nodeBackwardKey = diagram.layout.direction === "TB" ? "ArrowLeft" : "ArrowUp";
      const nodeForwardKey = diagram.layout.direction === "TB" ? "ArrowRight" : "ArrowDown";
      const isLayer = id.startsWith("layer::");
      const delta = event.key === (isLayer ? backwardKey : nodeBackwardKey)
        ? -1
        : event.key === (isLayer ? forwardKey : nodeForwardKey)
          ? 1
          : 0;
      if (delta) {
        event.preventDefault();
        event.stopPropagation();
        if (isLayer) {
          const layerId = id.replace("layer::", "");
          const source = diagram.layers.find((layer) => layer.id === layerId);
          if (source) {
            const siblings = sortStable(diagram.layers.filter((layer) => layer.parentId === source.parentId));
            execute("调整层级顺序", (current) => reorderLayer(current, layerId, siblings.findIndex((layer) => layer.id === layerId) + delta));
          }
        } else {
          const source = diagram.nodes.find((node) => node.id === id);
          if (source) {
            const siblings = sortStable(diagram.nodes.filter((node) => node.layerId === source.layerId));
            execute("调整节点顺序", (current) => reorderNode(current, id, siblings.findIndex((node) => node.id === id) + delta));
          }
        }
        return;
      }
    }

    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.stopPropagation();

    const node = flowNodes.find((item) => item.id === id);
    if (node) {
      if (node.data.kind === "business" && tool === "connectPathway" && draft) {
        applyDraftCandidate(node.id);
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
            <span className="drag-order-hint">拖动或 Alt+方向键调整顺序</span>
          </div>
        )}
        <div className="tool-group">
          <button onClick={() => fitCanvas()} title="按当前屏幕比例自动布局并适应画布">
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
            {draft?.candidateAction
              ? `当前有 ${draftCandidateIds.size} 个合法候选；点击候选节点加入通路。`
              : "请在右侧选择插入或替换位置；Enter 完成，Esc 取消。"}
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
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={handleNodeClick}
          onNodeDragStart={() => {
            draggingRef.current = true;
            dragPreviewRef.current = null;
          }}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onEdgeClick={(_event, edge) => {
            if (edge.data?.pathwayId) focusPathway(edge.data.pathwayId);
          }}
          onPaneClick={() => {
            if (tool !== "connectPathway") select(null);
          }}
          selectNodesOnDrag={false}
          nodesDraggable={mode === "edit" && tool === "select"}
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
    className={`business-node ${data.canReorder ? "reorderable" : ""} ${selected ? "selected" : ""} ${data.related ? "related" : ""} ${data.candidate ? "candidate" : ""} ${data.dimmed ? "dimmed" : ""}`}
    title={data.canReorder ? `${data.reorderAxis}拖动可调整同层节点顺序` : undefined}
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
    <strong style={{ fontSize: data.fontSize }}>{data.node.name}</strong>
    {data.node.decompositionItems.length > 0 && (
      <ul style={{ fontSize: data.descriptionFontSize }}>
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
    className={`layer-canvas-node depth-${data.depth} ${data.canReorder ? "reorderable" : ""} ${selected ? "selected" : ""}`}
    title={data.canReorder ? `${data.reorderAxis}拖动可调整同级层级顺序` : undefined}
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

function applyDragPreview(
  nodes: CanvasNode[],
  preview: DragPreview,
  diagram: Diagram,
  layout: DiagramLayout,
): CanvasNode[] {
  if (preview.kind === "node") {
    const source = diagram.nodes.find((node) => node.id === preview.draggedId);
    if (!source) return nodes;
    const siblings = sortStable(
      diagram.nodes.filter((node) => node.layerId === source.layerId),
    );
    const slots = siblings.map((node) => layout.nodes.find((rect) => rect.id === node.id));
    const previewIds = reorderedIds(
      siblings.map((node) => node.id),
      preview.draggedId,
      preview.targetIndex,
    );
    return nodes.map((node) => {
      if (node.id === preview.draggedId)
        return withPreviewPosition(node, preview.position.x, preview.position.y);
      if (node.data.kind !== "business") return node;
      const previewIndex = previewIds.indexOf(node.id);
      const destination = previewIndex >= 0 ? slots[previewIndex] : undefined;
      return destination
        ? withPreviewPosition(node, destination.x, destination.y)
        : node;
    });
  }

  const draggedLayerId = preview.draggedId.replace("layer::", "");
  const source = diagram.layers.find((layer) => layer.id === draggedLayerId);
  const sourceRect = layout.layers.find((rect) => rect.id === draggedLayerId);
  if (!source || !sourceRect) return nodes;
  const siblings = sortStable(
    diagram.layers.filter((layer) => layer.parentId === source.parentId),
  );
  const slots = siblings.map((layer) => layout.layers.find((rect) => rect.id === layer.id));
  const previewIds = reorderedIds(
    siblings.map((layer) => layer.id),
    draggedLayerId,
    preview.targetIndex,
  );
  const groups = new Map<string, Set<string>>();
  const deltas = new Map<string, { x: number; y: number }>();
  siblings.forEach((layer) => {
    const ids = descendantIds(diagram, layer.id);
    ids.add(layer.id);
    groups.set(layer.id, ids);
    const original = layout.layers.find((rect) => rect.id === layer.id);
    if (!original) return;
    const destination = layer.id === draggedLayerId
      ? preview.position
      : slots[previewIds.indexOf(layer.id)];
    if (destination)
      deltas.set(layer.id, {
        x: destination.x - original.x,
        y: destination.y - original.y,
      });
  });

  return nodes.map((node) => {
    if (node.id === preview.draggedId)
      return withPreviewPosition(node, preview.position.x, preview.position.y);
    const domainLayerId = node.data.kind === "layer"
      ? node.id.replace("layer::", "")
      : node.data.node.layerId;
    const rootId = siblings.find((layer) => groups.get(layer.id)?.has(domainLayerId))?.id;
    const delta = rootId ? deltas.get(rootId) : undefined;
    const original = node.data.kind === "layer"
      ? layout.layers.find((rect) => rect.id === domainLayerId)
      : layout.nodes.find((rect) => rect.id === node.id);
    return delta && original
      ? withPreviewPosition(node, original.x + delta.x, original.y + delta.y)
      : node;
  });
}

function reorderedIds(ids: string[], id: string, targetIndex: number): string[] {
  const next = ids.filter((item) => item !== id);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, id);
  return next;
}

function withPreviewPosition(node: CanvasNode, x: number, y: number): CanvasNode {
  if (node.position.x === x && node.position.y === y) return node;
  return { ...node, position: { x, y } };
}

function layerDragExtent(
  rect: Rect,
  bounds: Rect,
  direction: "TB" | "LR",
): CoordinateExtent {
  if (direction === "TB") {
    return [
      [rect.x, bounds.y - bounds.height],
      [rect.x + rect.width, bounds.y + bounds.height * 2 + rect.height],
    ];
  }
  return [
    [bounds.x - bounds.width, rect.y],
    [bounds.x + bounds.width * 2 + rect.width, rect.y + rect.height],
  ];
}

function nodeDragExtent(rects: LayoutBusinessNode[]): CoordinateExtent {
  return [
    [Math.min(...rects.map((rect) => rect.x)), Math.min(...rects.map((rect) => rect.y))],
    [Math.max(...rects.map((rect) => rect.x + rect.width)), Math.max(...rects.map((rect) => rect.y + rect.height))],
  ];
}

function closestAxisSlotIndex(
  position: { x: number; y: number },
  draggedRect: Rect,
  slots: Array<Rect | undefined>,
  axis: "x" | "y",
): number {
  const center = position[axis] + (axis === "x" ? draggedRect.width : draggedRect.height) / 2;
  return closestIndex(slots, (slot) => {
    const slotCenter = slot[axis] + (axis === "x" ? slot.width : slot.height) / 2;
    return Math.abs(center - slotCenter);
  });
}

function closestNodeSlotIndex(
  position: { x: number; y: number },
  draggedRect: Rect,
  slots: Array<Rect | undefined>,
): number {
  const centerX = position.x + draggedRect.width / 2;
  const centerY = position.y + draggedRect.height / 2;
  return closestIndex(slots, (slot) => Math.hypot(
    centerX - (slot.x + slot.width / 2),
    centerY - (slot.y + slot.height / 2),
  ));
}

function closestIndex(
  slots: Array<Rect | undefined>,
  distance: (slot: Rect) => number,
): number {
  let result = 0;
  let minimum = Number.POSITIVE_INFINITY;
  slots.forEach((slot, index) => {
    if (!slot) return;
    const current = distance(slot);
    if (current < minimum) { minimum = current; result = index; }
  });
  return result;
}

const nodeTypes = { business: BusinessNode, layer: LayerNode };
const edgeTypes = { parallel: ParallelEdge };

const toolbarPositions: Record<NodeActionPosition, Position> = {
  bottom: Position.Bottom,
  right: Position.Right,
  left: Position.Left,
  top: Position.Top,
};
