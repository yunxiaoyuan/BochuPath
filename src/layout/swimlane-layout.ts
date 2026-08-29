import { layerChildren } from '../domain/selectors';
import { layerDepth, sortStable } from '../domain/rules';
import type { Diagram, DiagramNode, Layer } from '../domain/types';

export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface LayoutViewport { width: number; height: number }
export interface LayoutBusinessNode extends Rect { id: string; kind: 'node'; layerId: string }
export interface LayoutLayerNode extends Rect { id: string; kind: 'layer'; depth: number; isLeaf: boolean }
export interface DiagramLayout { nodes: LayoutBusinessNode[]; layers: LayoutLayerNode[]; bounds: Rect }

interface Packing {
  nodeWidth: number;
  nodeGap: number;
  layerGap: number;
  capacity: number;
}

const OUTER = 32;
const HEADER = 36;
const LANE_PADDING = 20;
const COMPACT_NODE_WIDTH = 104;
const COMPACT_NODE_GAP = 8;
const COMPACT_LAYER_GAP = 16;
const ROW_PREFERENCE_WEIGHT = 0.28;
const MIN_SINGLE_AXIS_SCALE = 0.78;

export function layoutDiagram(diagram: Diagram, viewport?: LayoutViewport): DiagramLayout {
  try { return calculate(diagram, validViewport(viewport)); } catch { return fallback(diagram); }
}

function calculate(diagram: Diagram, viewport?: LayoutViewport): DiagramLayout {
  const roots = layerChildren(diagram, null);
  const leaves: Layer[] = [];
  const walk = (layer: Layer) => {
    const children = layerChildren(diagram, layer.id);
    if (!children.length) leaves.push(layer);
    else children.forEach(walk);
  };
  roots.forEach(walk);

  const nodesByLeaf = new Map(leaves.map((leaf) => [
    leaf.id,
    sortStable(diagram.nodes.filter((node) => node.layerId === leaf.id)),
  ]));
  const nodeRects: LayoutBusinessNode[] = [];
  const leafRects = new Map<string, Rect>();

  if (diagram.layout.direction === 'TB') {
    layoutTopToBottom(diagram, leaves, nodesByLeaf, nodeRects, leafRects, viewport);
  } else {
    layoutLeftToRight(diagram, leaves, nodesByLeaf, nodeRects, leafRects, viewport);
  }

  const layers = sortStable(diagram.layers).map((layer): LayoutLayerNode => {
    const childLeafIds = descendantLeafIds(diagram, layer.id);
    const rects = childLeafIds.map((id) => leafRects.get(id)).filter((rect): rect is Rect => Boolean(rect));
    const own = leafRects.get(layer.id);
    if (own) return { ...own, id: layer.id, kind: 'layer', depth: layerDepth(diagram, layer), isLeaf: true };
    const minX = Math.min(...rects.map((rect) => rect.x));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { id: layer.id, kind: 'layer', depth: layerDepth(diagram, layer), isLeaf: false, x: minX - 12, y: minY - HEADER, width: maxX - minX + 24, height: maxY - minY + HEADER + 12 };
  });
  const all = [...layers, ...nodeRects];
  const bounds = all.length ? union(all) : { x: 0, y: 0, width: 720, height: 480 };
  return { nodes: nodeRects, layers, bounds };
}

