import type { Diagram } from './types';

export const DEMO_DIAGRAM_ID = 'diagram_demo';

export function createDemoDiagram(): Diagram {
  return {
    schemaVersion: '1.0', id: DEMO_DIAGRAM_ID, name: '需求到交付示例', description: '用于验证分层、节点样式和跨层通路', revision: 1,
    layers: [
      { id: 'layer_demand', parentId: null, name: '需求层', order: 10 },
      { id: 'layer_solution', parentId: null, name: '方案层', order: 20 },
      { id: 'layer_delivery', parentId: null, name: '交付层', order: 30 },
    ],
    nodes: [
      { id: 'node_demand', layerId: 'layer_demand', styleId: 'style_confirmed', name: '需求确认', decompositionItems: ['范围', '目标'], order: 10 },
      { id: 'node_solution', layerId: 'layer_solution', styleId: 'style_review', name: '方案评审', decompositionItems: ['业务方案', '技术方案'], order: 10 },
      { id: 'node_delivery', layerId: 'layer_delivery', styleId: 'style_confirmed', name: '交付验收', decompositionItems: ['验收结论'], order: 10 },
    ],
    nodeStyles: [
      { id: 'style_confirmed', name: '已确认', shape: 'roundedRect', fillColor: '#EAF7EF', borderColor: '#2E8B57', borderStyle: 'solid', borderWidth: 1, borderRadius: 4, textColor: '#1F2329', isDefault: true, isSystem: true },
      { id: 'style_review', name: '待评审', shape: 'roundedRect', fillColor: '#FFF5E6', borderColor: '#C97A00', borderStyle: 'dashed', borderWidth: 1, borderRadius: 4, textColor: '#1F2329', isDefault: false, isSystem: false },
    ],
    pathways: [{ id: 'path_main', name: '主通路', color: '#2F64F7', lineStyle: 'solid', visible: true, order: 10, steps: [
      { id: 'step_1', nodeId: 'node_demand', order: 10 }, { id: 'step_2', nodeId: 'node_solution', order: 20 }, { id: 'step_3', nodeId: 'node_delivery', order: 30 },
    ] }],
    layout: { direction: 'TB', layerGap: 32, nodeGap: 24, nodeWidth: 180, nodeMinHeight: 64, fontSize: 14, descriptionFontSize: 12 },
    createdAt: '2026-08-28T12:00:00.000Z', updatedAt: '2026-08-28T12:00:00.000Z',
  };
}

export function createBlankDiagram(name: string, id = newId('diagram')): Diagram {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0', id, name: name.trim(), revision: 0, layers: [], nodes: [], pathways: [],
    nodeStyles: [{ id: newId('style'), name: '默认样式', shape: 'roundedRect', fillColor: '#EEF3FF', borderColor: '#2F64F7', borderStyle: 'solid', borderWidth: 1, borderRadius: 4, textColor: '#1F2329', isDefault: true, isSystem: true }],
    layout: { direction: 'TB', layerGap: 32, nodeGap: 24, nodeWidth: 180, nodeMinHeight: 64, fontSize: 14, descriptionFontSize: 12 }, createdAt: now, updatedAt: now,
  };
}

export function newId(prefix: string): string {
  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}
