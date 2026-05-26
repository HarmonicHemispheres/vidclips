export const PX_PER_SECOND_DEFAULT = 100

/** Width (px) of the per-track label column on the left of the timeline. */
export const LABEL_OFFSET = 96

export function msToPx(ms: number, pxPerSecond: number): number {
  return (ms / 1000) * pxPerSecond
}

export function pxToMs(px: number, pxPerSecond: number): number {
  return Math.max(0, Math.round((px / pxPerSecond) * 1000))
}
