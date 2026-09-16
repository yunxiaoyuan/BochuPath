import type {
  Diagram,
  DiagramNode,
  NodeStyle,
  StyleDimension,
  StyleDimensionProperty,
} from "./types";

export const styleDimensionProperties: Array<{
  value: StyleDimensionProperty;
  label: string;
}> = [
  { value: "shape", label: "形状" },
  { value: "fillColor", label: "底色" },
  { value: "borderColor", label: "边框颜色" },
  { value: "borderStyle", label: "边框线型" },
  { value: "borderWidth", label: "边框宽度" },
  { value: "textColor", label: "文字颜色" },
];

const shapeAliases: Record<string, NodeStyle["shape"]> = {
  方框: "rect",
  直角矩形: "rect",
  rect: "rect",
  圆角矩形: "roundedRect",
  roundedrect: "roundedRect",
  文档: "document",
  document: "document",
  椭圆: "ellipse",
  ellipse: "ellipse",
  腰圆: "capsule",
  胶囊: "capsule",
  capsule: "capsule",
  圆柱: "cylinder",
  cylinder: "cylinder",
  便签: "note",
  note: "note",
};

const borderStyleAliases: Record<string, NodeStyle["borderStyle"]> = {
  实线: "solid",
  solid: "solid",
  虚线: "dashed",
  dashed: "dashed",
  点线: "dotted",
  dotted: "dotted",
  点划线: "dashDot",
  dashdot: "dashDot",
};

const colorAliases: Record<string, string> = {
  粉色: "#FFE2E6",
  白色: "#FFFFFF",
  红色: "#E5484D",
  黑色: "#2B2F36",
  蓝色: "#2F64F7",
  黄色: "#F5C451",
  绿色: "#32A665",
};

export function styleDimensionPropertyLabel(property: StyleDimensionProperty): string {
  return styleDimensionProperties.find((item) => item.value === property)?.label ?? property;
}

export function normalizeStyleOptionValue(
  property: StyleDimensionProperty,
  input: string,
): string {
  const value = input.trim();
  const normalizedKey = value.toLocaleLowerCase();
  if (property === "shape") return shapeAliases[normalizedKey] ?? value;
  if (property === "borderStyle") return borderStyleAliases[normalizedKey] ?? value;
  if (property === "borderWidth") return value.replace(/px$/i, "");
  if (property === "fillColor" || property === "borderColor" || property === "textColor")
    return colorAliases[value] ?? value.toUpperCase();
  return value;
}

export function isValidStyleOptionValue(
  property: StyleDimensionProperty,
  input: string,
): boolean {
  const value = normalizeStyleOptionValue(property, input);
  if (property === "shape") return Object.values(shapeAliases).includes(value as NodeStyle["shape"]);
  if (property === "borderStyle")
    return Object.values(borderStyleAliases).includes(value as NodeStyle["borderStyle"]);
  if (property === "borderWidth") return ["1", "2", "3"].includes(value);
  return /^(#[0-9A-F]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i.test(value);
}

export function styleOptionValueLabel(
  property: StyleDimensionProperty,
  value: string,
): string {
  const normalized = normalizeStyleOptionValue(property, value);
  if (property === "shape")
    return ({
      rect: "方框",
      roundedRect: "圆角矩形",
      document: "文档",
      ellipse: "椭圆",
      capsule: "腰圆",
      cylinder: "圆柱",
      note: "便签",
    } as Record<string, string>)[normalized] ?? normalized;
  if (property === "borderStyle")
    return ({ solid: "实线", dashed: "虚线", dotted: "点线", dashDot: "点划线" } as Record<string, string>)[normalized] ?? normalized;
  if (property === "borderWidth") return `${normalized}px`;
  return normalized;
}

export function resolveNodeStyle(diagram: Diagram, node: DiagramNode): NodeStyle {
  const fallback = diagram.nodeStyles.find((style) => style.isDefault) ?? diagram.nodeStyles[0]!;
  const base = diagram.nodeStyles.find((style) => style.id === node.styleId) ?? fallback;
  const result = { ...base };
  [...diagram.styleDimensions]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .forEach((dimension) => {
      const optionId = node.styleAssignments[dimension.id];
      const option = dimension.options.find((item) => item.id === optionId);
      if (!option) return;
      applyStyleValue(result, dimension.property, option.value);
    });
  return result;
}

export function applyStyleValue(
  style: NodeStyle,
  property: StyleDimensionProperty,
  rawValue: string,
): void {
  const value = normalizeStyleOptionValue(property, rawValue);
  if (property === "borderWidth") style.borderWidth = Number(value) as 1 | 2 | 3;
  else if (property === "shape") style.shape = value as NodeStyle["shape"];
  else if (property === "borderStyle") style.borderStyle = value as NodeStyle["borderStyle"];
  else style[property] = value;
}

export function styleDimensionReferenceCount(diagram: Diagram, dimensionId: string): number {
  return diagram.nodes.filter((node) => Boolean(node.styleAssignments[dimensionId])).length;
}

export function sortedStyleDimensions(diagram: Diagram): StyleDimension[] {
  return [...diagram.styleDimensions].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

