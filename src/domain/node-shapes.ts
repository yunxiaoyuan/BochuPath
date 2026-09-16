import type { NodeStyle, Pathway } from "./types";

export interface ShapeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const nodeShapeOptions: Array<{ value: NodeStyle["shape"]; label: string }> = [
  { value: "rect", label: "直角矩形" },
  { value: "roundedRect", label: "圆角矩形" },
  { value: "document", label: "文档" },
  { value: "ellipse", label: "椭圆" },
  { value: "capsule", label: "腰圆" },
  { value: "cylinder", label: "圆柱" },
  { value: "note", label: "便签" },
];

export function nodeShapeLabel(shape: NodeStyle["shape"]): string {
  return nodeShapeOptions.find((option) => option.value === shape)?.label ?? shape;
}

export function shapeMinimumWidth(shape: NodeStyle["shape"]): number {
  if (shape === "ellipse" || shape === "cylinder") return 88;
  if (shape === "capsule") return 80;
  if (shape === "document" || shape === "note") return 72;
  return 64;
}

export function shapeMinimumHeight(shape: NodeStyle["shape"]): number {
  if (shape === "cylinder") return 48;
  if (shape === "ellipse") return 44;
  if (shape === "document" || shape === "note") return 40;
  if (shape === "capsule") return 36;
  return 32;
}

export function shapeContentInsets(shape: NodeStyle["shape"], width: number): ShapeInsets {
  if (shape === "document") return { top: 4, right: 8, bottom: 14, left: 8 };
  if (shape === "ellipse") {
    const horizontal = Math.max(14, Math.round(width * 0.16));
    return { top: 7, right: horizontal, bottom: 7, left: horizontal };
  }
  if (shape === "capsule") {
    const horizontal = Math.max(14, Math.min(22, Math.round(width * 0.12)));
    return { top: 4, right: horizontal, bottom: 4, left: horizontal };
  }
  if (shape === "cylinder") return { top: 14, right: 10, bottom: 10, left: 10 };
  if (shape === "note") {
    const right = Math.max(18, Math.min(28, Math.round(width * 0.15)));
    return { top: 6, right, bottom: 6, left: 10 };
  }
  return { top: 4, right: 8, bottom: 4, left: 8 };
}

export function shapeContentWidth(shape: NodeStyle["shape"], width: number): number {
  const insets = shapeContentInsets(shape, width);
  return Math.max(24, width - insets.left - insets.right);
}

export function borderDashArray(style: NodeStyle["borderStyle"]): string | undefined {
  if (style === "dashed") return "7 5";
  if (style === "dotted") return "1 4";
  if (style === "dashDot") return "8 4 1 4";
  return undefined;
}

export function pathwayDashArray(style: Pathway["lineStyle"]): string | undefined {
  if (style === "dashed") return "7 5";
  if (style === "dashDot") return "8 4 1 4";
  return undefined;
}

export function pathwayLineStyleLabel(style: Pathway["lineStyle"]): string {
  if (style === "dashed") return "虚线";
  if (style === "dashDot") return "点划线（— · — ·）";
  return "实线";
}
