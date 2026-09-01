import { orderedLeafLayers } from './layer-order';
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
export function nodePathways(diagram: Diagram, nodeId: string): Pathway[] { return sortStable(diagram.pathways.filter((pathway) => pathway.nodeIds.includes(nodeId))); }
export function styleReferenceCount(diagram: Diagram, styleId: string): number { return diagram.nodes.filter((x) => x.styleId === styleId).length; }
export function selectedEntity(diagram: Diagram, kind: string, id: string): Diagram | Layer | DiagramNode | NodeStyle | Pathway | undefined {
  if (kind === 'diagram') return diagram; if (kind === 'layer') return diagram.layers.find((x) => x.id === id); if (kind === 'node') return diagram.nodes.find((x) => x.id === id);
  if (kind === 'nodeStyle') return diagram.nodeStyles.find((x) => x.id === id); if (kind === 'pathway') return diagram.pathways.find((x) => x.id === id); return undefined;
}
export function pathwaysContainingAll(diagram: Diagram, nodeIds: string[]): Pathway[] { return diagram.pathways.filter((pathway) => nodeIds.every((id) => pathway.nodeIds.includes(id))); }

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
    pathway.nodeIds.forEach((nodeId) => relatedNodeIds.add(nodeId)),
  );
  return {
    visiblePathways,
    hiddenPathways: pathways.filter((pathway) => !pathway.visible),
    relatedNodeIds,
  };
}
