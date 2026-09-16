import { newId } from '../domain/seed';
import { pathwayLayerGroups } from '../domain/layer-order';
import { isValidNodeName, normalizeNodeName } from '../domain/node-name';
import { assertValid, descendantIds, DomainError, errorMessages, isLeafLayer, normalizeDiagram } from '../domain/rules';
import { isValidStyleOptionValue, normalizeStyleOptionValue } from '../domain/style-dimensions';
import type { Diagram, DiagramNode, Layer, LayoutConfig, NodeStyle, Pathway, StyleDimension, StyleDimensionProperty } from '../domain/types';

function fail(code: ConstructorParameters<typeof DomainError>[0]['code'], path?: string): never {
  throw new DomainError({ code, path, message: errorMessages[code] });
}

function commit(diagram: Diagram, mutate: (next: Diagram) => void): Diagram {
  const next = structuredClone(diagram); mutate(next); normalizeDiagram(next); next.updatedAt = new Date().toISOString(); return assertValid(next);
}

export function renameDiagram(diagram: Diagram, input: { name: string; description?: string }): Diagram {
  const name = input.name.trim(); if (!name || name.length > 80) fail('FIELD_INVALID', 'name');
  return commit(diagram, (next) => { next.name = name; next.description = input.description?.trim() || undefined; });
}

export interface LayerInput { name: string; parentId: string | null; description?: string; order?: number }
export function createLayer(diagram: Diagram, input: LayerInput): Diagram {
  const name = input.name.trim(); if (!name || name.length > 40) fail('FIELD_INVALID', 'name');
  if (input.parentId && !diagram.layers.some((x) => x.id === input.parentId)) fail('REFERENCE_NOT_FOUND', 'parentId');
  return commit(diagram, (next) => {
    const layer: Layer = { id: newId('layer'), parentId: input.parentId, name, order: input.order ?? next.layers.length * 10 + 10, description: input.description?.trim() || undefined };
    next.layers.push(layer);
    if (input.parentId) next.nodes.filter((node) => node.layerId === input.parentId).forEach((node) => { node.layerId = layer.id; });
  });
}

export interface BatchLayerInput { names: string[]; parentId: string | null }
export function createLayersBatch(diagram: Diagram, input: BatchLayerInput): Diagram {
  const names = input.names.map((name) => name.trim()).filter(Boolean);
  if (!names.length || names.some((name) => name.length > 40)) fail('FIELD_INVALID', 'names');
  if (input.parentId && !diagram.layers.some((x) => x.id === input.parentId)) fail('REFERENCE_NOT_FOUND', 'parentId');
  return commit(diagram, (next) => {
    let order = Math.max(0, ...next.layers.filter((x) => x.parentId === input.parentId).map((x) => x.order)) + 10;
    const createdIds = names.map((name) => {
      const id = newId('layer');
      next.layers.push({ id, parentId: input.parentId, name, order });
      order += 10;
      return id;
    });
    if (input.parentId) next.nodes.filter((node) => node.layerId === input.parentId).forEach((node) => { node.layerId = createdIds[0]!; });
  });
}

export function updateLayer(diagram: Diagram, id: string, input: LayerInput): Diagram {
  const name = input.name.trim(); if (!name || name.length > 40) fail('FIELD_INVALID', 'name');
  return commit(diagram, (next) => {
    const layer = next.layers.find((x) => x.id === id); if (!layer) fail('REFERENCE_NOT_FOUND', `layers.${id}`);
    if (input.parentId === id || descendantIds(next, id).has(input.parentId ?? '')) fail('LAYER_CYCLE', 'parentId');
    if (input.parentId && !next.layers.some((x) => x.id === input.parentId)) fail('REFERENCE_NOT_FOUND', 'parentId');
    layer.name = name; layer.parentId = input.parentId; layer.description = input.description?.trim() || undefined; if (input.order !== undefined) layer.order = input.order;
  });
}

export const moveLayer = updateLayer;

