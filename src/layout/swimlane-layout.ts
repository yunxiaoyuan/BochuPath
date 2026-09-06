import { orderedLeafLayers } from '../domain/layer-order';
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

interface PackedBusinessNode {
  node: DiagramNode;
  width: number;
}

interface LrColumnMetrics {
  nodes: DiagramNode[];
  nodeWidths: number[];
  nodeHeights: number[];
  width: number;
  height: number;
}

export const ADAPTIVE_LAYOUT_PADDING = 12;

const OUTER = ADAPTIVE_LAYOUT_PADDING;
const HEADER = 24;
const LANE_PADDING = 4;
const COMPACT_NODE_WIDTH = 104;
const COMPACT_NODE_MIN_WIDTH = 64;
const COMPACT_NODE_MIN_HEIGHT = 32;
const COMFORTABLE_NODE_MAX_WIDTH = 240;
const COMPACT_NODE_GAP = 4;
const COMPACT_LAYER_GAP = 4;
const ROW_PREFERENCE_WEIGHT = 0.28;
const MIN_SINGLE_AXIS_SCALE = 0.78;
const LAYER_HORIZONTAL_PADDING = 4;
const LAYER_BOTTOM_PADDING = 4;
const MIN_NESTED_LAYER_GAP = 4;

export function layoutDiagram(diagram: Diagram, viewport?: LayoutViewport): DiagramLayout {
  try { return calculate(diagram, validViewport(viewport)); } catch { return fallback(diagram); }
}

