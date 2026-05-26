/**
 * Shared between the renderer's PlaybackEngine and the main process's filterGraph.
 * Keeping these formulas in one place ensures preview matches export.
 */

export interface FadeArgs {
  clipElapsedMs: number
  clipDurationMs: number
  fadeInMs: number
  fadeOutMs: number
  /** Curve shape for fade in: 0 = linear, positive = ease-in (slow start), negative = ease-out. Range typically [-2, 2]. */
  fadeCurveIn?: number
  fadeCurveOut?: number
}

/** Curve value -> exponent. curve=0 → 1 (linear), curve=1 → 2, curve=-1 → 0.5. */
export function curveToExponent(curve: number): number {
  return Math.pow(2, curve)
}

/** Apply curve to a normalized progress t in [0,1] returning a value in [0,1]. */
export function applyCurve(t: number, curve: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(t, curveToExponent(curve))
}

export function fadeOpacity({
  clipElapsedMs,
  clipDurationMs,
  fadeInMs,
  fadeOutMs,
  fadeCurveIn = 0,
  fadeCurveOut = 0
}: FadeArgs): number {
  if (clipElapsedMs < 0 || clipElapsedMs > clipDurationMs) return 0

  let opacity = 1

  if (fadeInMs > 0 && clipElapsedMs < fadeInMs) {
    opacity = applyCurve(clipElapsedMs / fadeInMs, fadeCurveIn)
  }

  if (fadeOutMs > 0) {
    const fadeOutStart = clipDurationMs - fadeOutMs
    if (clipElapsedMs > fadeOutStart) {
      const remaining = 1 - (clipElapsedMs - fadeOutStart) / fadeOutMs
      opacity = Math.min(opacity, applyCurve(remaining, fadeCurveOut))
    }
  }

  return Math.max(0, Math.min(1, opacity))
}

/**
 * Cap fades so they cannot overlap each other within a clip and so they don't
 * exceed a project-wide maximum.
 */
export function clampFades(
  fadeInMs: number,
  fadeOutMs: number,
  clipDurationMs: number,
  maxFadeMs: number = Number.POSITIVE_INFINITY
): { fadeInMs: number; fadeOutMs: number } {
  const maxByDuration = Math.floor(clipDurationMs / 2)
  const maxEach = Math.max(0, Math.min(maxFadeMs, maxByDuration))
  return {
    fadeInMs: Math.max(0, Math.min(fadeInMs, maxEach)),
    fadeOutMs: Math.max(0, Math.min(fadeOutMs, maxEach))
  }
}

/** Clamp curve value to safe range. */
export function clampCurve(v: number): number {
  return Math.max(-2, Math.min(2, v))
}
