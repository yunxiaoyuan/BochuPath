import { pathwayLayerGroups, sortPathwayNodeIds } from './layer-order';
import { isValidNodeName } from './node-name';
import { isValidStyleOptionValue } from './style-dimensions';
import type { Diagram, Layer } from './types';

export type DomainErrorCode =
  | 'SCHEMA_VERSION_UNSUPPORTED' | 'REFERENCE_NOT_FOUND' | 'LAYER_CYCLE' | 'LAYER_SIBLING_NAME_DUPLICATE'
  | 'LAYER_NODE_REQUIRES_LEAF' | 'LAYER_MIGRATION_TARGET_INVALID' | 'NODE_LAYER_NOT_LEAF' | 'NODE_STYLE_NOT_FOUND'
  | 'NODE_DELETE_BREAKS_PATHWAY' | 'STYLE_DEFAULT_DELETE_FORBIDDEN' | 'STYLE_IN_USE_REPLACEMENT_REQUIRED'
  | 'STYLE_DIMENSION_PROPERTY_DUPLICATE' | 'STYLE_OPTION_NOT_FOUND'
  | 'PATHWAY_MIN_LAYERS' | 'PATHWAY_DUPLICATE_NODE'
  | 'PERSISTENCE_CONFLICT' | 'PERSISTENCE_FAILED' | 'FIELD_INVALID' | 'IMPORT_INVALID';

export interface DomainIssue { code: DomainErrorCode; path?: string; message: string }

export class DomainError extends Error {
  constructor(public issue: DomainIssue) { super(issue.code); this.name = 'DomainError'; }
}

export const errorMessages: Record<DomainErrorCode, string> = {
  SCHEMA_VERSION_UNSUPPORTED: '数据版本不受支持', REFERENCE_NOT_FOUND: '对象引用不存在', LAYER_CYCLE: '层级不能移动到自己或后代中',
  LAYER_SIBLING_NAME_DUPLICATE: '同一上级下不能有重名层级', LAYER_NODE_REQUIRES_LEAF: '新增子层级前必须迁移原有节点',
  LAYER_MIGRATION_TARGET_INVALID: '请选择子树外的合法叶子层级作为迁移目标', NODE_LAYER_NOT_LEAF: '节点只能属于叶子层级',
  NODE_STYLE_NOT_FOUND: '节点样式不存在', NODE_DELETE_BREAKS_PATHWAY: '删除后会使通路只剩一个占用层，请先处理受影响通路',
  STYLE_DEFAULT_DELETE_FORBIDDEN: '默认或系统样式不能删除', STYLE_IN_USE_REPLACEMENT_REQUIRED: '该样式正在使用，请选择替代样式',
  STYLE_DIMENSION_PROPERTY_DUPLICATE: '同一视觉属性只能由一个样式维度控制', STYLE_OPTION_NOT_FOUND: '样式维度选项不存在',
  PATHWAY_MIN_LAYERS: '通路至少需要占用两个不同层级', PATHWAY_DUPLICATE_NODE: '同一通路不能重复包含节点',
  PERSISTENCE_CONFLICT: '共享版本已更新，本地草稿已保留；请刷新查看最新版本并人工合并', PERSISTENCE_FAILED: '保存失败，内存中的修改仍保留', FIELD_INVALID: '字段内容不符合要求', IMPORT_INVALID: '导入文件无效，请选择 BochuPath JSON 通路图',
};

function issue(code: DomainErrorCode, path?: string): DomainIssue { return { code, path, message: errorMessages[code] }; }

export function isLeafLayer(diagram: Diagram, layerId: string): boolean {
  return diagram.layers.some((layer) => layer.id === layerId) && !diagram.layers.some((layer) => layer.parentId === layerId);
}

export function descendantIds(diagram: Diagram, layerId: string): Set<string> {
  const result = new Set<string>();
  const visit = (id: string) => diagram.layers.filter((layer) => layer.parentId === id).forEach((child) => { result.add(child.id); visit(child.id); });
  visit(layerId);
  return result;
}

