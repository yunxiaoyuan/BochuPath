import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  borderDashArray,
  nodeShapeLabel,
  nodeShapeOptions,
  pathwayDashArray,
  shapeContentInsets,
  shapeMinimumHeight,
} from "../src/domain/node-shapes";
import type { NodeStyle } from "../src/domain/types";
import { NodeShape } from "../src/features/workspace/components/NodeShape";

const baseStyle: NodeStyle = {
  id: "style-test",
  name: "测试样式",
  shape: "roundedRect",
  fillColor: "#eef3ff",
  borderColor: "#2f64f7",
  borderStyle: "solid",
  borderWidth: 1,
  borderRadius: 4,
  textColor: "#1f2329",
  isDefault: false,
  isSystem: false,
};

describe("node shape rendering", () => {
  it("renders every selectable shape with a real vector outline", () => {
    expect(nodeShapeOptions.map((option) => option.value)).toEqual([
      "rect", "roundedRect", "document", "ellipse", "capsule", "cylinder", "note",
    ]);
    nodeShapeOptions.forEach(({ value, label }) => {
      const { container, unmount } = render(
        <div style={{ width: 180, height: 64, position: "relative" }}>
          <NodeShape style={{ ...baseStyle, shape: value }} width={180} height={64} />
        </div>,
      );
      expect(container.querySelector(".node-shape-surface")).not.toBeNull();
      expect(nodeShapeLabel(value)).toBe(label);
      unmount();
    });
  });

  it("reserves the wave, fold and cylinder arcs outside the text area", () => {
    expect(shapeContentInsets("document", 180).bottom).toBeGreaterThan(shapeContentInsets("rect", 180).bottom);
    expect(shapeContentInsets("note", 180).right).toBeGreaterThan(shapeContentInsets("rect", 180).right);
    expect(shapeContentInsets("cylinder", 180).top).toBeGreaterThan(shapeContentInsets("rect", 180).top);
    expect(shapeMinimumHeight("cylinder")).toBeGreaterThan(shapeMinimumHeight("roundedRect"));
  });

  it("uses a dash-dot pattern for node borders and pathway lines", () => {
    expect(borderDashArray("dashDot")).toBe("8 4 1 4");
    expect(pathwayDashArray("dashDot")).toBe("8 4 1 4");
  });
});
