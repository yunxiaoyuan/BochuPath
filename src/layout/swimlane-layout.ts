import { layerChildren } from '../domain/selectors';
import { layerDepth, sortStable } from '../domain/rules';
import type { Diagram, Layer } from '../domain/types';

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface LayoutBusinessNode extends Rect { id: string; kind: 'node'; layerId: string }
export interface LayoutLayerNode extends Rect { id: string; kind: 'layer'; depth: number; isLeaf: boolean }
export interface DiagramLayout { nodes: LayoutBusinessNode[]; layers: LayoutLayerNode[]; bounds: Rect }

const OUTER = 32; const HEADER = 36; const LANE_PADDING = 20;

export function layoutDiagram(diagram: Diagram): DiagramLayout {
  try { return calculate(diagram); } catch { return fallback(diagram); }
}

function calculate(diagram: Diagram): DiagramLayout {
  const roots = layerChildren(diagram, null); const leaves: Layer[] = [];
  const walk = (layer: Layer) => { const children = layerChildren(diagram, layer.id); if (!children.length) leaves.push(layer); else children.forEach(walk); };
  roots.forEach(walk);
  const nodeRects: LayoutBusinessNode[] = []; const leafRects = new Map<string, Rect>(); let cursor = OUTER;
  const maxCount = Math.max(1, ...leaves.map((leaf) => diagram.nodes.filter((node) => node.layerId === leaf.id).length));
  const nodeHeight = (nodeId: string) => {
    const node = diagram.nodes.find((x) => x.id === nodeId); return Math.max(diagram.layout.nodeMinHeight, 52 + Math.max(0, (node?.decompositionItems.length ?? 0) - 1) * 18);
  };
  if (diagram.layout.direction === 'TB') {
    const laneWidth = Math.max(720, LANE_PADDING * 2 + maxCount * diagram.layout.nodeWidth + Math.max(0, maxCount - 1) * diagram.layout.nodeGap);
    leaves.forEach((leaf) => {
      const nodes = sortStable(diagram.nodes.filter((x) => x.layerId === leaf.id)); const maxHeight = Math.max(diagram.layout.nodeMinHeight, ...nodes.map((x) => nodeHeight(x.id)));
      const rect = { x: OUTER, y: cursor, width: laneWidth, height: HEADER + LANE_PADDING * 2 + maxHeight }; leafRects.set(leaf.id, rect);
      nodes.forEach((node, index) => nodeRects.push({ id: node.id, kind: 'node', layerId: leaf.id, x: rect.x + LANE_PADDING + index * (diagram.layout.nodeWidth + diagram.layout.nodeGap), y: rect.y + HEADER + LANE_PADDING, width: diagram.layout.nodeWidth, height: maxHeight }));
      cursor += rect.height + diagram.layout.layerGap;
    });
  } else {
    const laneHeight = Math.max(420, LANE_PADDING * 2 + maxCount * diagram.layout.nodeMinHeight + Math.max(0, maxCount - 1) * diagram.layout.nodeGap);
    leaves.forEach((leaf) => {
      const nodes = sortStable(diagram.nodes.filter((x) => x.layerId === leaf.id)); const width = HEADER + LANE_PADDING * 2 + diagram.layout.nodeWidth;
      const rect = { x: cursor, y: OUTER, width, height: laneHeight }; leafRects.set(leaf.id, rect);
      nodes.forEach((node, index) => nodeRects.push({ id: node.id, kind: 'node', layerId: leaf.id, x: rect.x + HEADER + LANE_PADDING, y: rect.y + LANE_PADDING + index * (diagram.layout.nodeMinHeight + diagram.layout.nodeGap), width: diagram.layout.nodeWidth, height: nodeHeight(node.id) }));
      cursor += rect.width + diagram.layout.layerGap;
    });
  }
  const layers = sortStable(diagram.layers).map((layer): LayoutLayerNode => {
    const childLeafIds = descendantLeafIds(diagram, layer.id); const rects = childLeafIds.map((id) => leafRects.get(id)).filter((x): x is Rect => Boolean(x));
    const own = leafRects.get(layer.id); if (own) return { ...own, id: layer.id, kind: 'layer', depth: layerDepth(diagram, layer), isLeaf: true };
    const minX = Math.min(...rects.map((x) => x.x)); const minY = Math.min(...rects.map((x) => x.y)); const maxX = Math.max(...rects.map((x) => x.x + x.width)); const maxY = Math.max(...rects.map((x) => x.y + x.height));
    return { id: layer.id, kind: 'layer', depth: layerDepth(diagram, layer), isLeaf: false, x: minX - 12, y: minY - HEADER, width: maxX - minX + 24, height: maxY - minY + HEADER + 12 };
  });
  const all = [...layers, ...nodeRects]; const bounds = all.length ? union(all) : { x: 0, y: 0, width: 720, height: 480 };
  return { nodes: nodeRects, layers, bounds };
}

function descendantLeafIds(diagram: Diagram, id: string): string[] {
  const children = layerChildren(diagram, id); if (!children.length) return [id]; return children.flatMap((child) => descendantLeafIds(diagram, child.id));
}
function union(rects: Rect[]): Rect { const minX = Math.min(...rects.map((x) => x.x)); const minY = Math.min(...rects.map((x) => x.y)); const maxX = Math.max(...rects.map((x) => x.x + x.width)); const maxY = Math.max(...rects.map((x) => x.y + x.height)); return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }; }
function fallback(diagram: Diagram): DiagramLayout {
  const nodes = sortStable(diagram.nodes).map((node, index): LayoutBusinessNode => ({ id: node.id, kind: 'node', layerId: node.layerId, x: 40 + index % 4 * 220, y: 60 + Math.floor(index / 4) * 120, width: diagram.layout.nodeWidth, height: diagram.layout.nodeMinHeight }));
  return { nodes, layers: [], bounds: nodes.length ? union(nodes) : { x: 0, y: 0, width: 720, height: 480 } };
}
