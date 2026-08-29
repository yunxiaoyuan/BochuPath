import { describe, expect, it } from "vitest";
import { chooseNodeActionPosition } from "../src/layout/node-action-placement";

const VIEWPORT = { x: 0, y: 0, zoom: 1 };
const STAGE = { width: 600, height: 500 };

describe("node-adjacent pathway action placement", () => {
  it("prefers the space below the last node", () => {
    expect(
      chooseNodeActionPosition(
        { x: 200, y: 120, width: 160, height: 70 },
        [{ x: 20, y: 20, width: 120, height: 60 }],
        VIEWPORT,
        STAGE,
      ),
    ).toBe("bottom");
  });

  it("moves to the right when a node occupies the space below", () => {
    expect(
      chooseNodeActionPosition(
        { x: 200, y: 120, width: 160, height: 70 },
        [{ x: 210, y: 194, width: 140, height: 70 }],
        VIEWPORT,
        STAGE,
      ),
    ).toBe("right");
  });

  it("moves to the left when the bottom and right are occupied", () => {
    expect(
      chooseNodeActionPosition(
        { x: 250, y: 120, width: 100, height: 70 },
        [
          { x: 230, y: 194, width: 140, height: 70 },
          { x: 355, y: 105, width: 140, height: 100 },
        ],
        VIEWPORT,
        STAGE,
      ),
    ).toBe("left");
  });

  it("keeps the action inside the stage when the preferred side is clipped", () => {
    expect(
      chooseNodeActionPosition(
        { x: 180, y: 250, width: 100, height: 40 },
        [{ x: 292, y: 235, width: 100, height: 70 }],
        VIEWPORT,
        { width: 400, height: 300 },
      ),
    ).toBe("left");
  });
});
