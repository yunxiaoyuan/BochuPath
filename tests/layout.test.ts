import { describe, expect, it } from 'vitest';
import { createDemoDiagram } from '../src/domain/seed';
import { deriveEdges } from '../src/layout/derive-edges';
import { layoutDiagram } from '../src/layout/swimlane-layout';

describe('derived canvas', () => {
  it('derives stable directed edge ids and parallel offsets', () => {
    const diagram = createDemoDiagram(); diagram.pathways.push({ ...structuredClone(diagram.pathways[0]!), id: 'path_secondary', name: '次通路', order: 20, color: '#cc0000' });
    const edges = deriveEdges(diagram); expect(edges).toHaveLength(4); expect(edges[0]!.id).toBe('path_main::node_demand::node_solution::0'); expect(new Set(edges.filter((x) => x.sourceNodeId === 'node_demand').map((x) => x.parallelOffset)).size).toBeGreaterThan(1);
  });
  it('is deterministic and supports TB/LR', () => {
    const diagram = createDemoDiagram(); expect(layoutDiagram(diagram)).toEqual(layoutDiagram(structuredClone(diagram)));
    const tb = layoutDiagram(diagram); const lr = layoutDiagram({ ...diagram, layout: { ...diagram.layout, direction: 'LR' } });
    expect(tb.nodes[1]!.y).toBeGreaterThan(tb.nodes[0]!.y); expect(lr.nodes[1]!.x).toBeGreaterThan(lr.nodes[0]!.x); expect(tb.bounds.width).toBeGreaterThan(0);
  });
  it('returns a safe empty layout', () => { const diagram = createDemoDiagram(); diagram.layers = []; diagram.nodes = []; diagram.pathways = []; expect(layoutDiagram(diagram).bounds).toEqual({ x: 0, y: 0, width: 720, height: 480 }); });
});
