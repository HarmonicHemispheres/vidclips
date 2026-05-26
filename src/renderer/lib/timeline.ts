import type { Clip } from '@shared/types'

export interface PlacementCheck {
  trackId: number
  startMs: number
  durationMs: number
  excludeClipId?: number
}

export function clipDuration(c: Clip): number {
  return c.out_ms - c.in_ms
}

export function overlapsAny(clips: Clip[], check: PlacementCheck): boolean {
  const end = check.startMs + check.durationMs
  return clips.some((c) => {
    if (c.track_id !== check.trackId) return false
    if (check.excludeClipId !== undefined && c.id === check.excludeClipId) return false
    const cStart = c.start_ms
    const cEnd = c.start_ms + clipDuration(c)
    return check.startMs < cEnd && end > cStart
  })
}

/**
 * Returns the closest start_ms (>= 0) where the candidate clip doesn't overlap
 * anything else on the track. If no such slot exists at all, returns null.
 */
export function findValidStart(
  clips: Clip[],
  check: PlacementCheck
): number | null {
  if (check.durationMs <= 0) return Math.max(0, check.startMs)
  if (!overlapsAny(clips, check)) return Math.max(0, check.startMs)

  const others = clips.filter(
    (c) =>
      c.track_id === check.trackId &&
      (check.excludeClipId === undefined || c.id !== check.excludeClipId)
  )

  // Candidate snap points: just after each clip, or just before (start - duration).
  const candidates: number[] = [0]
  for (const c of others) {
    const cStart = c.start_ms
    const cEnd = c.start_ms + clipDuration(c)
    candidates.push(cEnd)
    candidates.push(cStart - check.durationMs)
  }

  const valid = candidates
    .filter((p) => p >= 0)
    .filter((p) => !overlapsAny(clips, { ...check, startMs: p }))

  if (valid.length === 0) return null

  valid.sort(
    (a, b) => Math.abs(a - check.startMs) - Math.abs(b - check.startMs)
  )
  return valid[0]
}

/**
 * For a clip's right-edge trim: returns the maximum out_ms allowed by the
 * neighboring clip on the same track (or +Infinity if none).
 */
export function maxOutForRightTrim(
  clip: Clip,
  allClips: Clip[],
  assetCap: number
): number {
  const nextClip = allClips
    .filter(
      (c) =>
        c.track_id === clip.track_id &&
        c.id !== clip.id &&
        c.start_ms >= clip.start_ms
    )
    .sort((a, b) => a.start_ms - b.start_ms)[0]
  const neighborCap = nextClip
    ? clip.in_ms + (nextClip.start_ms - clip.start_ms)
    : Number.POSITIVE_INFINITY
  return Math.min(assetCap, neighborCap)
}

/**
 * For a clip's left-edge trim: returns the minimum start_ms allowed by the
 * preceding clip on the same track (0 if none).
 */
export function minStartForLeftTrim(clip: Clip, allClips: Clip[]): number {
  const prevClip = allClips
    .filter(
      (c) =>
        c.track_id === clip.track_id &&
        c.id !== clip.id &&
        c.start_ms + clipDuration(c) <= clip.start_ms
    )
    .sort(
      (a, b) =>
        b.start_ms + clipDuration(b) - (a.start_ms + clipDuration(a))
    )[0]
  return prevClip ? prevClip.start_ms + clipDuration(prevClip) : 0
}
