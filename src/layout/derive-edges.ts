import { sortStable } from '../domain/rules';
import type { Diagram, Pathway } from '../domain/types';

export interface RenderEdge {
  id: string; pathwayId: string; sourceNodeId: string; targetNodeId: string; sequence: number;
  color: string; lineStyle: 'solid' | 'dashed'; parallelOffset: number;
}

export function derivePathwayEdges(pathway: Pathway): Omit<RenderEdge, 'parallelOffset'>[] {
  const steps = sortStable(pathway.steps);
  return steps.slice(0, -1).map((step, index) => ({
    id: `${pathway.id}::${step.nodeId}::${steps[index + 1]?.nodeId}::${index}`,
    pathwayId: pathway.id, sourceNodeId: step.nodeId, targetNodeId: steps[index + 1]!.nodeId,
    sequence: index + 1, color: pathway.color, lineStyle: pathway.lineStyle,
  }));
}

export function deriveEdges(diagram: Diagram): RenderEdge[] {
  const base = sortStable(diagram.pathways).filter((x) => x.visible).flatMap(derivePathwayEdges);
  const groups = new Map<string, typeof base>();
  base.forEach((edge) => { const key = `${edge.sourceNodeId}::${edge.targetNodeId}`; groups.set(key, [...(groups.get(key) ?? []), edge]); });
  return base.map((edge) => {
    const group = groups.get(`${edge.sourceNodeId}::${edge.targetNodeId}`) ?? [edge]; const index = group.findIndex((x) => x.id === edge.id);
    return { ...edge, parallelOffset: (index - (group.length - 1) / 2) * 8 };
  });
}