function calculate(diagram: Diagram, viewport?: LayoutViewport): DiagramLayout {
  const leaves = orderedLeafLayers(diagram);

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

  const layerRects = buildLayerRects(diagram, leafRects);
  const layers = sortStable(diagram.layers).map((layer): LayoutLayerNode => {
    const rect = layerRects.get(layer.id);
    if (!rect) throw new Error(`Unable to lay out layer ${layer.id}`);
    return {
      ...rect,
      id: layer.id,
      kind: 'layer',
      depth: layerDepth(diagram, layer),
      isLeaf: !layerChildren(diagram, layer.id).length,
    };
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
  const adaptive = Boolean(viewport);
  const maxCount = Math.max(1, ...leaves.map((leaf) => nodesByLeaf.get(leaf.id)?.length ?? 0));
  const usedColumns = Math.min(maxCount, packing.capacity);
  const gaps = nestedLayerGaps(diagram, leaves, packing.layerGap, 'TB');
  const configuredLaneWidth = LANE_PADDING * 2
    + usedColumns * packing.nodeWidth
    + Math.max(0, usedColumns - 1) * packing.nodeGap;
  const contentLaneWidth = adaptive
    ? preferredTbLaneWidth(diagram, leaves, nodesByLeaf, packing)
    : configuredLaneWidth;
  const laneWidth = viewport
    ? Math.max(420, Math.min(Math.max(420, viewport.width - OUTER * 2), contentLaneWidth))
    : Math.max(720, contentLaneWidth);
  let cursor = OUTER;

  leaves.forEach((leaf, index) => {
    const nodes = nodesByLeaf.get(leaf.id) ?? [];
    const rows = packTbRows(diagram, nodes, packing, laneWidth, adaptive);
    const rowHeights = rows.length
      ? rows.map((row) => Math.max(
          adaptiveNodeMinHeight(diagram, adaptive),
          ...row.map((item) => nodeHeight(diagram, item.node, item.width, adaptive)),
        ))
      : [adaptiveNodeMinHeight(diagram, adaptive)];
    const contentHeight = rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * packing.nodeGap;
    const rect = { x: OUTER, y: cursor, width: laneWidth, height: HEADER + LANE_PADDING * 2 + contentHeight };
    leafRects.set(leaf.id, rect);

    let rowY = rect.y + HEADER + LANE_PADDING;
    rows.forEach((row, rowIndex) => {
      const rowWidth = row.reduce((total, item) => total + item.width, 0)
        + Math.max(0, row.length - 1) * packing.nodeGap;
      const rowX = rect.x + (rect.width - rowWidth) / 2;
      let nodeX = rowX;
      row.forEach((item) => {
        nodeRects.push({
          id: item.node.id,
          kind: 'node',
          layerId: leaf.id,
          x: nodeX,
          y: rowY,
          width: item.width,
          height: nodeHeight(diagram, item.node, item.width, adaptive),
        });
        nodeX += item.width + packing.nodeGap;
      });
      rowY += rowHeights[rowIndex]! + packing.nodeGap;
    });
    cursor += rect.height + (gaps[index] ?? packing.layerGap);
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
  const adaptive = Boolean(viewport);
  const gaps = nestedLayerGaps(diagram, leaves, packing.layerGap, 'LR');
  const maximumColumnHeight = Math.max(
    adaptiveNodeMinHeight(diagram, adaptive),
    ...leaves.flatMap((leaf) => chunk(nodesByLeaf.get(leaf.id) ?? [], packing.capacity)
      .map((column) => lrColumnMetrics(diagram, column, packing, adaptive).height)),
  );
  const contentLaneHeight = LANE_PADDING * 2 + maximumColumnHeight;
  const laneHeight = viewport
    ? Math.max(320, Math.min(Math.max(320, viewport.height - OUTER * 2), contentLaneHeight))
    : Math.max(420, contentLaneHeight);
  let cursor = OUTER;

  leaves.forEach((leaf, index) => {
    const nodes = nodesByLeaf.get(leaf.id) ?? [];
    const columns = chunk(nodes, packing.capacity)
      .map((column) => lrColumnMetrics(diagram, column, packing, adaptive));
    const contentWidth = columns.length
      ? columns.reduce((total, column) => total + column.width, 0)
        + Math.max(0, columns.length - 1) * packing.nodeGap
      : adaptive ? COMPACT_NODE_MIN_WIDTH : packing.nodeWidth;
    const width = HEADER + LANE_PADDING * 2 + contentWidth;
    const rect = { x: cursor, y: OUTER, width, height: laneHeight };
    leafRects.set(leaf.id, rect);
    let columnX = rect.x + HEADER + LANE_PADDING;
    columns.forEach((column) => {
      let nodeY = rect.y + (rect.height - column.height) / 2;
      column.nodes.forEach((node, nodeIndex) => {
        const nodeWidth = column.nodeWidths[nodeIndex]!;
        const height = column.nodeHeights[nodeIndex]!;
        nodeRects.push({
          id: node.id,
          kind: 'node',
          layerId: leaf.id,
          x: columnX + (column.width - nodeWidth) / 2,
          y: nodeY,
          width: nodeWidth,
          height,
        });
        nodeY += height + packing.nodeGap;
      });
      columnX += column.width + packing.nodeGap;
    });
    cursor += rect.width + (gaps[index] ?? packing.layerGap);
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
  let bestHeight = Number.POSITIVE_INFINITY;
  for (const nodeWidth of nodeWidthValues(diagram.layout.nodeWidth)) {
    for (const nodeGap of densityValues(diagram.layout.nodeGap, COMPACT_NODE_GAP)) {
      for (const layerGap of densityValues(diagram.layout.layerGap, COMPACT_LAYER_GAP)) {
        const packing = { nodeWidth, nodeGap, layerGap, capacity: maxCount };
        const dimensions = measureTb(diagram, leaves, nodesByLeaf, packing, viewport);
        const score = projectedScale(dimensions, viewport);
        if (
          score > bestScore + 0.001 ||
          (Math.abs(score - bestScore) <= 0.001 && dimensions.height < bestHeight - 0.5)
        ) {
          best = packing;
          bestScore = score;
          bestHeight = dimensions.height;
        }
      }
    }
  }
  return best!;
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
  let bestWidth = Number.POSITIVE_INFINITY;
  let bestSingleAxis: Packing | undefined;
  let bestSingleAxisScale = -1;
  let bestSingleAxisWidth = Number.POSITIVE_INFINITY;
  for (const nodeWidth of nodeWidthValues(diagram.layout.nodeWidth)) {
    for (const nodeGap of densityValues(diagram.layout.nodeGap, COMPACT_NODE_GAP)) {
      for (const layerGap of densityValues(diagram.layout.layerGap, COMPACT_LAYER_GAP)) {
        for (const capacity of capacityValues(maxCount)) {
          const packing = { nodeWidth, nodeGap, layerGap, capacity };
          const dimensions = measureLr(diagram, leaves, nodesByLeaf, packing, viewport);
          const scale = projectedScale(dimensions, viewport);
          if (capacity === maxCount && (
            scale > bestSingleAxisScale + 0.001 ||
            (Math.abs(scale - bestSingleAxisScale) <= 0.001 && dimensions.width < bestSingleAxisWidth - 0.5)
          )) {
            bestSingleAxis = packing;
            bestSingleAxisScale = scale;
            bestSingleAxisWidth = dimensions.width;
          }
          const columnPreference = capacity / maxCount;
          const score = scale * (1 - ROW_PREFERENCE_WEIGHT + ROW_PREFERENCE_WEIGHT * columnPreference);
          if (
            score > bestScore + 0.001 ||
            (Math.abs(score - bestScore) <= 0.001 && dimensions.width < bestWidth - 0.5)
          ) {
            best = packing;
            bestScore = score;
            bestWidth = dimensions.width;
          }
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
  const adaptive = true;
  const gaps = nestedLayerGaps(diagram, leaves, packing.layerGap, 'TB');
  const laneWidth = Math.max(
    420,
    Math.min(
      Math.max(420, viewport.width - OUTER * 2),
      preferredTbLaneWidth(diagram, leaves, nodesByLeaf, packing),
    ),
  );
  const laneHeights = leaves.map((leaf) => {
    const rows = packTbRows(diagram, nodesByLeaf.get(leaf.id) ?? [], packing, laneWidth, adaptive);
    const rowHeights = rows.length
      ? rows.map((row) => Math.max(
          adaptiveNodeMinHeight(diagram, adaptive),
          ...row.map((item) => nodeHeight(diagram, item.node, item.width, adaptive)),
        ))
      : [adaptiveNodeMinHeight(diagram, adaptive)];
    return HEADER + LANE_PADDING * 2 + rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * packing.nodeGap;
  });
  return {
    width: laneWidth + OUTER * 2,
    height: laneHeights.reduce((total, height) => total + height, OUTER * 2) + gaps.reduce((total, gap) => total + gap, 0),
  };
}

function measureLr(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  packing: Packing,
  viewport: LayoutViewport,
): { width: number; height: number } {
  const adaptive = true;
  const maximumColumnHeight = Math.max(
    adaptiveNodeMinHeight(diagram, adaptive),
    ...leaves.flatMap((leaf) => chunk(nodesByLeaf.get(leaf.id) ?? [], packing.capacity)
      .map((column) => lrColumnMetrics(diagram, column, packing, adaptive).height)),
  );
  const gaps = nestedLayerGaps(diagram, leaves, packing.layerGap, 'LR');
  const laneHeight = Math.max(
    320,
    Math.min(
      Math.max(320, viewport.height - OUTER * 2),
      LANE_PADDING * 2 + maximumColumnHeight,
    ),
  );
  const widths = leaves.map((leaf) => {
    const columns = chunk(nodesByLeaf.get(leaf.id) ?? [], packing.capacity)
      .map((column) => lrColumnMetrics(diagram, column, packing, adaptive));
    const contentWidth = columns.length
      ? columns.reduce((total, column) => total + column.width, 0)
        + Math.max(0, columns.length - 1) * packing.nodeGap
      : COMPACT_NODE_MIN_WIDTH;
    return HEADER + LANE_PADDING * 2 + contentWidth;
  });
  return {
    width: widths.reduce((total, width) => total + width, OUTER * 2) + gaps.reduce((total, gap) => total + gap, 0),
    height: laneHeight + OUTER * 2,
  };
}

function nodeHeight(
  diagram: Diagram,
  node: DiagramNode,
  nodeWidth: number,
  adaptive = false,
): number {
  const contentWidth = Math.max(32, nodeWidth - 16);
  const configuredTitleLines = wrappedLineCount(
    node.name,
    diagram.layout.fontSize,
    contentWidth,
  );
  const compactTitle = configuredTitleLines > 1;
  const titleFontSize = compactTitle
    ? Math.max(11, diagram.layout.fontSize - 1)
    : diagram.layout.fontSize;
  const titleLine = Math.ceil(titleFontSize * (compactTitle ? 1.15 : 1.35));
  const detailLine = Math.ceil(diagram.layout.descriptionFontSize * 1.4);
  const titleLines = wrappedLineCount(node.name, titleFontSize, contentWidth);
  const detailLines = node.decompositionItems.reduce(
    (total, item) => total + wrappedLineCount(item, diagram.layout.descriptionFontSize, Math.max(24, contentWidth - 16)),
    0,
  );
  const details = detailLines ? 4 + detailLines * detailLine : 0;
  return Math.max(
    adaptiveNodeMinHeight(diagram, adaptive),
    roundToGrid(8 + titleLines * titleLine + details),
  );
}

function adaptiveNodeMinHeight(diagram: Diagram, adaptive: boolean): number {
  return adaptive
    ? Math.min(diagram.layout.nodeMinHeight, COMPACT_NODE_MIN_HEIGHT)
    : diagram.layout.nodeMinHeight;
}

function contentDrivenNodeWidth(
  diagram: Diagram,
  node: DiagramNode,
  maximumWidth: number,
  adaptive: boolean,
): number {
  if (!adaptive) return maximumWidth;
  const titleWidth = estimatedTextWidth(node.name, diagram.layout.fontSize);
  const detailWidth = Math.max(
    0,
    ...node.decompositionItems.map((item) => estimatedTextWidth(item, diagram.layout.descriptionFontSize) + 12),
  );
  const naturalWidth = roundToGrid(Math.max(titleWidth, detailWidth) + 16);
  return Math.max(
    COMPACT_NODE_MIN_WIDTH,
    Math.min(Math.max(COMPACT_NODE_MIN_WIDTH, maximumWidth), naturalWidth),
  );
}

function packTbRows(
  diagram: Diagram,
  nodes: DiagramNode[],
  packing: Packing,
  laneWidth: number,
  adaptive: boolean,
): PackedBusinessNode[][] {
  const availableWidth = Math.max(COMPACT_NODE_MIN_WIDTH, laneWidth - LANE_PADDING * 2);
  const maximumItemsPerRow = Math.max(
    1,
    Math.min(
      packing.capacity,
      Math.floor((availableWidth + packing.nodeGap) / (COMPACT_NODE_MIN_WIDTH + packing.nodeGap)),
    ),
  );
  return chunk(nodes, maximumItemsPerRow).map((row) => {
    const naturalWidths = row.map((node) => contentDrivenNodeWidth(diagram, node, packing.nodeWidth, adaptive));
    const availableForNodes = availableWidth - Math.max(0, row.length - 1) * packing.nodeGap;
    const naturalTotal = naturalWidths.reduce((total, width) => total + width, 0);
    if (naturalTotal <= availableForNodes || row.length === 1) {
      return row.map((node, index) => ({ node, width: naturalWidths[index]! }));
    }

    const minimumTotal = COMPACT_NODE_MIN_WIDTH * row.length;
    const flexibleTotal = Math.max(1, naturalTotal - minimumTotal);
    const flexibleBudget = Math.max(0, availableForNodes - minimumTotal);
    return row.map((node, index) => ({
      node,
      width: COMPACT_NODE_MIN_WIDTH + floorToGrid(
        (naturalWidths[index]! - COMPACT_NODE_MIN_WIDTH) * flexibleBudget / flexibleTotal,
      ),
    }));
  });
}

function preferredTbLaneWidth(
  diagram: Diagram,
  leaves: Layer[],
  nodesByLeaf: Map<string, DiagramNode[]>,
  packing: Packing,
): number {
  const widestContent = Math.max(
    COMPACT_NODE_MIN_WIDTH,
    ...leaves.map((leaf) => {
      const nodes = nodesByLeaf.get(leaf.id) ?? [];
      return nodes.reduce(
        (total, node) => total + contentDrivenNodeWidth(diagram, node, packing.nodeWidth, true),
        0,
      ) + Math.max(0, nodes.length - 1) * packing.nodeGap;
    }),
  );
  return LANE_PADDING * 2 + widestContent;
}

function lrColumnMetrics(
  diagram: Diagram,
  nodes: DiagramNode[],
  packing: Packing,
  adaptive: boolean,
): LrColumnMetrics {
  const nodeWidths = nodes.map((node) => contentDrivenNodeWidth(diagram, node, packing.nodeWidth, adaptive));
  const nodeHeights = nodes.map((node, index) => nodeHeight(diagram, node, nodeWidths[index]!, adaptive));
  return {
    nodes,
    nodeWidths,
    nodeHeights,
    width: nodes.length ? Math.max(...nodeWidths) : adaptive ? COMPACT_NODE_MIN_WIDTH : packing.nodeWidth,
    height: nodes.length
      ? nodeHeights.reduce((total, height) => total + height, 0) + Math.max(0, nodes.length - 1) * packing.nodeGap
      : adaptiveNodeMinHeight(diagram, adaptive),
  };
}

function wrappedLineCount(text: string, fontSize: number, width: number): number {
  return Math.max(1, Math.ceil(estimatedTextWidth(text, fontSize) / Math.max(1, width)));
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return [...text].reduce(
    (total, character) => total + fontSize * (/^[\u0000-\u00ff]$/.test(character) ? 0.58 : 1),
    0,
  );
}

function roundToGrid(value: number): number {
  return Math.ceil(value / 4) * 4;
}

function floorToGrid(value: number): number {
  return Math.floor(value / 4) * 4;
}

function nodeWidthValues(configured: number): number[] {
  const comfortable = Math.max(
    configured,
    Math.min(COMFORTABLE_NODE_MAX_WIDTH, Math.round(configured * 1.35)),
  );
  return [...new Set([
    comfortable,
    configured,
    Math.min(configured, Math.max(COMPACT_NODE_WIDTH, Math.round(configured * 0.88))),
    Math.min(configured, COMPACT_NODE_WIDTH),
  ])];
}

function capacityValues(maximum: number): number[] {
  if (maximum <= 48) {
    return Array.from({ length: maximum }, (_, index) => maximum - index);
  }
  return [maximum, ...Array.from({ length: 48 }, (_, index) => 48 - index)];
}

function densityValues(configured: number, compact: number): number[] {
  return [...new Set([configured, Math.min(configured, Math.max(compact, Math.round(configured * 0.88))), Math.min(configured, compact)])];
}

function projectedScale(bounds: { width: number; height: number }, viewport: LayoutViewport): number {
  const padding = ADAPTIVE_LAYOUT_PADDING * 2;
  return Math.min(1, Math.max(1, viewport.width - padding) / Math.max(1, bounds.width), Math.max(1, viewport.height - padding) / Math.max(1, bounds.height));
}

function validViewport(viewport?: LayoutViewport): LayoutViewport | undefined {
  return viewport && viewport.width > 0 && viewport.height > 0 ? viewport : undefined;
}

/**
 * Builds containers from the inside out. A parent must wrap its immediate
 * child containers, not independently wrap the leaf lanes below them;
 * otherwise a chain such as A > B > C gives A and B the same rectangle.
 */
function buildLayerRects(diagram: Diagram, leafRects: Map<string, Rect>): Map<string, Rect> {
  const result = new Map<string, Rect>();
  const build = (layer: Layer): Rect => {
    const cached = result.get(layer.id);
    if (cached) return cached;

    const children = layerChildren(diagram, layer.id);
    const own = leafRects.get(layer.id);
    if (!children.length) {
      if (!own) throw new Error(`Missing leaf rectangle for layer ${layer.id}`);
      result.set(layer.id, own);
      return own;
    }

    const childRects = children.map(build);
    const childBounds = union(childRects);
    const rect = {
      x: childBounds.x - LAYER_HORIZONTAL_PADDING,
      y: childBounds.y - HEADER,
      width: childBounds.width + LAYER_HORIZONTAL_PADDING * 2,
      height: childBounds.height + HEADER + LAYER_BOTTOM_PADDING,
    };
    result.set(layer.id, rect);
    return rect;
  };

  sortStable(diagram.layers).forEach(build);
  return result;
}

/**
 * The adaptive packer is allowed to reduce the configured gap, but it must
 * still leave room for the borders of two unrelated nested containers. The
 * returned value is the gap after each leaf lane (the final leaf has none).
 */
function nestedLayerGaps(
  diagram: Diagram,
  leaves: Layer[],
  configuredGap: number,
  direction: 'TB' | 'LR',
): number[] {
  if (leaves.length < 2) return [];

  const indexByLeafId = new Map(leaves.map((leaf, index) => [leaf.id, index]));
  const layerById = new Map(diagram.layers.map((layer) => [layer.id, layer]));
  const expansions = diagram.layers.flatMap((layer) => {
    if (!layerChildren(diagram, layer.id).length) return [];
    const descendantLeaves = descendantLeafIds(diagram, layer.id)
      .map((id) => ({
        id,
        index: indexByLeafId.get(id),
      }))
      .filter((leaf): leaf is { id: string; index: number } => leaf.index !== undefined);
    if (!descendantLeaves.length) return [];
    const first = Math.min(...descendantLeaves.map((leaf) => leaf.index));
    const last = Math.max(...descendantLeaves.map((leaf) => leaf.index));
    return [{
      first,
      last,
      before: Math.max(
        ...descendantLeaves
          .filter((leaf) => leaf.index === first)
          .map((leaf) => wrapperDepthToLeaf(layer.id, leaf.id, layerById)),
      ),
      after: Math.max(
        ...descendantLeaves
          .filter((leaf) => leaf.index === last)
          .map((leaf) => wrapperDepthToLeaf(layer.id, leaf.id, layerById)),
      ),
    }];
  });

  return leaves.slice(0, -1).map((_leaf, boundary) => {
    const leftExpansion = Math.max(
      0,
      ...expansions
        .filter((item) => item.last === boundary)
        .map((item) => item.after),
    );
    const rightExpansion = Math.max(
      0,
      ...expansions
        .filter((item) => item.first === boundary + 1)
        .map((item) => item.before),
    );
    const nestedPadding = direction === 'TB'
      ? leftExpansion * LAYER_BOTTOM_PADDING + rightExpansion * HEADER
      : (leftExpansion + rightExpansion) * LAYER_HORIZONTAL_PADDING;
    return Math.max(configuredGap, nestedPadding + MIN_NESTED_LAYER_GAP);
  });
}

function wrapperDepthToLeaf(
  layerId: string,
  leafId: string,
  layerById: Map<string, Layer>,
): number {
  let depth = 1;
  let currentId = layerById.get(leafId)?.parentId ?? null;
  while (currentId && currentId !== layerId) {
    depth += 1;
    currentId = layerById.get(currentId)?.parentId ?? null;
  }
  return currentId === layerId ? depth : 0;
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
