import { describe, expect, it } from 'vitest';
import { createDemoDiagram } from '../src/domain/seed';
import { deriveEdges } from '../src/layout/derive-edges';
import { layoutDiagram } from '../src/layout/swimlane-layout';
import { fitViewportToBounds } from '../src/layout/fit-viewport';

describe('derived canvas', () => {
  it('derives stable directed edge ids and parallel offsets', () => {
    const diagram = createDemoDiagram(); diagram.pathways.push({ ...structuredClone(diagram.pathways[0]!), id: 'path_secondary', name: '次通路', order: 20, color: '#cc0000' });
    const edges = deriveEdges(diagram); expect(edges).toHaveLength(4); expect(edges[0]!.id).toBe('path_main::node_demand::node_solution'); expect(new Set(edges.filter((x) => x.sourceNodeId === 'node_demand').map((x) => x.parallelOffset)).size).toBeGreaterThan(1);
  });
  it('fully connects consecutive occupied layers and never connects same-layer nodes', () => {
    const diagram = createDemoDiagram();
    diagram.nodes.push(
      { id: 'node_demand_alt', layerId: 'layer_demand', styleId: 'style_confirmed', name: '补充需求', decompositionItems: [], order: 20 },
      { id: 'node_delivery_alt', layerId: 'layer_delivery', styleId: 'style_confirmed', name: '补充交付', decompositionItems: [], order: 20 },
    );
    diagram.pathways[0]!.nodeIds = ['node_demand', 'node_demand_alt', 'node_delivery', 'node_delivery_alt'];
    const edges = deriveEdges(diagram);
    expect(edges.map((edge) => [edge.sourceNodeId, edge.targetNodeId])).toEqual([
      ['node_demand', 'node_delivery'],
      ['node_demand', 'node_delivery_alt'],
      ['node_demand_alt', 'node_delivery'],
      ['node_demand_alt', 'node_delivery_alt'],
    ]);
    expect(edges.every((edge) => edge.sourceNodeId !== 'node_demand_alt' || edge.targetNodeId !== 'node_demand')).toBe(true);
    const lrEdges = deriveEdges({ ...diagram, layout: { ...diagram.layout, direction: 'LR' } });
    expect(lrEdges.map(({ sourceNodeId, targetNodeId }) => [sourceNodeId, targetNodeId])).toEqual(
      edges.map(({ sourceNodeId, targetNodeId }) => [sourceNodeId, targetNodeId]),
    );
  });
  it('is deterministic and supports TB/LR', () => {
    const diagram = createDemoDiagram(); expect(layoutDiagram(diagram)).toEqual(layoutDiagram(structuredClone(diagram)));
    const tb = layoutDiagram(diagram); const lr = layoutDiagram({ ...diagram, layout: { ...diagram.layout, direction: 'LR' } });
    expect(tb.nodes[1]!.y).toBeGreaterThan(tb.nodes[0]!.y); expect(lr.nodes[1]!.x).toBeGreaterThan(lr.nodes[0]!.x); expect(tb.bounds.width).toBeGreaterThan(0);
  });
  it('returns a safe empty layout', () => { const diagram = createDemoDiagram(); diagram.layers = []; diagram.nodes = []; diagram.pathways = []; expect(layoutDiagram(diagram).bounds).toEqual({ x: 0, y: 0, width: 720, height: 480 }); });
  it('packs dense nodes for a 16:9 stage while keeping the configured font readable', () => {
    const diagram = createDemoDiagram();
    diagram.layers = [{ id: 'dense', parentId: null, name: '密集层', order: 10 }];
    diagram.nodes = Array.from({ length: 24 }, (_, index) => ({
      id: `dense-${index}`,
      layerId: 'dense',
      styleId: 'style_confirmed',
      name: `节点 ${index + 1}`,
      decompositionItems: [],
      order: (index + 1) * 10,
    }));
    diagram.pathways = [];
    const viewport = { width: 1420, height: 900 };
    const baseline = layoutDiagram(diagram);
    const adaptive = layoutDiagram(diagram, viewport);
    const baselineZoom = fitViewportToBounds(baseline.bounds, viewport).zoom;
    const adaptiveZoom = fitViewportToBounds(adaptive.bounds, viewport).zoom;
    expect(new Set(adaptive.nodes.map((node) => node.y)).size).toBeGreaterThan(1);
    expect(adaptiveZoom).toBeGreaterThan(baselineZoom * 2);
    expect(adaptiveZoom * diagram.layout.fontSize).toBeGreaterThanOrEqual(12);
    expect(layoutDiagram(diagram, viewport)).toEqual(adaptive);
  });
  it('prefers one row by narrowing nodes and growing them for wrapped labels', () => {
    const diagram = createDemoDiagram();
    diagram.layers = [{ id: 'single-row', parentId: null, name: '单行层级', order: 10 }];
    diagram.nodes = Array.from({ length: 12 }, (_, index) => ({
      id: `single-row-${index}`,
      layerId: 'single-row',
      styleId: 'style_confirmed',
      name: `跨部门业务需求确认节点 ${index + 1}`,
      decompositionItems: [],
      order: (index + 1) * 10,
    }));
    diagram.pathways = [];
    const adaptive = layoutDiagram(diagram, { width: 1420, height: 900 });
    expect(new Set(adaptive.nodes.map((node) => node.y))).toHaveLength(1);
    expect(adaptive.nodes.every((node) => node.width < diagram.layout.nodeWidth)).toBe(true);
    expect(adaptive.nodes.every((node) => node.height > diagram.layout.nodeMinHeight)).toBe(true);
  });
});
