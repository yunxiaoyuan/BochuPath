import { describe, expect, it } from 'vitest';
import { parseDiagram } from '../src/domain/schema';
import { createBlankDiagram, createDemoDiagram } from '../src/domain/seed';
import { assertValid, validateDiagram } from '../src/domain/rules';
import { orderedLeafLayers, pathwayEdgeCount, pathwayLayerGroups, sortPathwayNodeIds } from '../src/domain/layer-order';
import { nodePathwayContext } from '../src/domain/selectors';

describe('Diagram schema and invariants', () => {
  it('parses V1.1, migrates the V1.0 step chain, and rejects unknown versions', () => {
    const current = createDemoDiagram();
    expect(parseDiagram(current).schemaVersion).toBe('1.1');
    const legacy = {
      ...current,
      schemaVersion: '1.0',
      pathways: current.pathways.map(({ nodeIds, ...pathway }) => ({
        ...pathway,
        steps: nodeIds.map((nodeId, index) => ({ id: `step_${index}`, nodeId, order: (index + 1) * 10 })),
      })),
    };
    const migrated = parseDiagram(legacy);
    expect(migrated.schemaVersion).toBe('1.1');
    expect(migrated.pathways[0]?.nodeIds).toEqual(current.pathways[0]?.nodeIds);
    expect(migrated.pathways[0]).not.toHaveProperty('steps');
    const invalidLegacy = structuredClone(legacy);
    invalidLegacy.pathways[0]!.steps = invalidLegacy.pathways[0]!.steps.slice(0, 1);
    expect(() => assertValid(parseDiagram(invalidLegacy))).toThrow('PATHWAY_MIN_LAYERS');
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
  it('allows skipped canvas layers and same-layer members but requires two occupied layers', () => {
    const skipped = createDemoDiagram();
    skipped.pathways[0]!.nodeIds.splice(1, 1);
    expect(validateDiagram(skipped)).toHaveLength(0);
    expect(pathwayLayerGroups(skipped, skipped.pathways[0]!.nodeIds).map((group) => group.layer.id)).toEqual([
      'layer_demand', 'layer_delivery',
    ]);

    const sameLayer = createDemoDiagram();
    sameLayer.nodes[1]!.layerId = 'layer_demand';
    sameLayer.nodes[1]!.order = 20;
    expect(validateDiagram(sameLayer)).toHaveLength(0);
    expect(pathwayEdgeCount(sameLayer, sameLayer.pathways[0]!.nodeIds)).toBe(2);

    sameLayer.pathways[0]!.nodeIds = ['node_solution', 'node_demand'];
    expect(validateDiagram(sameLayer).map((issue) => issue.code)).toContain('PATHWAY_MIN_LAYERS');
  });
  it('sorts selected pathway nodes by fixed layer and same-layer node order', () => {
    const diagram = createDemoDiagram();
    diagram.nodes.push({
      id: 'node_demand_alt', layerId: 'layer_demand', styleId: 'style_confirmed',
      name: '需求补充', decompositionItems: [], order: 20,
    });
    expect(sortPathwayNodeIds(diagram, [
      'node_delivery', 'node_demand_alt', 'node_solution', 'node_demand',
    ])).toEqual([
      'node_demand', 'node_demand_alt', 'node_solution', 'node_delivery',
    ]);
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