export function reorderLayer(diagram: Diagram, id: string, targetIndex: number): Diagram {
  const source = diagram.layers.find((layer) => layer.id === id);
  if (!source) fail('REFERENCE_NOT_FOUND', `layers.${id}`);
  return commit(diagram, (next) => {
    const siblings = sortByOrder(next.layers.filter((layer) => layer.parentId === source.parentId));
    reorderAt(siblings, id, targetIndex);
  });
}

export function deleteLayerWithMigration(diagram: Diagram, id: string, targetLayerId?: string): Diagram {
  const removedIds = descendantIds(diagram, id); removedIds.add(id); const affected = diagram.nodes.filter((x) => removedIds.has(x.layerId));
  if (affected.length && (!targetLayerId || removedIds.has(targetLayerId) || !isLeafLayer(diagram, targetLayerId))) fail('LAYER_MIGRATION_TARGET_INVALID', 'targetLayerId');
  return commit(diagram, (next) => {
    if (!next.layers.some((x) => x.id === id)) fail('REFERENCE_NOT_FOUND', `layers.${id}`);
    if (targetLayerId) next.nodes.filter((x) => removedIds.has(x.layerId)).forEach((node) => { node.layerId = targetLayerId; });
    next.layers = next.layers.filter((x) => !removedIds.has(x.id));
  });
}

export interface NodeInput { name: string; layerId: string; styleId: string; styleAssignments?: Record<string, string>; description?: string; decompositionItems?: string[]; order?: number }
export function createNode(diagram: Diagram, input: NodeInput): Diagram {
  validateNodeInput(diagram, input);
  return commit(diagram, (next) => { next.nodes.push({ id: newId('node'), name: normalizeNodeName(input.name), layerId: input.layerId, styleId: input.styleId, styleAssignments: cleanStyleAssignments(next, input.styleAssignments), description: input.description?.trim() || undefined, decompositionItems: cleanItems(input.decompositionItems), order: input.order ?? next.nodes.filter((x) => x.layerId === input.layerId).length * 10 + 10 }); });
}

export interface BatchNodeInput { names: string[]; layerId: string; styleId: string }
export function createNodesBatch(diagram: Diagram, input: BatchNodeInput): Diagram {
  const names = input.names.map((name) => name.trim()).filter(Boolean);
  if (!names.length) fail('FIELD_INVALID', 'names');
  names.forEach((name) => validateNodeInput(diagram, { name, layerId: input.layerId, styleId: input.styleId }));
  return commit(diagram, (next) => {
    let order = Math.max(0, ...next.nodes.filter((x) => x.layerId === input.layerId).map((x) => x.order)) + 10;
    names.forEach((name) => {
      next.nodes.push({ id: newId('node'), name: normalizeNodeName(name), layerId: input.layerId, styleId: input.styleId, styleAssignments: {}, decompositionItems: [], order });
      order += 10;
    });
  });
}

export function updateNode(diagram: Diagram, id: string, input: NodeInput): Diagram {
  validateNodeInput(diagram, input);
  return commit(diagram, (next) => { const node = next.nodes.find((x) => x.id === id); if (!node) fail('REFERENCE_NOT_FOUND', `nodes.${id}`); Object.assign(node, { name: normalizeNodeName(input.name), layerId: input.layerId, styleId: input.styleId, styleAssignments: input.styleAssignments === undefined ? node.styleAssignments : cleanStyleAssignments(next, input.styleAssignments), description: input.description?.trim() || undefined, decompositionItems: cleanItems(input.decompositionItems) }); if (input.order !== undefined) node.order = input.order; });
}

export function reorderNode(diagram: Diagram, id: string, targetIndex: number): Diagram {
  const source = diagram.nodes.find((node) => node.id === id);
  if (!source) fail('REFERENCE_NOT_FOUND', `nodes.${id}`);
  return commit(diagram, (next) => {
    const siblings = sortByOrder(next.nodes.filter((node) => node.layerId === source.layerId));
    reorderAt(siblings, id, targetIndex);
  });
}

