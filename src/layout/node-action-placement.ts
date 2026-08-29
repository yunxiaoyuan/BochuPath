import type { Rect } from "./swimlane-layout";

export type NodeActionPosition = "bottom" | "right" | "left" | "top";

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Size {
  width: number;
  height: number;
}

interface PlacementOptions {
  actionSize?: Size;
  offset?: number;
  stagePadding?: number;
  nodeClearance?: number;
}

const POSITIONS: NodeActionPosition[] = ["bottom", "right", "left", "top"];

/**
 * Chooses the closest side for an unscaled node action without covering another
 * business node. A fully visible, collision-free candidate always wins; when a
 * crowded or highly zoomed-out canvas makes that impossible, the least
 * obstructive side is used deterministically.
 */
export function chooseNodeActionPosition(
  anchor: Rect,
  otherNodes: Rect[],
  viewport: Viewport,
  stageSize: Size,
  options: PlacementOptions = {},
): NodeActionPosition {
  const actionSize = options.actionSize ?? { width: 120, height: 34 };
  const offset = options.offset ?? 12;
  const stagePadding = options.stagePadding ?? 8;
  const nodeClearance = options.nodeClearance ?? 6;
  const anchorScreen = project(anchor, viewport);
  const otherScreens = otherNodes.map((rect) =>
    expand(project(rect, viewport), nodeClearance),
  );
  const safeStage: Rect = {
    x: stagePadding,
    y: stagePadding,
    width: Math.max(0, stageSize.width - stagePadding * 2),
    height: Math.max(0, stageSize.height - stagePadding * 2),
  };

  let best = POSITIONS[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const position of POSITIONS) {
    const candidate = candidateRect(
      anchorScreen,
      actionSize,
      position,
      offset,
    );
    const nodeOverlap = otherScreens.reduce(
      (total, other) => total + overlapArea(candidate, other),
      0,
    );
    const outsideStage =
      candidate.width * candidate.height - overlapArea(candidate, safeStage);
    const score = nodeOverlap + outsideStage * 2;
    if (score < bestScore) {
      best = position;
      bestScore = score;
    }
    if (score === 0) return position;
  }
  return best;
}

function project(rect: Rect, viewport: Viewport): Rect {
  return {
    x: rect.x * viewport.zoom + viewport.x,
    y: rect.y * viewport.zoom + viewport.y,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

function candidateRect(
  anchor: Rect,
  action: Size,
  position: NodeActionPosition,
  offset: number,
): Rect {
  if (position === "bottom")
    return {
      x: anchor.x + (anchor.width - action.width) / 2,
      y: anchor.y + anchor.height + offset,
      ...action,
    };
  if (position === "right")
    return {
      x: anchor.x + anchor.width + offset,
      y: anchor.y + (anchor.height - action.height) / 2,
      ...action,
    };
  if (position === "left")
    return {
      x: anchor.x - action.width - offset,
      y: anchor.y + (anchor.height - action.height) / 2,
      ...action,
    };
  return {
    x: anchor.x + (anchor.width - action.width) / 2,
    y: anchor.y - action.height - offset,
    ...action,
  };
}

function expand(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function overlapArea(left: Rect, right: Rect): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  return width * height;
}