function layoutTopToBottom(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  nodeRects: LayoutBusinessNode[],
  leafRects: Map<string, Rect>,
  viewport?: LayoutViewport,
): void {
  const packing = chooseTbPacking(diagram, leaves, nodesByLeaf, viewport);
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  const usedColumns = Math.min(maxCount, packing.capacity);
  const minimumLaneWidth = viewport ? Math.min(720, Math.max(420, viewport.width - OUTER * 2)) : 720;
  const laneWidth = Math.max(
    minimumLaneWidth,
    LANE_PADDING * 2 + usedColumns * packing.nodeWidth + Math.max(0, usedColumns - 1) * packing.nodeGap,
  );
  let cursor = OUTER;

  leaves.forEach((leaf) => {
    const nodes = nodesByLeaf.get(leaf.id) ?? [];
    const rows = chunk(nodes, packing.capacity);
    const rowHeights = rows.length
      ? rows.map((row) => Math.max(diagram.layout.nodeMinHeight, ...row.map((node) => nodeHeight(diagram, node, packing.nodeWidth))))
      : [diagram.layout.nodeMinHeight];
    const contentHeight = rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * packing.nodeGap;
    const rect = { x: OUTER, y: cursor, width: laneWidth, height: HEADER + LANE_PADDING * 2 + contentHeight };
    leafRects.set(leaf.id, rect);

    let rowY = rect.y + HEADER + LANE_PADDING;
    rows.forEach((row, rowIndex) => {
      row.forEach((node, columnIndex) => nodeRects.push({
        id: node.id,
        kind: 'node',
        layerId: leaf.id,
        x: rect.x + LANE_PADDING + columnIndex * (packing.nodeWidth + packing.nodeGap),
        y: rowY,
        width: packing.nodeWidth,
        height: rowHeights[rowIndex]!,
      }));
      rowY += rowHeights[rowIndex]! + packing.nodeGap;
    });
    cursor += rect.height + packing.layerGap;
  });
}

function layoutLeftToRight(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  nodeRects: LayoutBusinessNode[],
  leafRects: Map<string, Rect>,
  viewport?: LayoutViewport,
): void {
  const packing = chooseLrPacking(diagram, leaves, nodesByLeaf, viewport);
  const maximumNodeHeight = Math.max(
    diagram.layout.nodeMinHeight,
    ...diagram.nodes.map((node) => nodeHeight(diagram, node, packing.nodeWidth)),
  );
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  const usedRows = Math.min(maxCount, packing.capacity);
  const minimumLaneHeight = viewport ? Math.min(420, Math.max(320, viewport.height - OUTER * 2)) : 420;
  const laneHeight = Math.max(
    minimumLaneHeight,
    LANE_PADDING * 2 + usedRows * maximumNodeHeight + Math.max(0, usedRows - 1) * packing.nodeGap,
  );
  let cursor = OUTER;

  leaves.forEach((leaf) => {
    const nodes = nodesByLeaf.get(leaf.id) ?? [];
    const columnCount = Math.max(1, Math.ceil(nodes.length / packing.capacity));
    const width = HEADER + LANE_PADDING * 2 + columnCount * packing.nodeWidth + Math.max(0, columnCount - 1) * packing.nodeGap;
    const rect = { x: cursor, y: OUTER, width, height: laneHeight };
    leafRects.set(leaf.id, rect);
    nodes.forEach((node, index) => {
      const column = Math.floor(index / packing.capacity);
      const row = index % packing.capacity;
      nodeRects.push({
        id: node.id,
        kind: 'node',
        layerId: leaf.id,
        x: rect.x + HEADER + LANE_PADDING + column * (packing.nodeWidth + packing.nodeGap),
        y: rect.y + LANE_PADDING + row * (maximumNodeHeight + packing.nodeGap),
        width: packing.nodeWidth,
        height: maximumNodeHeight,
      });
    });
    cursor += rect.width + packing.layerGap;
  });
}