function validateNodeInput(diagram: Diagram, input: NodeInput): void {
  if (!isValidNodeName(input.name)) fail('FIELD_INVALID', 'name');
  if (!isLeafLayer(diagram, input.layerId)) fail('NODE_LAYER_NOT_LEAF', 'layerId');
  if (!diagram.nodeStyles.some((x) => x.id === input.styleId)) fail('NODE_STYLE_NOT_FOUND', 'styleId');
  if (input.styleAssignments) cleanStyleAssignments(diagram, input.styleAssignments);
}
function cleanItems(items: string[] = []): string[] { return items.map((x) => x.trim()).filter(Boolean); }

function cleanStyleAssignments(diagram: Diagram, assignments: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(assignments).forEach(([dimensionId, optionId]) => {
    const dimension = diagram.styleDimensions.find((item) => item.id === dimensionId);
    if (!dimension) fail('REFERENCE_NOT_FOUND', `styleAssignments.${dimensionId}`);
    if (!dimension.options.some((item) => item.id === optionId)) fail('STYLE_OPTION_NOT_FOUND', `styleAssignments.${dimensionId}`);
    result[dimensionId] = optionId;
  });
  return result;
}

export function duplicateNode(diagram: Diagram, id: string): Diagram {
  const source = diagram.nodes.find((x) => x.id === id); if (!source) fail('REFERENCE_NOT_FOUND', `nodes.${id}`);
  return createNode(diagram, { ...source, name: `${source.name} 副本`, order: source.order + 1 });
}

export function deleteNode(diagram: Diagram, id: string): Diagram {
  if (!diagram.nodes.some((x) => x.id === id)) fail('REFERENCE_NOT_FOUND', `nodes.${id}`);
  if (diagram.pathways.some((pathway) => pathway.nodeIds.includes(id) && pathwayLayerGroups(diagram, pathway.nodeIds.filter((nodeId) => nodeId !== id)).length < 2)) fail('NODE_DELETE_BREAKS_PATHWAY', `nodes.${id}`);
  return commit(diagram, (next) => { next.nodes = next.nodes.filter((x) => x.id !== id); next.pathways.forEach((pathway) => { pathway.nodeIds = pathway.nodeIds.filter((nodeId) => nodeId !== id); }); });
}

export function replacePathwayNode(diagram: Diagram, pathwayId: string, oldNodeId: string, newNodeId: string): Diagram {
  if (!diagram.nodes.some((x) => x.id === newNodeId)) fail('REFERENCE_NOT_FOUND', 'newNodeId');
  return commit(diagram, (next) => { const pathway = next.pathways.find((x) => x.id === pathwayId); if (!pathway) fail('REFERENCE_NOT_FOUND', `pathways.${pathwayId}`); const index = pathway.nodeIds.indexOf(oldNodeId); if (index < 0) fail('REFERENCE_NOT_FOUND', 'oldNodeId'); pathway.nodeIds[index] = newNodeId; });
}

