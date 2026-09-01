export type DiagramId = string;
export type LayerId = string;
export type NodeId = string;
export type NodeStyleId = string;
export type PathwayId = string;

export interface Diagram {
  schemaVersion: "1.1";
  id: DiagramId;
  name: string;
  description?: string;
  revision: number;
  layers: Layer[];
  nodes: DiagramNode[];
  nodeStyles: NodeStyle[];
  pathways: Pathway[];
  layout: LayoutConfig;
  createdAt: string;
  updatedAt: string;
}

export interface Layer {
  id: LayerId;
  parentId: LayerId | null;
  name: string;
  description?: string;
  order: number;
}

export interface DiagramNode {
  id: NodeId;
  layerId: LayerId;
  styleId: NodeStyleId;
  name: string;
  description?: string;
  decompositionItems: string[];
  order: number;
}

export interface NodeStyle {
  id: NodeStyleId;
  name: string;
  shape: "rect" | "roundedRect" | "document";
  fillColor: string;
  borderColor: string;
  borderStyle: "solid" | "dashed" | "dotted";
  borderWidth: 1 | 2 | 3;
  borderRadius: number;
  textColor: string;
  icon?: string;
  isDefault: boolean;
  isSystem: boolean;
}

export interface Pathway {
  id: PathwayId;
  name: string;
  description?: string;
  color: string;
  lineStyle: "solid" | "dashed";
  visible: boolean;
  order: number;
  nodeIds: NodeId[];
}

export interface LayoutConfig {
  direction: "TB" | "LR";
  layerGap: number;
  nodeGap: number;
  nodeWidth: number;
  nodeMinHeight: number;
  fontSize: number;
  descriptionFontSize: number;
}

export type Selection =
  | { kind: "diagram"; id: DiagramId }
  | { kind: "layer"; id: LayerId }
  | { kind: "node"; id: NodeId }
  | { kind: "nodeStyle"; id: NodeStyleId }
  | { kind: "pathway"; id: PathwayId }
  | { kind: "pathwayDraft"; id: "new" }
  | null;

export type EditorMode = "view" | "edit";
export type EditorTool =
  "select" | "marquee" | "pan" | "createNode" | "connectPathway";
export type SaveState = "clean" | "dirty" | "saving" | "saveError";

export interface DiagramSummary {
  id: DiagramId;
  name: string;
  description?: string;
  revision: number;
  updatedAt: string;
  nodeCount: number;
  pathwayCount: number;
}

export interface PathwayDraft {
  name: string;
  nodeIds: NodeId[];
  color: string;
  lineStyle: "solid" | "dashed";
  description: string;
  visible: boolean;
}
