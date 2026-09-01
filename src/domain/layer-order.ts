import type { Diagram, DiagramNode, Layer } from "./types";

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
  const selected = new Set(nodeIds);
  return orderedDiagramNodes(diagram)
    .filter((node) => selected.has(node.id))
    .map((node) => node.id);
}
