import { describe, expect, it } from 'vitest';
import { parseDiagram } from '../src/domain/schema';
import { createBlankDiagram, createDemoDiagram } from '../src/domain/seed';
import { validateDiagram } from '../src/domain/rules';
import { orderedLeafLayers } from '../src/domain/layer-order';
import { nodePathwayContext, pathwayCandidateNodes } from '../src/domain/selectors';

describe('Diagram schema and invariants', () => {
  it('parses the V1 seed and rejects unknown versions', () => {
    expect(parseDiagram(createDemoDiagram()).schemaVersion).toBe('1.0');
    expect(() => parseDiagram({ ...createDemoDiagram(), schemaVersion: '2.0' })).toThrow('SCHEMA_VERSION_UNSUPPORTED');
  });
  it('reports missing references and non-leaf node ownership', () => {
    const diagram = createDemoDiagram(); diagram.nodes[0]!.styleId = 'missing';
    expect(validateDiagram(diagram).map((x) => x.code)).toContain('NODE_STYLE_NOT_FOUND');
    diagram.nodes[0]!.styleId = 'style_confirmed'; diagram.layers.push({ id: 'child', parentId: 'layer_demand', name: '子层', order: 10 });
    expect(validateDiagram(diagram).map((x) => x.code)).toContain('NODE_LAYER_NOT_LEAF');
  });
  it('detects cycles and sibling duplicate names', () => {
    const diagram = createBlankDiagram('规则'); diagram.layers = [
      { id: 'a', parentId: 'b', name: '阶段', order: 10 }, { id: 'b', parentId: 'a', name: '阶段二', order: 20 },
      { id: 'c', parentId: null, name: '重复', order: 10 }, { id: 'd', parentId: null, name: '重复', order: 20 },
    ];
    const codes = validateDiagram(diagram).map((x) => x.code); expect(codes).toContain('LAYER_CYCLE'); expect(codes).toContain('LAYER_SIBLING_NAME_DUPLICATE');
  });
  it('orders nested leaf layers once for layout and pathway direction', () => {
    const diagram = createDemoDiagram();
    diagram.layers.push({ id: 'root', parentId: null, name: '业务', order: 5 });
    diagram.layers.forEach((layer) => {
      if (layer.id !== 'root') layer.parentId = 'root';
    });
    expect(orderedLeafLayers(diagram).map((layer) => layer.id)).toEqual([
      'layer_demand', 'layer_solution', 'layer_delivery',
    ]);
    expect(validateDiagram(diagram)).toHaveLength(0);
  });
  it('allows skipped layers and rejects same-layer or upward pathway steps', () => {
    const skipped = createDemoDiagram();
    skipped.pathways[0]!.steps.splice(1, 1);
    expect(validateDiagram(skipped).map((issue) => issue.code)).not.toContain('PATHWAY_LAYER_ORDER_INVALID');

    const sameLayer = createDemoDiagram();
    sameLayer.nodes[1]!.layerId = 'layer_demand';
    expect(validateDiagram(sameLayer).map((issue) => issue.code)).toContain('PATHWAY_LAYER_ORDER_INVALID');

    const upward = createDemoDiagram();
    upward.pathways[0]!.steps[0]!.nodeId = 'node_delivery';
    upward.pathways[0]!.steps[2]!.nodeId = 'node_demand';
    expect(validateDiagram(upward).map((issue) => issue.code)).toContain('PATHWAY_LAYER_ORDER_INVALID');
  });
  it('filters insertion candidates by the neighboring layer interval', () => {
    const diagram = createDemoDiagram();
    expect(pathwayCandidateNodes(diagram, ['node_demand', 'node_delivery'], 1).map((node) => node.id)).toEqual(['node_solution']);
    expect(pathwayCandidateNodes(diagram, ['node_solution'], 0).map((node) => node.id)).toEqual(['node_demand']);
    expect(pathwayCandidateNodes(diagram, ['node_solution'], 1).map((node) => node.id)).toEqual(['node_delivery']);
  });
  it('builds a full visible pathway highlight while keeping hidden pathways separate', () => {
    const diagram = createDemoDiagram();
    diagram.pathways.push({
      ...structuredClone(diagram.pathways[0]!),
      id: 'hidden',
      name: '隐藏通路',
      visible: false,
      order: 20,
    });
    const context = nodePathwayContext(diagram, 'node_solution');
    expect(context.visiblePathways.map((pathway) => pathway.id)).toEqual(['path_main']);
    expect(context.hiddenPathways.map((pathway) => pathway.id)).toEqual(['hidden']);
    expect([...context.relatedNodeIds]).toEqual(['node_solution', 'node_demand', 'node_delivery']);
  });
});
