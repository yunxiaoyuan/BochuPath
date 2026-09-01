import { pathwayLayerGroups } from '../domain/layer-order';
import { sortStable } from '../domain/rules';
import type { Diagram, Pathway } from '../domain/types';

export interface RenderEdge {
  id: string; pathwayId: string; sourceNodeId: string; targetNodeId: string;
  color: string; lineStyle: 'solid' | 'dashed'; parallelOffset: number;
}

export function derivePathwayEdges(
  diagram: Diagram,
  pathway: Pathway,
): Omit<RenderEdge, 'parallelOffset'>[] {
  const groups = pathwayLayerGroups(diagram, pathway.nodeIds);
  return groups.slice(0, -1).flatMap((sourceGroup, groupIndex) =>
    sourceGroup.nodes.flatMap((source) =>
      groups[groupIndex + 1]!.nodes.map((target) => ({
        id: `${pathway.id}::${source.id}::${target.id}`,
        pathwayId: pathway.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        color: pathway.color,
        lineStyle: pathway.lineStyle,
      })),
    ),
  );
}

export function deriveEdges(diagram: Diagram): RenderEdge[] {
  const base = sortStable(diagram.pathways)
    .filter((pathway) => pathway.visible)
    .flatMap((pathway) => derivePathwayEdges(diagram, pathway));
  const groups = new Map<string, typeof base>();
  base.forEach((edge) => { const key = `${edge.sourceNodeId}::${edge.targetNodeId}`; groups.set(key, [...(groups.get(key) ?? []), edge]); });
  return base.map((edge) => {
    const group = groups.get(`${edge.sourceNodeId}::${edge.targetNodeId}`) ?? [edge]; const index = group.findIndex((x) => x.id === edge.id);
    return { ...edge, parallelOffset: (index - (group.length - 1) / 2) * 8 };
  });
}
