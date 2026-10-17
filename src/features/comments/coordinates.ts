export type ImagePoint = { xRatio: number; yRatio: number };
export function imagePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): ImagePoint | null {
  if (
    ![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(
      Number.isFinite,
    ) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  const x = (clientX - rect.left) / rect.width,
    y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    xRatio: Math.max(0, Math.min(1, x)),
    yRatio: Math.max(0, Math.min(1, y)),
  };
}
export function isPinClick(
  start: { x: number; y: number },
  end: { x: number; y: number },
  dragged = false,
) {
  return !dragged && Math.hypot(end.x - start.x, end.y - start.y) <= 6;
}