function chooseTbPacking(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  viewport?: LayoutViewport,
): Packing {
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  if (!viewport) return { nodeWidth: diagram.layout.nodeWidth, nodeGap: diagram.layout.nodeGap, layerGap: diagram.layout.layerGap, capacity: maxCount };
  let best: Packing | undefined;
  let bestScore = -1;
  let bestSingleAxis: Packing | undefined;
  let bestSingleAxisScale = -1;
  for (const nodeWidth of densityValues(diagram.layout.nodeWidth, COMPACT_NODE_WIDTH)) {
    for (const nodeGap of densityValues(diagram.layout.nodeGap, COMPACT_NODE_GAP)) {
      for (const layerGap of densityValues(diagram.layout.layerGap, COMPACT_LAYER_GAP)) {
        for (let capacity = maxCount; capacity >= 1; capacity -= 1) {
          const packing = { nodeWidth, nodeGap, layerGap, capacity };
          const dimensions = measureTb(diagram, leaves, nodesByLeaf, packing, viewport);
          const scale = projectedScale(dimensions, viewport);
          if (capacity === maxCount && scale > bestSingleAxisScale + 0.001) {
            bestSingleAxis = packing;
            bestSingleAxisScale = scale;
          }
          const rowPreference = capacity / maxCount;
          const score = scale * (1 - ROW_PREFERENCE_WEIGHT + ROW_PREFERENCE_WEIGHT * rowPreference);
          if (score > bestScore + 0.001) { best = packing; bestScore = score; }
        }
      }
    }
  }
  return bestSingleAxis && bestSingleAxisScale >= MIN_SINGLE_AXIS_SCALE
    ? bestSingleAxis
    : best!;
}

function chooseLrPacking(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  viewport?: LayoutViewport,
): Packing {
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  if (!viewport) return { nodeWidth: diagram.layout.nodeWidth, nodeGap: diagram.layout.nodeGap, layerGap: diagram.layout.layerGap, capacity: maxCount };
  let best: Packing | undefined;
  let bestScore = -1;
  let bestSingleAxis: Packing | undefined;
  let bestSingleAxisScale = -1;
  for (const nodeWidth of densityValues(diagram.layout.nodeWidth, COMPACT_NODE_WIDTH)) {
    for (const nodeGap of densityValues(diagram.layout.nodeGap, COMPACT_NODE_GAP)) {
      for (const layerGap of densityValues(diagram.layout.layerGap, COMPACT_LAYER_GAP)) {
        for (let capacity = maxCount; capacity >= 1; capacity -= 1) {
          const packing = { nodeWidth, nodeGap, layerGap, capacity };
          const dimensions = measureLr(diagram, leaves, nodesByLeaf, packing, viewport);
          const scale = projectedScale(dimensions, viewport);
          if (capacity === maxCount && scale > bestSingleAxisScale + 0.001) {
            bestSingleAxis = packing;
            bestSingleAxisScale = scale;
          }
          const columnPreference = capacity / maxCount;
          const score = scale * (1 - ROW_PREFERENCE_WEIGHT + ROW_PREFERENCE_WEIGHT * columnPreference);
          if (score > bestScore + 0.001) { best = packing; bestScore = score; }
        }
      }
    }
  }
  return bestSingleAxis && bestSingleAxisScale >= MIN_SINGLE_AXIS_SCALE
    ? bestSingleAxis
    : best!;
}

function measureTb(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  packing: Packing,
  viewport: LayoutViewport,
): { width: number; height: number } {
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  const usedColumns = Math.min(maxCount, packing.capacity);
  const laneWidth = Math.max(
    Math.min(720, Math.max(420, viewport.width - OUTER * 2)),
    LANE_PADDING * 2 + usedColumns * packing.nodeWidth + Math.max(0, usedColumns - 1) * packing.nodeGap,
  );
  const laneHeights = leaves.map((leaf) => {
    const rows = chunk(nodesByLeaf.get(leaf.id) ?? [], packing.capacity);
    const rowHeights = rows.length
      ? rows.map((row) => Math.max(diagram.layout.nodeMinHeight, ...row.map((node) => nodeHeight(diagram, node, packing.nodeWidth))))
      : [diagram.layout.nodeMinHeight];
    return HEADER + LANE_PADDING * 2 + rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * packing.nodeGap;
  });
  return {
    width: laneWidth + OUTER * 2,
    height: laneHeights.reduce((total, height) => total + height, OUTER * 2) + Math.max(0, leaves.length - 1) * packing.layerGap,
  };
}

