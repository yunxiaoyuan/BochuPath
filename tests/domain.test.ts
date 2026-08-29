import { describe, expect, it } from 'vitest';
import { parseDiagram } from '../src/domain/schema';
import { createBlankDiagram, createDemoDiagram } from '../src/domain/seed';
import { validateDiagram } from '../src/domain/rules';

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
});
