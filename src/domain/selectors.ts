import { leafLayerIndexMap, orderedLeafLayers } from './layer-order';
import { sortStable } from './rules';
import type { Diagram, DiagramNode, Layer, NodeStyle, Pathway } from './types';

export function layerChildren(diagram: Diagram, parentId: string | null): Layer[] { return sortStable(diagram.layers.filter((x) => x.parentId === parentId)); }
export function leafLayers(diagram: Diagram): Layer[] { return orderedLeafLayers(diagram); }
export function fullLayerPath(diagram: Diagram, layerId: string): string {
  const names: string[] = []; let current = diagram.layers.find((x) => x.id === layerId); const seen = new Set<string>();
  while (current && !seen.has(current.id)) { seen.add(current.id); names.unshift(current.name); current = current.parentId ? diagram.layers.find((x) => x.id === current?.parentId) : undefined; }
  return names.join(' / ');
}
export function nodeLabel(diagram: Diagram, node: DiagramNode): string { return `${node.name} · ${fullLayerPath(diagram, node.layerId)}`; }
export function nodePathways(diagram: Diagram, nodeId: string): Pathway[] { return sortStable(diagram.pathways.filter((x) => x.steps.some((step) => step.nodeId === nodeId))); }
export function styleReferenceCount(diagram: Diagram, styleId: string): number { return diagram.nodes.filter((x) => x.styleId === styleId).length; }
export function selectedEntity(diagram: Diagram, kind: string, id: string): Diagram | Layer | DiagramNode | NodeStyle | Pathway | undefined {
  if (kind === 'diagram') return diagram; if (kind === 'layer') return diagram.layers.find((x) => x.id === id); if (kind === 'node') return diagram.nodes.find((x) => x.id === id);
  if (kind === 'nodeStyle') return diagram.nodeStyles.find((x) => x.id === id); if (kind === 'pathway') return diagram.pathways.find((x) => x.id === id); return undefined;
}
export function pathwaysContainingAll(diagram: Diagram, nodeIds: string[]): Pathway[] { return diagram.pathways.filter((pathway) => nodeIds.every((id) => pathway.steps.some((step) => step.nodeId === id))); }

export function pathwayCandidateNodes(
  diagram: Diagram,
  nodeIds: string[],
  insertAt: number,
): DiagramNode[] {
  const indexes = leafLayerIndexMap(diagram);
  const used = new Set(nodeIds);
  const boundedIndex = Math.max(0, Math.min(Math.trunc(insertAt), nodeIds.length));
  const previousNode = boundedIndex > 0
    ? diagram.nodes.find((node) => node.id === nodeIds[boundedIndex - 1])
    : undefined;
  const nextNode = boundedIndex < nodeIds.length
    ? diagram.nodes.find((node) => node.id === nodeIds[boundedIndex])
    : undefined;
  const lower = previousNode ? indexes.get(previousNode.layerId) : undefined;
  const upper = nextNode ? indexes.get(nextNode.layerId) : undefined;

  return [...diagram.nodes]
    .filter((node) => {
      if (used.has(node.id)) return false;
      const index = indexes.get(node.layerId);
      if (index === undefined) return false;
      return (lower === undefined || index > lower) &&
        (upper === undefined || index < upper);
    })
    .sort((left, right) => {
      const layerDifference = (indexes.get(left.layerId) ?? 0) -
        (indexes.get(right.layerId) ?? 0);
      return layerDifference || left.order - right.order || left.id.localeCompare(right.id);
    });
}

export interface NodePathwayContext {
  visiblePathways: Pathway[];
  hiddenPathways: Pathway[];
  relatedNodeIds: Set<string>;
}

export function nodePathwayContext(
  diagram: Diagram,
  nodeId: string,
): NodePathwayContext {
  const pathways = nodePathways(diagram, nodeId);
  const visiblePathways = pathways.filter((pathway) => pathway.visible);
  const relatedNodeIds = new Set<string>([nodeId]);
  visiblePathways.forEach((pathway) =>
    pathway.steps.forEach((step) => relatedNodeIds.add(step.nodeId)),
  );
  return {
    visiblePathways,
    hiddenPathways: pathways.filter((pathway) => !pathway.visible),
    relatedNodeIds,
  };
}