export interface StyleInput { name: string; shape: NodeStyle['shape']; fillColor: string; borderColor: string; borderStyle: NodeStyle['borderStyle']; borderWidth: NodeStyle['borderWidth']; borderRadius: number; textColor: string; icon?: string }
export function createNodeStyle(diagram: Diagram, input: StyleInput): Diagram {
  if (!input.name.trim() || input.name.trim().length > 40) fail('FIELD_INVALID', 'name');
  return commit(diagram, (next) => { next.nodeStyles.push({ ...input, id: newId('style'), name: input.name.trim(), isDefault: false, isSystem: false }); });
}
export function updateNodeStyle(diagram: Diagram, id: string, input: StyleInput): Diagram {
  if (!input.name.trim() || input.name.trim().length > 40) fail('FIELD_INVALID', 'name');
  return commit(diagram, (next) => { const style = next.nodeStyles.find((x) => x.id === id); if (!style) fail('REFERENCE_NOT_FOUND', `nodeStyles.${id}`); Object.assign(style, input, { name: input.name.trim() }); });
}
export function duplicateNodeStyle(diagram: Diagram, id: string): Diagram {
  const source = diagram.nodeStyles.find((x) => x.id === id); if (!source) fail('REFERENCE_NOT_FOUND', `nodeStyles.${id}`);
  return createNodeStyle(diagram, { ...source, name: `${source.name} 副本` });
}
export function deleteNodeStyleWithReplacement(diagram: Diagram, id: string, replacementId?: string): Diagram {
  const style = diagram.nodeStyles.find((x) => x.id === id); if (!style) fail('REFERENCE_NOT_FOUND', `nodeStyles.${id}`);
  if (style.isSystem || style.isDefault) fail('STYLE_DEFAULT_DELETE_FORBIDDEN', `nodeStyles.${id}`);
  const inUse = diagram.nodes.some((x) => x.styleId === id);
  if (inUse && (!replacementId || replacementId === id || !diagram.nodeStyles.some((x) => x.id === replacementId))) fail('STYLE_IN_USE_REPLACEMENT_REQUIRED', 'replacementId');
  return commit(diagram, (next) => { if (replacementId) next.nodes.filter((x) => x.styleId === id).forEach((node) => { node.styleId = replacementId; }); next.nodeStyles = next.nodeStyles.filter((x) => x.id !== id); });
}
export function setDefaultStyle(diagram: Diagram, id: string): Diagram {
  const style = diagram.nodeStyles.find((x) => x.id === id); if (!style) fail('REFERENCE_NOT_FOUND', `nodeStyles.${id}`);
  return commit(diagram, (next) => { next.nodeStyles.forEach((x) => { x.isDefault = x.id === id; }); const chosen = next.nodeStyles.find((x) => x.id === id); if (chosen) chosen.isSystem = true; });
}

export interface StyleOptionInput { id?: string; name: string; value: string; order?: number }
export interface StyleDimensionInput { name: string; property: StyleDimensionProperty; options: StyleOptionInput[]; order?: number }

function validateStyleDimensionInput(diagram: Diagram, input: StyleDimensionInput, editingId?: string): void {
  if (!input.name.trim() || input.name.trim().length > 40) fail('FIELD_INVALID', 'name');
  if (diagram.styleDimensions.some((item) => item.id !== editingId && item.property === input.property)) fail('STYLE_DIMENSION_PROPERTY_DUPLICATE', 'property');
  if (!input.options.length) fail('FIELD_INVALID', 'options');
  const names = new Set<string>();
  input.options.forEach((option, index) => {
    const name = option.name.trim();
    if (!name || name.length > 40 || names.has(name)) fail('FIELD_INVALID', `options.${index}.name`);
    names.add(name);
    if (!isValidStyleOptionValue(input.property, option.value)) fail('FIELD_INVALID', `options.${index}.value`);
  });
}

function buildStyleDimension(input: StyleDimensionInput, id = newId('dimension')): StyleDimension {
  return {
    id,
    name: input.name.trim(),
    property: input.property,
    order: input.order ?? 10,
    options: input.options.map((option, index) => ({
      id: option.id ?? newId('option'),
      name: option.name.trim(),
      value: normalizeStyleOptionValue(input.property, option.value),
      order: option.order ?? (index + 1) * 10,
    })),
  };
}

export function createStyleDimension(diagram: Diagram, input: StyleDimensionInput): Diagram {
  validateStyleDimensionInput(diagram, input);
  return commit(diagram, (next) => {
    next.styleDimensions.push(buildStyleDimension({ ...input, order: input.order ?? (next.styleDimensions.length + 1) * 10 }));
  });
}

export function createStyleDimensionsBatch(diagram: Diagram, inputs: StyleDimensionInput[]): Diagram {
  if (!inputs.length) fail('FIELD_INVALID', 'styleDimensions');
  const properties = new Set(diagram.styleDimensions.map((item) => item.property));
  inputs.forEach((input, index) => {
    validateStyleDimensionInput(diagram, input);
    if (properties.has(input.property)) fail('STYLE_DIMENSION_PROPERTY_DUPLICATE', `styleDimensions.${index}.property`);
    properties.add(input.property);
  });
  return commit(diagram, (next) => {
    let order = Math.max(0, ...next.styleDimensions.map((item) => item.order)) + 10;
    inputs.forEach((input) => {
      next.styleDimensions.push(buildStyleDimension({ ...input, order }));
      order += 10;
    });
  });
}

