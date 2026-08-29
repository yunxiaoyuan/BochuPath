import { describe, expect, it } from 'vitest';
import { createBlankDiagram, createDemoDiagram } from '../src/domain/seed';
import { parseBatchNames } from '../src/editor/batch-input';
import { createLayer, createLayersBatch, createNode, createNodesBatch, createNodeStyle, createPathway, deleteNode, deleteNodeStyleWithReplacement, setDefaultStyle } from '../src/editor/commands';

describe('domain commands', () => {
  it('creates a child and migrates existing nodes atomically', () => {
    let diagram = createBlankDiagram('迁移'); diagram = createLayer(diagram, { name: '业务层', parentId: null }); const root = diagram.layers[0]!;
    diagram = createNode(diagram, { name: '原节点', layerId: root.id, styleId: diagram.nodeStyles[0]!.id });
    diagram = createLayer(diagram, { name: '叶子层', parentId: root.id });
    expect(diagram.nodes[0]!.layerId).toBe(diagram.layers.find((x) => x.parentId === root.id)!.id);
  });
  it('blocks node deletion that would break a pathway and reconnects a longer path', () => {
    const demo = createDemoDiagram(); expect(() => deleteNode(demo, 'node_solution')).not.toThrow();
    expect(deleteNode(demo, 'node_solution').pathways[0]!.steps.map((x) => x.nodeId)).toEqual(['node_demand', 'node_delivery']);
    expect(() => deleteNode(deleteNode(demo, 'node_solution'), 'node_demand')).toThrow('NODE_DELETE_BREAKS_PATHWAY');
  });
  it('requires unique pathway nodes and replaces style references transactionally', () => {
    let diagram = createDemoDiagram(); expect(() => createPathway(diagram, { name: '重复', nodeIds: ['node_demand', 'node_demand'], color: '#000000', lineStyle: 'solid' })).toThrow('PATHWAY_DUPLICATE_NODE');
    diagram = createNodeStyle(diagram, { name: '风险', shape: 'roundedRect', fillColor: '#ffeeee', borderColor: '#cc0000', borderStyle: 'solid', borderWidth: 1, borderRadius: 4, textColor: '#111111' }); const custom = diagram.nodeStyles.at(-1)!;
    diagram.nodes[0]!.styleId = custom.id; diagram = deleteNodeStyleWithReplacement(diagram, custom.id, 'style_confirmed');
    expect(diagram.nodeStyles.some((x) => x.id === custom.id)).toBe(false); expect(diagram.nodes[0]!.styleId).toBe('style_confirmed');
  });
  it('keeps exactly one system default style', () => {
    const diagram = setDefaultStyle(createDemoDiagram(), 'style_review'); expect(diagram.nodeStyles.filter((x) => x.isDefault)).toHaveLength(1); expect(diagram.nodeStyles.find((x) => x.isDefault)?.id).toBe('style_review');
  });
  it('parses Chinese/English semicolons and line breaks in order', () => {
    expect(parseBatchNames(' 需求层；方案层;\n交付层\n\n')).toEqual(['需求层', '方案层', '交付层']);
  });
  it('creates ordered layers and nodes as atomic batches', () => {
    let diagram = createBlankDiagram('批量创建');
    diagram = createLayersBatch(diagram, { names: ['需求层', '方案层', '交付层'], parentId: null });
    expect(diagram.layers.map((layer) => [layer.name, layer.order])).toEqual([
      ['需求层', 10],
      ['方案层', 20],
      ['交付层', 30],
    ]);
    const target = diagram.layers[0]!;
    diagram = createNodesBatch(diagram, {
      names: ['需求提出', '需求确认', '需求归档'],
      layerId: target.id,
      styleId: diagram.nodeStyles[0]!.id,
    });
    expect(diagram.nodes.map((node) => [node.name, node.order])).toEqual([
      ['需求提出', 10],
      ['需求确认', 20],
      ['需求归档', 30],
    ]);
  });
  it('rejects a duplicate layer batch without mutating the source diagram', () => {
    const diagram = createBlankDiagram('批量冲突');
    expect(() => createLayersBatch(diagram, { names: ['业务层', '业务层'], parentId: null })).toThrow('LAYER_SIBLING_NAME_DUPLICATE');
    expect(diagram.layers).toHaveLength(0);
  });
});
