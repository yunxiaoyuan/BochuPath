import { describe, expect, it } from "vitest";
import { createDemoDiagram } from "../src/domain/seed";
import type { Diagram } from "../src/domain/types";
import { fitViewportToBounds } from "../src/layout/fit-viewport";
import { layoutDiagram } from "../src/layout/swimlane-layout";

const VIEWPORT = { width: 872, height: 784 };
const PADDING = 32;

describe("canvas fit viewport", () => {
  it.each([1, 10, 100, 500])(
    "keeps %i TB nodes inside the actual stage",
    (count) => {
      expectFits(createDiagram(count, "TB"));
    },
  );

  it.each([1, 10, 100, 500])(
    "keeps %i LR nodes inside the actual stage",
    (count) => {
      expectFits(createDiagram(count, "LR"));
    },
  );

  it("never enlarges a small diagram above 100%", () => {
    const transform = fitViewportToBounds(
      { x: 20, y: 20, width: 100, height: 80 },
      VIEWPORT,
      { padding: PADDING, maxZoom: 1 },
    );
    expect(transform.zoom).toBe(1);
  });
});

function expectFits(diagram: Diagram): void {
  const bounds = layoutDiagram(diagram).bounds;
  const transform = fitViewportToBounds(bounds, VIEWPORT, {
    padding: PADDING,
    minZoom: 0.001,
    maxZoom: 1,
  });
  const projected = {
    left: bounds.x * transform.zoom + transform.x,
    top: bounds.y * transform.zoom + transform.y,
    right: (bounds.x + bounds.width) * transform.zoom + transform.x,
    bottom: (bounds.y + bounds.height) * transform.zoom + transform.y,
  };
  expect(projected.left).toBeGreaterThanOrEqual(PADDING - 0.01);
  expect(projected.top).toBeGreaterThanOrEqual(PADDING - 0.01);
  expect(projected.right).toBeLessThanOrEqual(VIEWPORT.width - PADDING + 0.01);
  expect(projected.bottom).toBeLessThanOrEqual(
    VIEWPORT.height - PADDING + 0.01,
  );
}

function createDiagram(count: number, direction: "TB" | "LR"): Diagram {
  const diagram = createDemoDiagram();
  diagram.layers = [
    { id: "stress-layer", parentId: null, name: "压力测试泳道", order: 10 },
  ];
  diagram.nodes = Array.from({ length: count }, (_, index) => ({
    id: `stress-node-${index}`,
    layerId: "stress-layer",
    styleId: "style_confirmed",
    name: `节点 ${index + 1}`,
    decompositionItems: [],
    order: (index + 1) * 10,
  }));
  diagram.pathways = [];
  diagram.layout = { ...diagram.layout, direction };
  return diagram;
}
