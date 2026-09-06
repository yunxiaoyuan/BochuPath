import { describe, expect, it } from 'vitest';
import { createDemoDiagram } from '../src/domain/seed';
import { deriveEdges } from '../src/layout/derive-edges';
import { ADAPTIVE_LAYOUT_PADDING, layoutDiagram } from '../src/layout/swimlane-layout';
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
  it('fits the unnamed-pathway-111 shape into a 1920x1080 workspace', () => {
    const diagram = createDemoDiagram();
    const layers = [
      { id: 'market', parentId: null, name: '市场关注点', count: 7 },
      { id: 'solution', parentId: null, name: '解决方案', count: 0 },
      { id: 'test-1', parentId: 'solution', name: '测试1', count: 0 },
      { id: 'survey', parentId: 'test-1', name: '测绘师111', count: 6 },
      { id: 'test-2', parentId: 'solution', name: '测试2', count: 8 },
      { id: 'product', parentId: null, name: '产品', count: 7 },
      { id: 'technology', parentId: null, name: '技术', count: 0 },
      { id: 'technology-1', parentId: 'technology', name: '技术1', count: 7 },
      { id: 'technology-2', parentId: 'technology', name: '技术2', count: 3 },
      { id: 'technology-3', parentId: 'technology', name: '技术3', count: 4 },
    ];
    const representativeNames = [
      '啊', '了解', '阿哥', '乐扣乐扣', '多多个啊', '奥尔良看过价额尬了开关机',
      '老师看到几个', '阿斯利康大概', '爱的，是个啊', '跨部门业务需求确认节点',
    ];
    diagram.layers = layers.map((layer, index) => ({
      id: layer.id,
      parentId: layer.parentId,
      name: layer.name,
      order: (index + 1) * 10,
    }));
    diagram.nodes = layers.flatMap((layer, layerIndex) => Array.from({ length: layer.count }, (_, nodeIndex) => ({
      id: `node-${layer.id}-${nodeIndex + 1}`,
      layerId: layer.id,
      styleId: 'style_confirmed',
      name: representativeNames[(layerIndex + nodeIndex) % representativeNames.length]!,
      decompositionItems: [],
      order: (nodeIndex + 1) * 10,
    })));
    diagram.pathways = [];

    // 1920x1080 wide-screen workspace minus the 220px object panel, 280px inspector and page toolbars.
    const viewport = { width: 1420, height: 964 };
    const layout = layoutDiagram(diagram, viewport);
    const transform = fitViewportToBounds(layout.bounds, viewport, {
      padding: ADAPTIVE_LAYOUT_PADDING,
      maxZoom: 1.25,
    });

    expect(layout.nodes).toHaveLength(42);
    expect(transform.zoom).toBe(1.25);
    expect(transform.zoom * diagram.layout.fontSize).toBe(17.5);
    expect(layout.bounds.height / layout.bounds.width).toBeLessThan(viewport.height / viewport.width * 1.1);
    expect(Math.min(...layout.nodes.map((node) => node.width))).toBeLessThan(diagram.layout.nodeWidth);
    expect(Math.max(...layout.nodes.map((node) => node.width))).toBeLessThanOrEqual(240);
    expect(layout.nodes.every((node) => node.height <= diagram.layout.nodeMinHeight)).toBe(true);
    expect(layout.nodes.find((node) => node.id === 'node-market-1')!.width).toBeLessThan(
      layout.nodes.find((node) => node.id === 'node-market-6')!.width,
    );

    layout.layers.filter((layer) => !layers.some((candidate) => candidate.parentId === layer.id)).forEach((layer) => {
      const layerNodes = layout.nodes.filter((node) => node.layerId === layer.id);
      const rows = new Map<number, typeof layerNodes>();
      layerNodes.forEach((node) => rows.set(node.y, [...(rows.get(node.y) ?? []), node]));
      rows.forEach((row) => {
        const left = Math.min(...row.map((node) => node.x)) - layer.x;
        const right = layer.x + layer.width - Math.max(...row.map((node) => node.x + node.width));
        expect(Math.abs(left - right)).toBeLessThan(0.01);
      });
    });
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
    expect(adaptive.nodes.every((node) => node.height > 32)).toBe(true);
    expect(Math.max(...adaptive.nodes.map((node) => node.height))).toBe(40);
  });
  it('keeps a long LR node from inflating every other node', () => {
    const diagram = createDemoDiagram();
    diagram.layout = { ...diagram.layout, direction: 'LR' };
    diagram.layers = [{ id: 'lr-layer', parentId: null, name: '横向层级', order: 10 }];
    diagram.nodes = Array.from({ length: 6 }, (_, index) => ({
      id: `lr-node-${index}`,
      layerId: 'lr-layer',
      styleId: 'style_confirmed',
      name: index === 0 ? '包含较长拆解说明的节点' : `短节点 ${index}`,
      decompositionItems: index === 0
        ? ['这是一段用于验证按内容独立计算节点高度的较长拆解说明，不能把同列的其他节点一起撑高。']
        : [],
      order: (index + 1) * 10,
    }));
    diagram.pathways = [];

    const layout = layoutDiagram(diagram, { width: 1352, height: 964 });
    const longNode = layout.nodes.find((node) => node.id === 'lr-node-0')!;
    const shortNodes = layout.nodes.filter((node) => node.id !== 'lr-node-0');
    expect(longNode.height).toBeGreaterThan(diagram.layout.nodeMinHeight);
    expect(new Set(shortNodes.map((node) => node.height))).toHaveLength(1);
    expect(shortNodes.every((node) => node.height < diagram.layout.nodeMinHeight)).toBe(true);
  });

  it('keeps a realistic nested 64-node diagram readable in the wide LR workspace', () => {
    const diagram = createDemoDiagram();
    diagram.layers = [
      { id: 'group-a', parentId: null, name: '业务输入', order: 10 },
      { id: 'group-b', parentId: null, name: '业务处理', order: 20 },
      { id: 'group-c', parentId: null, name: '业务输出', order: 30 },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `leaf-${index + 1}`,
        parentId: index < 3 ? 'group-a' : index < 6 ? 'group-b' : 'group-c',
        name: `业务阶段 ${index + 1}`,
        order: (index + 1) * 10,
      })),
    ];
    diagram.nodes = Array.from({ length: 8 }, (_, layerIndex) =>
      Array.from({ length: 8 }, (_, nodeIndex) => ({
        id: `real-node-${layerIndex + 1}-${nodeIndex + 1}`,
        layerId: `leaf-${layerIndex + 1}`,
        styleId: 'style_confirmed',
        name: `跨部门业务协同节点 ${layerIndex + 1}.${nodeIndex + 1}`,
        decompositionItems: ['确认输入资料与责任人', '输出评审结论与后续动作'],
        order: (nodeIndex + 1) * 10,
      })),
    ).flat();
    diagram.pathways = [];
    diagram.layout = { ...diagram.layout, direction: 'LR' };

    const viewport = { width: 1920, height: 964 };
    const layout = layoutDiagram(diagram, viewport);
    const fit = fitViewportToBounds(layout.bounds, viewport, {
      padding: ADAPTIVE_LAYOUT_PADDING,
      maxZoom: 1,
    });

    expect(layout.nodes).toHaveLength(64);
    expect(fit.zoom * diagram.layout.fontSize).toBeGreaterThanOrEqual(12);
    expect(fit.zoom * diagram.layout.descriptionFontSize).toBeGreaterThanOrEqual(10);
    expect(layoutDiagram(diagram, viewport)).toEqual(layout);
    layout.nodes.forEach((node) => {
      const leaf = layout.layers.find((layer) => layer.id === node.layerId)!;
      expect(node.x).toBeGreaterThanOrEqual(leaf.x);
      expect(node.y).toBeGreaterThanOrEqual(leaf.y);
      expect(node.x + node.width).toBeLessThanOrEqual(leaf.x + leaf.width);
      expect(node.y + node.height).toBeLessThanOrEqual(leaf.y + leaf.height);
    });
  });

  it.each(['TB', 'LR'] as const)('keeps nested layer containers distinct in %s layout', (direction) => {
    const diagram = createDemoDiagram();
    diagram.layout = { ...diagram.layout, direction };
    diagram.layers = [
      { id: 'root-a', parentId: null, name: '根层 A', order: 10 },
      { id: 'middle-a', parentId: 'root-a', name: '中层 A', order: 10 },
      { id: 'leaf-a', parentId: 'middle-a', name: '叶层 A', order: 10 },
      { id: 'root-b', parentId: null, name: '根层 B', order: 20 },
      { id: 'middle-b', parentId: 'root-b', name: '中层 B', order: 10 },
      { id: 'leaf-b', parentId: 'middle-b', name: '叶层 B', order: 10 },
    ];
    diagram.nodes = [
      { id: 'node-a', layerId: 'leaf-a', styleId: 'style_confirmed', name: '节点 A', decompositionItems: [], order: 10 },
      { id: 'node-b', layerId: 'leaf-b', styleId: 'style_confirmed', name: '节点 B', decompositionItems: [], order: 10 },
    ];
    diagram.pathways = [];

    const layout = layoutDiagram(diagram, { width: 960, height: 640 });
    const rect = (id: string) => layout.layers.find((layer) => layer.id === id)!;
    const contains = (outer: typeof layout.bounds, inner: typeof layout.bounds) =>
      outer.x <= inner.x && outer.y <= inner.y &&
      outer.x + outer.width >= inner.x + inner.width &&
      outer.y + outer.height >= inner.y + inner.height;
    const overlaps = (left: typeof layout.bounds, right: typeof layout.bounds) =>
      left.x < right.x + right.width && right.x < left.x + left.width &&
      left.y < right.y + right.height && right.y < left.y + left.height;

    expect(contains(rect('root-a'), rect('middle-a'))).toBe(true);
    expect(contains(rect('middle-a'), rect('leaf-a'))).toBe(true);
    expect(contains(rect('root-b'), rect('middle-b'))).toBe(true);
    expect(contains(rect('middle-b'), rect('leaf-b'))).toBe(true);
    expect(overlaps(rect('root-a'), rect('root-b'))).toBe(false);
    expect(overlaps(rect('middle-a'), rect('middle-b'))).toBe(false);
    expect(rect('root-a')).not.toEqual(rect('middle-a'));
    expect(rect('middle-a')).not.toEqual(rect('leaf-a'));
  });
});
