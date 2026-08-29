import { memo, useMemo } from 'react';
import {
  Background, BaseEdge, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  getSmoothStepPath, useReactFlow, type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import type { DiagramNode, EditorMode, NodeStyle } from '../../../domain/types';
import { deriveEdges } from '../../../layout/derive-edges';
import { layoutDiagram } from '../../../layout/swimlane-layout';
import { createPathway } from '../../../editor/commands';
import { useEditorStore } from '../../../editor/store';

interface Props { mode: EditorMode; onCreateNode: () => void }
interface BusinessData extends Record<string, unknown> { kind: 'business'; node: DiagramNode; style: NodeStyle; dimmed: boolean; step?: number }
interface LayerData extends Record<string, unknown> { kind: 'layer'; name: string; depth: number; isLeaf: boolean }
type BusinessFlowNode = Node<BusinessData, 'business'>; type LayerFlowNode = Node<LayerData, 'layer'>; type CanvasNode = BusinessFlowNode | LayerFlowNode;
interface ParallelData extends Record<string, unknown> { offset: number; direction: 'TB' | 'LR'; dimmed: boolean; sequence: number }
type CanvasEdge = Edge<ParallelData>;

export function PathwayCanvas(props: Props) { return <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>; }

function CanvasInner({ mode, onCreateNode }: Props) {
  const diagram = useEditorStore((s) => s.diagram)!; const tool = useEditorStore((s) => s.tool); const setTool = useEditorStore((s) => s.setTool); const select = useEditorStore((s) => s.select); const selection = useEditorStore((s) => s.selection); const focused = useEditorStore((s) => s.focusedPathwayId); const draft = useEditorStore((s) => s.pathwayDraft); const setDraft = useEditorStore((s) => s.setPathwayDraft); const execute = useEditorStore((s) => s.execute); const { fitView, zoomIn, zoomOut } = useReactFlow();
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const focusedPath = diagram.pathways.find((x) => x.id === focused); const focusedIds = new Set(focusedPath?.steps.map((x) => x.nodeId));
  const relatedIds = new Set<string>(); if (selection?.kind === 'node') { relatedIds.add(selection.id); deriveEdges(diagram).filter((x) => x.sourceNodeId === selection.id || x.targetNodeId === selection.id).forEach((x) => { relatedIds.add(x.sourceNodeId); relatedIds.add(x.targetNodeId); }); }
  const nodes = useMemo<CanvasNode[]>(() => {
    const layerNodes: LayerFlowNode[] = [...layout.layers].sort((a, b) => a.depth - b.depth).map((rect) => ({ id: `layer::${rect.id}`, type: 'layer', position: { x: rect.x, y: rect.y }, style: { width: rect.width, height: rect.height, zIndex: -rect.depth }, draggable: false, selectable: true, data: { kind: 'layer', name: diagram.layers.find((x) => x.id === rect.id)?.name ?? '', depth: rect.depth, isLeaf: rect.isLeaf } }));
    const businessNodes: BusinessFlowNode[] = layout.nodes.map((rect) => { const node = diagram.nodes.find((x) => x.id === rect.id)!; const style = diagram.nodeStyles.find((x) => x.id === node.styleId) ?? diagram.nodeStyles[0]!; const step = focusedPath ? [...focusedPath.steps].sort((a, b) => a.order - b.order).findIndex((x) => x.nodeId === node.id) + 1 : undefined; const dimmed = focusedIds.size ? !focusedIds.has(node.id) : relatedIds.size ? !relatedIds.has(node.id) : false; return { id: node.id, type: 'business', position: { x: rect.x, y: rect.y }, style: { width: rect.width, height: rect.height }, draggable: false, selectable: true, selected: selection?.kind === 'node' && selection.id === node.id, data: { kind: 'business', node, style, dimmed, step: step && step > 0 ? step : undefined } }; });
    return [...layerNodes, ...businessNodes];
  }, [diagram, layout, selection, focused]);
  const edges = useMemo<CanvasEdge[]>(() => {
    const confirmed: CanvasEdge[] = deriveEdges(diagram).map((edge) => ({ id: edge.id, type: 'parallel', source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: diagram.layout.direction === 'TB' ? 'bottom' : 'right', targetHandle: diagram.layout.direction === 'TB' ? 'top' : 'left', markerEnd: { type: MarkerType.ArrowClosed, color: edge.color, width: 16, height: 16 }, style: { stroke: edge.color, strokeWidth: focused === edge.pathwayId ? 3 : 2, strokeDasharray: edge.lineStyle === 'dashed' ? '7 5' : undefined, opacity: focused && focused !== edge.pathwayId ? .14 : 1 }, label: focused === edge.pathwayId ? String(edge.sequence) : undefined, labelStyle: { fill: edge.color, fontWeight: 700 }, data: { offset: edge.parallelOffset, direction: diagram.layout.direction, dimmed: Boolean(focused && focused !== edge.pathwayId), sequence: edge.sequence } }));
    const candidates: CanvasEdge[] = draft?.nodeIds.slice(0, -1).map((id, index) => ({ id: `draft::${index}`, type: 'parallel', source: id, target: draft.nodeIds[index + 1]!, sourceHandle: diagram.layout.direction === 'TB' ? 'bottom' : 'right', targetHandle: diagram.layout.direction === 'TB' ? 'top' : 'left', animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: draft.color }, style: { stroke: draft.color, strokeWidth: 2, strokeDasharray: '5 5' }, label: String(index + 1), data: { offset: 0, direction: diagram.layout.direction, dimmed: false, sequence: index + 1 } })) ?? [];
    return [...confirmed, ...candidates];
  }, [diagram, focused, draft]);
  const handleNodeClick = (event: React.MouseEvent, node: CanvasNode) => {
    if (node.data.kind === 'layer') { select({ kind: 'layer', id: node.id.replace('layer::', '') }); return; }
    if (tool === 'connectPathway' && draft) { if (!draft.nodeIds.includes(node.id)) setDraft({ ...draft, nodeIds: [...draft.nodeIds, node.id] }); return; }
    select({ kind: 'node', id: node.id }, event.ctrlKey || event.metaKey);
  };
  const finishDraft = () => { if (!draft || draft.nodeIds.length < 2) return; if (execute('新建通路', (d) => createPathway(d, draft))) setTool('select'); };
  return <section id="canvas-region" className="canvas-workspace" aria-label="通路图工作区">
    <div className="canvas-toolbar" role="toolbar" aria-label="画布工具栏">
      <div className="tool-group"><button aria-pressed={tool === 'select'} onClick={() => setTool('select')} title="选择 V">↖ <span>选择</span></button><button aria-pressed={tool === 'marquee'} onClick={() => setTool('marquee')} title="框选">⬚</button><button aria-pressed={tool === 'pan'} onClick={() => setTool('pan')} title="平移 H">✥</button></div>
      {mode === 'edit' && <div className="tool-group"><button onClick={onCreateNode} title="新增节点">＋ 节点</button><button aria-pressed={tool === 'connectPathway'} onClick={() => setTool(tool === 'connectPathway' ? 'select' : 'connectPathway')} title="连接通路 C">⌁ 连接</button></div>}
      <div className="tool-group"><button onClick={() => void fitView({ padding: .12, duration: 200 })} title="自动布局并适应画布">布局</button><button onClick={() => void zoomOut()} aria-label="缩小">−</button><button onClick={() => void zoomIn()} aria-label="放大">＋</button><button onClick={() => void fitView({ padding: .12, duration: 200 })} title="适应画布 0">适应</button></div>
    </div>
    {tool === 'connectPathway' && <div className="connect-guide" role="status"><span>依次点击节点建立通路；Enter 完成，Esc 取消</span><strong>已选 {draft?.nodeIds.length ?? 0} 个</strong><button disabled={!draft || draft.nodeIds.length < 2} onClick={finishDraft}>完成</button><button onClick={() => setTool('select')}>取消</button></div>}
    <div className="flow-wrap" role="region" aria-label="通路图画布">
      <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={handleNodeClick} onPaneClick={() => select(null)} nodesDraggable={false} panOnDrag={tool === 'pan' || tool === 'select'} selectionOnDrag={tool === 'marquee'} elementsSelectable={tool !== 'pan'} minZoom={.2} maxZoom={2.5} fitView fitViewOptions={{ padding: .12 }} proOptions={{ hideAttribution: true }}>
        <Background gap={20} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(node) => node.type === 'layer' ? 'transparent' : 'var(--color-brand-5)'} />
      </ReactFlow>
      {!diagram.layers.length && <div className="canvas-empty"><span>⌘</span><h2>从层级开始搭建通路图</h2><p>创建层级后即可放入节点，再用有序通路连接它们。</p>{mode === 'edit' && <button className="primary-button" onClick={onCreateNode}>开始创建</button>}</div>}
    </div>
  </section>;
}

