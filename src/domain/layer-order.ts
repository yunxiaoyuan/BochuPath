import type { Diagram, DiagramNode, Layer } from "./types";

export interface PathwayLayerGroup {
  layer: Layer;
  nodes: DiagramNode[];
}

function stableLayers(layers: Layer[]): Layer[] {
  return [...layers].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

/**
 * Returns leaf layers in the same depth-first visual order used by the canvas.
 * The semantic order is independent of whether the diagram is rendered TB or LR.
 */
export function orderedLeafLayers(diagram: Diagram): Layer[] {
  const result: Layer[] = [];
  const visited = new Set<string>();
  const walk = (layer: Layer) => {
    if (visited.has(layer.id)) return;
    visited.add(layer.id);
    const children = stableLayers(
      diagram.layers.filter((candidate) => candidate.parentId === layer.id),
    );
    if (!children.length) result.push(layer);
    else children.forEach(walk);
  };
  stableLayers(diagram.layers.filter((layer) => layer.parentId === null)).forEach(
    walk,
  );
  return result;
}

export function leafLayerIndexMap(diagram: Diagram): Map<string, number> {
  return new Map(orderedLeafLayers(diagram).map((layer, index) => [layer.id, index]));
}

/**
 * Returns business nodes in the fixed order shown on the canvas: leaf-layer
 * order first, then the node order inside that leaf layer.
 */
export function orderedDiagramNodes(diagram: Diagram): DiagramNode[] {
  const layerIndexes = leafLayerIndexMap(diagram);
  return [...diagram.nodes].sort((left, right) =>
    (layerIndexes.get(left.layerId) ?? Number.MAX_SAFE_INTEGER) -
      (layerIndexes.get(right.layerId) ?? Number.MAX_SAFE_INTEGER) ||
    left.order - right.order ||
    left.id.localeCompare(right.id),
  );
}

export function sortPathwayNodeIds(diagram: Diagram, nodeIds: string[]): string[] {
  const ranks = new Map(
    orderedDiagramNodes(diagram).map((node, index) => [node.id, index]),
  );
  return [...nodeIds].sort(
    (left, right) =>
      (ranks.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (ranks.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right),
  );
}

/**
 * Groups pathway members by their occupied leaf layers. Empty diagram layers
 * are intentionally skipped: edges connect consecutive occupied layers.
 */
export function pathwayLayerGroups(
  diagram: Diagram,
  nodeIds: string[],
): PathwayLayerGroup[] {
  const selected = new Set(nodeIds);
  const nodesByLayer = new Map<string, DiagramNode[]>();
  orderedDiagramNodes(diagram).forEach((node) => {
    if (!selected.has(node.id)) return;
    nodesByLayer.set(node.layerId, [
      ...(nodesByLayer.get(node.layerId) ?? []),
      node,
    ]);
  });
  return orderedLeafLayers(diagram)
    .map((layer) => ({ layer, nodes: nodesByLayer.get(layer.id) ?? [] }))
    .filter((group) => group.nodes.length > 0);
}

export function pathwayEdgeCount(diagram: Diagram, nodeIds: string[]): number {
  const groups = pathwayLayerGroups(diagram, nodeIds);
  return groups.slice(0, -1).reduce(
    (count, group, index) => count + group.nodes.length * groups[index + 1]!.nodes.length,
    0,
  );
}
