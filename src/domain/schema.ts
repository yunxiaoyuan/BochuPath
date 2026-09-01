import { z } from 'zod';
import { sortPathwayNodeIds } from './layer-order';
import type { Diagram } from './types';

const color = z.string().regex(/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i, '颜色格式无效');
const isoDate = z.string().datetime();

export const layerSchema = z.object({
  id: z.string().min(1), parentId: z.string().min(1).nullable(), name: z.string().trim().min(1).max(40),
  description: z.string().optional(), order: z.number().int(),
});

export const diagramNodeSchema = z.object({
  id: z.string().min(1), layerId: z.string().min(1), styleId: z.string().min(1),
  name: z.string().trim().min(1).max(80), description: z.string().optional(),
  decompositionItems: z.array(z.string().trim().min(1).max(120)), order: z.number().int(),
});

export const nodeStyleSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(40),
  shape: z.enum(['rect', 'roundedRect', 'document']), fillColor: color, borderColor: color,
  borderStyle: z.enum(['solid', 'dashed', 'dotted']), borderWidth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  borderRadius: z.number().min(0).max(32), textColor: color, icon: z.string().optional(),
  isDefault: z.boolean(), isSystem: z.boolean(),
});

const pathwayBaseSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(80), description: z.string().optional(),
  color, lineStyle: z.enum(['solid', 'dashed']), visible: z.boolean(), order: z.number().int(),
});

export const pathwaySchema = pathwayBaseSchema.extend({
  nodeIds: z.array(z.string().min(1)),
});

const legacyPathwaySchema = pathwayBaseSchema.extend({
  steps: z.array(z.object({ id: z.string().min(1), nodeId: z.string().min(1), order: z.number().int() })),
});

export const layoutSchema = z.object({
  direction: z.enum(['TB', 'LR']), layerGap: z.number().min(8).max(160), nodeGap: z.number().min(8).max(160),
  nodeWidth: z.number().min(120).max(360), nodeMinHeight: z.number().min(48).max(200),
  fontSize: z.number().min(10).max(24), descriptionFontSize: z.number().min(9).max(20),
});

export const diagramSchema = z.object({
  schemaVersion: z.literal('1.1'), id: z.string().min(1), name: z.string().trim().min(1).max(80),
  description: z.string().optional(), revision: z.number().int().nonnegative(), layers: z.array(layerSchema),
  nodes: z.array(diagramNodeSchema), nodeStyles: z.array(nodeStyleSchema), pathways: z.array(pathwaySchema),
  layout: layoutSchema, createdAt: isoDate, updatedAt: isoDate,
});

const legacyDiagramSchema = z.object({
  schemaVersion: z.literal('1.0'), id: z.string().min(1), name: z.string().trim().min(1).max(80),
  description: z.string().optional(), revision: z.number().int().nonnegative(), layers: z.array(layerSchema),
  nodes: z.array(diagramNodeSchema), nodeStyles: z.array(nodeStyleSchema), pathways: z.array(legacyPathwaySchema),
  layout: layoutSchema, createdAt: isoDate, updatedAt: isoDate,
});

export function migrateDiagram(input: unknown): Diagram {
  const version = typeof input === 'object' && input !== null && 'schemaVersion' in input
    ? (input as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  let parsed: Diagram;
  if (version === '1.0') {
    const legacy = legacyDiagramSchema.parse(input);
    parsed = diagramSchema.parse({
      ...legacy,
      schemaVersion: '1.1',
      pathways: legacy.pathways.map(({ steps, ...pathway }) => ({
        ...pathway,
        nodeIds: [...steps]
          .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
          .map((step) => step.nodeId),
      })),
    });
  } else if (version === '1.1') {
    parsed = diagramSchema.parse(input);
  } else {
    throw new Error('SCHEMA_VERSION_UNSUPPORTED');
  }
  parsed.pathways.forEach((pathway) => {
    pathway.nodeIds = sortPathwayNodeIds(parsed, pathway.nodeIds);
  });
  return parsed;
}

export function parseDiagram(input: unknown): Diagram {
  return migrateDiagram(input);
}