const BusinessNode = memo(({ data, selected }: NodeProps<BusinessFlowNode>) => <div className={`business-node ${selected ? 'selected' : ''} ${data.dimmed ? 'dimmed' : ''}`} style={{ background: data.style.fillColor, borderColor: data.style.borderColor, borderStyle: data.style.borderStyle, borderWidth: data.style.borderWidth, borderRadius: data.style.shape === 'rect' ? 0 : data.style.borderRadius, color: data.style.textColor }} tabIndex={0} aria-label={`${data.node.name}，${data.node.decompositionItems.length} 项拆解信息`}>
  <Handle id="top" type="target" position={Position.Top} /><Handle id="left" type="target" position={Position.Left} />{data.step && <b className="step-badge">{data.step}</b>}<strong>{data.node.name}</strong>{data.node.decompositionItems.length > 0 && <ul>{data.node.decompositionItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}<Handle id="bottom" type="source" position={Position.Bottom} /><Handle id="right" type="source" position={Position.Right} />
</div>); BusinessNode.displayName = 'BusinessNode';
const LayerNode = memo(({ data, selected }: NodeProps<LayerFlowNode>) => <div className={`layer-canvas-node depth-${data.depth} ${selected ? 'selected' : ''}`}><strong>{data.name}</strong>{data.isLeaf && <span>泳道</span>}</div>); LayerNode.displayName = 'LayerNode';
const ParallelEdge = memo((props: EdgeProps<CanvasEdge>) => { const offset = props.data?.offset ?? 0; const direction = props.data?.direction ?? 'TB'; const [path, labelX, labelY] = getSmoothStepPath({ sourceX: props.sourceX + (direction === 'TB' ? offset : 0), sourceY: props.sourceY + (direction === 'LR' ? offset : 0), sourcePosition: props.sourcePosition, targetX: props.targetX + (direction === 'TB' ? offset : 0), targetY: props.targetY + (direction === 'LR' ? offset : 0), targetPosition: props.targetPosition, borderRadius: 8, offset: 24 }); return <BaseEdge path={path} markerEnd={props.markerEnd} style={props.style} labelX={labelX} labelY={labelY} interactionWidth={18} />; }); ParallelEdge.displayName = 'ParallelEdge';
const nodeTypes = { business: BusinessNode, layer: LayerNode }; const edgeTypes = { parallel: ParallelEdge };