function measureLr(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  packing: Packing,
  viewport: LayoutViewport,
): { width: number; height: number } {
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  const maximumNodeHeight = Math.max(
    diagram.layout.nodeMinHeight,
    ...diagram.nodes.map((node) => nodeHeight(diagram, node, packing.nodeWidth)),
  );
  const usedRows = Math.min(maxCount, packing.capacity);
  const laneHeight = Math.max(
    Math.min(420, Math.max(320, viewport.height - OUTER * 2)),
    LANE_PADDING * 2 + usedRows * maximumNodeHeight + Math.max(0, usedRows - 1) * packing.nodeGap,
  );
  const widths = leaves.map((leaf) => {
    const count = nodesByLeaf.get(leaf.id)?.length ?? 0;
    const columns = Math.max(1, Math.ceil(count / packing.capacity));
    return HEADER + LANE_PADDING * 2 + columns * packing.nodeWidth + Math.max(0, columns - 1) * packing.nodeGap;
  });
  return {
    width: widths.reduce((total, width) => total + width, OUTER * 2) + Math.max(0, leaves.length - 1) * packing.layerGap,
    height: laneHeight + OUTER * 2,
  };
}

function nodeHeight(diagram: Diagram, node: DiagramNode, nodeWidth: number): number {
  const contentWidth = Math.max(48, nodeWidth - 28);
  const titleLine = Math.ceil(diagram.layout.fontSize * 1.45);
  const detailLine = Math.ceil(diagram.layout.descriptionFontSize * 1.4);
  const titleLines = wrappedLineCount(node.name, diagram.layout.fontSize, contentWidth);
  const detailLines = node.decompositionItems.reduce(
    (total, item) => total + wrappedLineCount(item, diagram.layout.descriptionFontSize, Math.max(32, contentWidth - 16)),
    0,
  );
  const details = detailLines ? 5 + detailLines * detailLine : 0;
  return Math.max(diagram.layout.nodeMinHeight, 24 + titleLines * titleLine + details);
}

function wrappedLineCount(text: string, fontSize: number, width: number): number {
  const textWidth = [...text].reduce(
    (total, character) => total + fontSize * (/^[\u0000-\u00ff]$/.test(character) ? 0.58 : 1),
    0,
  );
  return Math.max(1, Math.ceil(textWidth / Math.max(1, width)));
}

function densityValues(configured: number, compact: number): number[] {
  return [...new Set([configured, Math.min(configured, Math.max(compact, Math.round(configured * 0.88))), Math.min(configured, compact)])];
}

function projectedScale(bounds: { width: number; height: number }, viewport: LayoutViewport): number {
  return Math.min(1, Math.max(1, viewport.width - 64) / Math.max(1, bounds.width), Math.max(1, viewport.height - 64) / Math.max(1, bounds.height));
}

function validViewport(viewport?: LayoutViewport): LayoutViewport | undefined {
  return viewport && viewport.width > 0 && viewport.height > 0 ? viewport : undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function descendantLeafIds(diagram: Diagram, id: string): string[] {
  const children = layerChildren(diagram, id);
  if (!children.length) return [id];
  return children.flatMap((child) => descendantLeafIds(diagram, child.id));
}

function union(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function fallback(diagram: Diagram): DiagramLayout {
  const nodes = sortStable(diagram.nodes).map((node, index): LayoutBusinessNode => ({ id: node.id, kind: 'node', layerId: node.layerId, x: 40 + index % 4 * 220, y: 60 + Math.floor(index / 4) * 120, width: diagram.layout.nodeWidth, height: diagram.layout.nodeMinHeight }));
  return { nodes, layers: [], bounds: nodes.length ? union(nodes) : { x: 0, y: 0, width: 720, height: 480 } };
}
