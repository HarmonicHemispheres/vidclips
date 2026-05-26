import type { Asset, Clip, Track } from '@shared/types'
import { fadeOpacity } from '@shared/fadeMath'

export interface RenderableClip {
  clip: Clip
  asset: Asset
  track: Track
}

export interface VisibleState {
  /** clips whose timeline span contains currentMs, sorted by z_index ascending */
  videoLayers: RenderableLayer[]
  audioLayers: RenderableLayer[]
}

export interface RenderableLayer {
  clip: Clip
  asset: Asset
  track: Track
  opacity: number
  /** time within the source asset, in ms */
  assetTimeMs: number
}

export function computeVisible(
  currentMs: number,
  clips: Clip[],
  assets: Asset[],
  tracks: Track[]
): VisibleState {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const trackById = new Map(tracks.map((t) => [t.id, t]))

  const videoLayers: RenderableLayer[] = []
  const audioLayers: RenderableLayer[] = []

  for (const clip of clips) {
    const asset = assetById.get(clip.asset_id)
    const track = trackById.get(clip.track_id)
    if (!asset || !track) continue
    const dur = clip.out_ms - clip.in_ms
    const elapsed = currentMs - clip.start_ms
    if (elapsed < 0 || elapsed > dur) continue
    const opacity = fadeOpacity({
      clipElapsedMs: elapsed,
      clipDurationMs: dur,
      fadeInMs: clip.fade_in_ms,
      fadeOutMs: clip.fade_out_ms,
      fadeCurveIn: clip.fade_curve_in,
      fadeCurveOut: clip.fade_curve_out
    })
    const layer: RenderableLayer = {
      clip,
      asset,
      track,
      opacity,
      assetTimeMs: clip.in_ms + elapsed
    }
    // Tracks are type-agnostic: any asset works on any track. Visual content
    // (video or image) always renders; anything with audio (audio asset or video)
    // always plays through.
    if (asset.type === 'video' || asset.type === 'image') {
      videoLayers.push(layer)
    }
    if (asset.type === 'audio' || asset.type === 'video') {
      audioLayers.push(layer)
    }
  }

  // Tracks with LOWER order_index render on top. We return layers in render
  // order (bottom-first → top-last), so sort descending by order_index.
  videoLayers.sort((a, b) => b.track.order_index - a.track.order_index)

  return { videoLayers, audioLayers }
}