export function updateStyleDimension(diagram: Diagram, id: string, input: StyleDimensionInput): Diagram {
  const source = diagram.styleDimensions.find((item) => item.id === id);
  if (!source) fail('REFERENCE_NOT_FOUND', `styleDimensions.${id}`);
  validateStyleDimensionInput(diagram, input, id);
  return commit(diagram, (next) => {
    const dimension = next.styleDimensions.find((item) => item.id === id)!;
    const updated = buildStyleDimension({ ...input, order: input.order ?? dimension.order }, id);
    const validOptionIds = new Set(updated.options.map((item) => item.id));
    Object.assign(dimension, updated);
    next.nodes.forEach((node) => {
      const optionId = node.styleAssignments[id];
      if (optionId && !validOptionIds.has(optionId)) delete node.styleAssignments[id];
    });
  });
}

export function deleteStyleDimension(diagram: Diagram, id: string): Diagram {
  if (!diagram.styleDimensions.some((item) => item.id === id)) fail('REFERENCE_NOT_FOUND', `styleDimensions.${id}`);
  return commit(diagram, (next) => {
    next.styleDimensions = next.styleDimensions.filter((item) => item.id !== id);
    next.nodes.forEach((node) => { delete node.styleAssignments[id]; });
  });
}

export interface BatchNodeStyleInput {
  styleId?: string;
  assignments: Record<string, string | null | undefined>;
}

export function applyNodeStylesBatch(diagram: Diagram, nodeIds: string[], input: BatchNodeStyleInput): Diagram {
  const ids = [...new Set(nodeIds)];
  if (!ids.length || ids.some((id) => !diagram.nodes.some((node) => node.id === id))) fail('REFERENCE_NOT_FOUND', 'nodeIds');
  if (input.styleId && !diagram.nodeStyles.some((style) => style.id === input.styleId)) fail('NODE_STYLE_NOT_FOUND', 'styleId');
  Object.entries(input.assignments).forEach(([dimensionId, optionId]) => {
    if (optionId === undefined || optionId === null) return;
    cleanStyleAssignments(diagram, { [dimensionId]: optionId });
  });
  return commit(diagram, (next) => {
    next.nodes.filter((node) => ids.includes(node.id)).forEach((node) => {
      if (input.styleId) node.styleId = input.styleId;
      Object.entries(input.assignments).forEach(([dimensionId, optionId]) => {
        if (optionId === undefined) return;
        if (optionId === null) delete node.styleAssignments[dimensionId];
        else node.styleAssignments[dimensionId] = optionId;
      });
    });
  });
}