export function validateDiagram(diagram: Diagram): DomainIssue[] {
  const issues: DomainIssue[] = [];
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) issues.push(issue('REFERENCE_NOT_FOUND', path)); };
  unique(diagram.layers.map((x) => x.id), 'layers'); unique(diagram.nodes.map((x) => x.id), 'nodes');
  unique(diagram.nodeStyles.map((x) => x.id), 'nodeStyles'); unique(diagram.pathways.map((x) => x.id), 'pathways');
  unique(diagram.styleDimensions.map((x) => x.id), 'styleDimensions');
  const layerIds = new Set(diagram.layers.map((x) => x.id)); const styleIds = new Set(diagram.nodeStyles.map((x) => x.id)); const nodeIds = new Set(diagram.nodes.map((x) => x.id));
  diagram.layers.forEach((layer) => { if (layer.parentId && !layerIds.has(layer.parentId)) issues.push(issue('REFERENCE_NOT_FOUND', `layers.${layer.id}.parentId`)); });
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => { if (visiting.has(id)) { issues.push(issue('LAYER_CYCLE', `layers.${id}`)); return; } if (visited.has(id)) return; visiting.add(id); const parent = diagram.layers.find((x) => x.id === id)?.parentId; if (parent) visit(parent); visiting.delete(id); visited.add(id); };
  diagram.layers.forEach((layer) => visit(layer.id));
  const siblingNames = new Set<string>();
  diagram.layers.forEach((layer) => { const key = `${layer.parentId ?? 'root'}::${layer.name.trim().toLocaleLowerCase()}`; if (siblingNames.has(key)) issues.push(issue('LAYER_SIBLING_NAME_DUPLICATE', `layers.${layer.id}.name`)); siblingNames.add(key); });
  diagram.nodes.forEach((node) => {
    if (!layerIds.has(node.layerId)) issues.push(issue('REFERENCE_NOT_FOUND', `nodes.${node.id}.layerId`));
    else if (!isLeafLayer(diagram, node.layerId)) issues.push(issue('NODE_LAYER_NOT_LEAF', `nodes.${node.id}.layerId`));
    if (!styleIds.has(node.styleId)) issues.push(issue('NODE_STYLE_NOT_FOUND', `nodes.${node.id}.styleId`));
    if (!isValidNodeName(node.name)) issues.push(issue('FIELD_INVALID', `nodes.${node.id}.name`));
    Object.entries(node.styleAssignments).forEach(([dimensionId, optionId]) => {
      const dimension = diagram.styleDimensions.find((item) => item.id === dimensionId);
      if (!dimension) issues.push(issue('REFERENCE_NOT_FOUND', `nodes.${node.id}.styleAssignments.${dimensionId}`));
      else if (!dimension.options.some((option) => option.id === optionId))
        issues.push(issue('STYLE_OPTION_NOT_FOUND', `nodes.${node.id}.styleAssignments.${dimensionId}`));
    });
  });
  if (diagram.nodeStyles.filter((x) => x.isDefault).length !== 1 || !diagram.nodeStyles.some((x) => x.isDefault && x.isSystem)) issues.push(issue('STYLE_DEFAULT_DELETE_FORBIDDEN', 'nodeStyles'));
  const dimensionNames = new Set<string>();
  const dimensionProperties = new Set<string>();
  diagram.styleDimensions.forEach((dimension) => {
    const normalizedName = dimension.name.trim().toLocaleLowerCase();
    if (!dimension.name.trim() || dimensionNames.has(normalizedName)) issues.push(issue('FIELD_INVALID', `styleDimensions.${dimension.id}.name`));
    dimensionNames.add(normalizedName);
    if (dimensionProperties.has(dimension.property)) issues.push(issue('STYLE_DIMENSION_PROPERTY_DUPLICATE', `styleDimensions.${dimension.id}.property`));
    dimensionProperties.add(dimension.property);
    if (!dimension.options.length) issues.push(issue('FIELD_INVALID', `styleDimensions.${dimension.id}.options`));
    unique(dimension.options.map((option) => option.id), `styleDimensions.${dimension.id}.options`);
    const optionNames = new Set<string>();
    dimension.options.forEach((option) => {
      const normalizedOptionName = option.name.trim().toLocaleLowerCase();
      if (!option.name.trim() || optionNames.has(normalizedOptionName) || !isValidStyleOptionValue(dimension.property, option.value))
        issues.push(issue('FIELD_INVALID', `styleDimensions.${dimension.id}.options.${option.id}`));
      optionNames.add(normalizedOptionName);
    });
  });
  diagram.pathways.forEach((pathway) => {
    if (new Set(pathway.nodeIds).size !== pathway.nodeIds.length) issues.push(issue('PATHWAY_DUPLICATE_NODE', `pathways.${pathway.id}.nodeIds`));
    pathway.nodeIds.forEach((nodeId, index) => { if (!nodeIds.has(nodeId)) issues.push(issue('REFERENCE_NOT_FOUND', `pathways.${pathway.id}.nodeIds.${index}`)); });
    const existingIds = pathway.nodeIds.filter((nodeId) => nodeIds.has(nodeId));
    if (pathwayLayerGroups(diagram, existingIds).length < 2)
      issues.push(issue('PATHWAY_MIN_LAYERS', `pathways.${pathway.id}.nodeIds`));
  });
  return issues;
}

export function assertValid(diagram: Diagram): Diagram {
  const first = validateDiagram(diagram)[0]; if (first) throw new DomainError(first); return diagram;
}

export function sortStable<T extends { order: number; id: string }>(items: T[]): T[] { return [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }

export function normalizeOrders<T extends { order: number }>(items: T[]): void { items.sort((a, b) => a.order - b.order).forEach((item, index) => { item.order = (index + 1) * 10; }); }

export function normalizeDiagram(diagram: Diagram): Diagram {
  const parents = new Set(diagram.layers.map((x) => x.parentId));
  parents.forEach((parentId) => normalizeOrders(diagram.layers.filter((x) => x.parentId === parentId)));
  const layerIds = new Set(diagram.nodes.map((x) => x.layerId)); layerIds.forEach((id) => normalizeOrders(diagram.nodes.filter((x) => x.layerId === id)));
  normalizeOrders(diagram.pathways);
  normalizeOrders(diagram.styleDimensions);
  diagram.styleDimensions.forEach((dimension) => normalizeOrders(dimension.options));
  diagram.pathways.forEach((pathway) => {
    pathway.nodeIds = sortPathwayNodeIds(diagram, pathway.nodeIds);
  });
  return diagram;
}

export function layerDepth(diagram: Diagram, layer: Layer): number {
  let depth = 1; let parent = layer.parentId; const seen = new Set<string>();
  while (parent && !seen.has(parent)) { seen.add(parent); depth += 1; parent = diagram.layers.find((x) => x.id === parent)?.parentId ?? null; }
  return depth;
}
