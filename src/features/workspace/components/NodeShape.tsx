import type { SVGProps } from "react";
import { borderDashArray } from "../../../domain/node-shapes";
import type { NodeStyle } from "../../../domain/types";

type VisualStyle = Pick<
  NodeStyle,
  "shape" | "fillColor" | "borderColor" | "borderStyle" | "borderWidth" | "borderRadius"
>;

interface Props {
  style: VisualStyle;
  width: number;
  height: number;
  className?: string;
}

export function NodeShape({ style, width, height, className = "" }: Props) {
  const dash = borderDashArray(style.borderStyle);
  const shared = {
    fill: style.fillColor,
    stroke: style.borderColor,
    strokeWidth: style.borderWidth,
    strokeDasharray: dash,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      className={`node-shape-graphic ${className}`.trim()}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <ShapeGeometry
        shape={style.shape}
        width={width}
        height={height}
        borderRadius={style.borderRadius}
        className="node-shape-surface"
        {...shared}
      />
      {style.shape === "cylinder" && (
        <path
          className="node-shape-detail"
          d="M1 15 C1 23 23 29 50 29 C77 29 99 23 99 15"
          fill="none"
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          strokeDasharray={dash}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {style.shape === "note" && (
        <path
          className="node-shape-detail"
          d="M80 1 V20 H99"
          fill="none"
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <ShapeGeometry
        shape={style.shape}
        width={width}
        height={height}
        borderRadius={style.borderRadius}
        className="node-shape-emphasis"
        fill="none"
        stroke="transparent"
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface GeometryProps extends SVGProps<SVGElement> {
  shape: NodeStyle["shape"];
  width: number;
  height: number;
  borderRadius: number;
}

function ShapeGeometry({ shape, width, height, borderRadius, ...props }: GeometryProps) {
  if (shape === "ellipse") return <ellipse cx="50" cy="50" rx="49" ry="49" {...props as SVGProps<SVGEllipseElement>} />;
  if (shape === "document") {
    return <path d="M1 1 H99 V77 C79 62 61 62 43 76 C27 89 13 89 1 78 Z" {...props as SVGProps<SVGPathElement>} />;
  }
  if (shape === "cylinder") {
    return <path d="M1 15 C1 7 23 1 50 1 C77 1 99 7 99 15 V85 C99 93 77 99 50 99 C23 99 1 93 1 85 Z" {...props as SVGProps<SVGPathElement>} />;
  }
  if (shape === "note") {
    return <path d="M1 1 H80 L99 20 V99 H1 Z" {...props as SVGProps<SVGPathElement>} />;
  }
  if (shape === "capsule") return <rect x="1" y="1" width="98" height="98" rx="49" ry="49" {...props as SVGProps<SVGRectElement>} />;
  const rx = shape === "roundedRect"
    ? Math.min(48, Math.max(0, borderRadius / Math.max(1, width) * 100))
    : 0;
  const ry = shape === "roundedRect"
    ? Math.min(48, Math.max(0, borderRadius / Math.max(1, height) * 100))
    : 0;
  return <rect x="1" y="1" width="98" height="98" rx={rx} ry={ry} {...props as SVGProps<SVGRectElement>} />;
}