export interface PathwayMetadataInput { name: string; color: string; lineStyle: Pathway['lineStyle']; description?: string; visible?: boolean }
export interface PathwayInput extends PathwayMetadataInput { nodeIds: string[]; order?: number }
function validatePathwayMetadata(input: PathwayMetadataInput): void {
  if (!input.name.trim() || input.name.trim().length > 80) fail('FIELD_INVALID', 'name');
}
function validatePathwayNodes(diagram: Diagram, nodeIds: string[]): void {
  if (new Set(nodeIds).size !== nodeIds.length) fail('PATHWAY_DUPLICATE_NODE', 'nodeIds');
  if (nodeIds.some((id) => !diagram.nodes.some((x) => x.id === id))) fail('REFERENCE_NOT_FOUND', 'nodeIds');
  if (pathwayLayerGroups(diagram, nodeIds).length < 2) fail('PATHWAY_MIN_LAYERS', 'nodeIds');
}
function validatePathwayInput(diagram: Diagram, input: PathwayInput): void {
  validatePathwayMetadata(input);
  validatePathwayNodes(diagram, input.nodeIds);
}
export function createPathway(diagram: Diagram, input: PathwayInput): Diagram {
  validatePathwayInput(diagram, input);
  return commit(diagram, (next) => { next.pathways.push({ id: newId('path'), name: input.name.trim(), color: input.color, lineStyle: input.lineStyle, description: input.description?.trim() || undefined, visible: input.visible ?? true, order: input.order ?? next.pathways.length * 10 + 10, nodeIds: [...input.nodeIds] }); });
}
export function updatePathwayMetadata(diagram: Diagram, id: string, input: PathwayMetadataInput): Diagram {
  validatePathwayMetadata(input);
  return commit(diagram, (next) => { const pathway = next.pathways.find((x) => x.id === id); if (!pathway) fail('REFERENCE_NOT_FOUND', `pathways.${id}`); Object.assign(pathway, { name: input.name.trim(), color: input.color, lineStyle: input.lineStyle, description: input.description?.trim() || undefined, visible: input.visible ?? pathway.visible }); });
}
export function addPathwayNode(diagram: Diagram, id: string, nodeId: string): Diagram {
  if (!diagram.nodes.some((node) => node.id === nodeId)) fail('REFERENCE_NOT_FOUND', 'nodeId');
  const pathway = diagram.pathways.find((item) => item.id === id); if (!pathway) fail('REFERENCE_NOT_FOUND', `pathways.${id}`);
  if (pathway.nodeIds.includes(nodeId)) fail('PATHWAY_DUPLICATE_NODE', 'nodeId');
  return commit(diagram, (next) => { next.pathways.find((item) => item.id === id)!.nodeIds.push(nodeId); });
}
export function removePathwayNode(diagram: Diagram, id: string, nodeId: string): Diagram {
  const pathway = diagram.pathways.find((item) => item.id === id); if (!pathway) fail('REFERENCE_NOT_FOUND', `pathways.${id}`);
  if (!pathway.nodeIds.includes(nodeId)) fail('REFERENCE_NOT_FOUND', 'nodeId');
  const remaining = pathway.nodeIds.filter((item) => item !== nodeId);
  validatePathwayNodes(diagram, remaining);
  return commit(diagram, (next) => { next.pathways.find((item) => item.id === id)!.nodeIds = remaining; });
}
export function deletePathway(diagram: Diagram, id: string): Diagram { return commit(diagram, (next) => { if (!next.pathways.some((x) => x.id === id)) fail('REFERENCE_NOT_FOUND', `pathways.${id}`); next.pathways = next.pathways.filter((x) => x.id !== id); }); }
export function setPathwayVisibility(diagram: Diagram, id: string, visible: boolean): Diagram { return commit(diagram, (next) => { const pathway = next.pathways.find((x) => x.id === id); if (!pathway) fail('REFERENCE_NOT_FOUND', `pathways.${id}`); pathway.visible = visible; }); }
export function updateLayoutConfig(diagram: Diagram, input: Partial<LayoutConfig>): Diagram { return commit(diagram, (next) => { next.layout = { ...next.layout, ...input }; }); }

function sortByOrder<T extends { id: string; order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function reorderAt<T extends { id: string; order: number }>(items: T[], id: string, targetIndex: number): void {
  const sourceIndex = items.findIndex((item) => item.id === id);
  if (sourceIndex < 0) fail('REFERENCE_NOT_FOUND', id);
  const [source] = items.splice(sourceIndex, 1);
  items.splice(Math.max(0, Math.min(Math.trunc(targetIndex), items.length)), 0, source!);
  items.forEach((item, index) => { item.order = (index + 1) * 10; });
}

export type DiagramCommand = (diagram: Diagram) => Diagram;
export interface CommandRecord { label: string; before: Diagram; after: Diagram }

export function getDeleteNodeImpact(diagram: Diagram, nodeId: string): { pathway: Pathway; afterNodes: DiagramNode[]; blocked: boolean }[] {
  return diagram.pathways.filter((pathway) => pathway.nodeIds.includes(nodeId)).map((pathway) => {
    const remaining = pathway.nodeIds.filter((id) => id !== nodeId);
    return {
      pathway,
      afterNodes: remaining.map((id) => diagram.nodes.find((node) => node.id === id)).filter((node): node is DiagramNode => Boolean(node)),
      blocked: pathwayLayerGroups(diagram, remaining).length < 2,
    };
  });
}
