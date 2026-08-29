import type { Rect } from "./swimlane-layout";

export interface ViewportSize {
  width: number;
  height: number;
}
export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}
export interface FitViewportOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Fits complete layout bounds into the actual React Flow stage.
 * The result is independent from page/sidebar dimensions and is safe for very large diagrams.
 */
export function fitViewportToBounds(
  bounds: Rect,
  viewport: ViewportSize,
  options: FitViewportOptions = {},
): ViewportTransform {
  const padding = Math.max(0, options.padding ?? 32);
  const minZoom = Math.max(0.0001, options.minZoom ?? 0.001);
  const maxZoom = Math.max(minZoom, options.maxZoom ?? 1);
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const boundsWidth = Math.max(1, bounds.width);
  const boundsHeight = Math.max(1, bounds.height);
  const zoom = clamp(
    Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight),
    minZoom,
    maxZoom,
  );

  return {
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
