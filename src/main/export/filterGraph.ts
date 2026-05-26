import path from 'node:path'
import type { Asset, Clip, Track } from '@shared/types'
import { assetsDir } from '../db/connection'

export interface FilterGraphInput {
  clips: Clip[]
  tracks: Track[]
  assets: Asset[]
  width: number
  height: number
  fps: number
}

export interface FilterGraphResult {
  inputs: string[] // ffmpeg "-i" arguments paths
  filterComplex: string
  outVideo: string // label of final video stream, e.g. "[vout]"
  outAudio: string | null
  durationMs: number
}

/**
 * Builds an ffmpeg filter_complex graph for the timeline.
 *
 * Strategy:
 *  - For each clip:
 *     - if video clip: trim + setpts + fade in/out -> label vN
 *     - if audio clip: atrim + asetpts + afade in/out -> label aN
 *  - For each video track: pad each clip with black before/after to align to global timeline,
 *    then overlay clips onto a base black canvas using the timeline ordering.
 *  - Audio clips are delayed (adelay) and amix-ed.
 *
 * Simplification for MVP: each clip is rendered onto a per-clip black video matching the timeline duration,
 * positioned via setpts. Clips on higher z_index overlay clips below.
 */
export function buildFilterGraph(input: FilterGraphInput): FilterGraphResult {
  const { clips, tracks, assets, width, height, fps } = input
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const trackById = new Map(tracks.map((t) => [t.id, t]))

  // Determine total timeline duration in ms
  const durationMs = clips.reduce((max, c) => {
    const clipDur = c.out_ms - c.in_ms
    return Math.max(max, c.start_ms + clipDur)
  }, 0)

  if (durationMs === 0) {
    throw new Error('Timeline is empty')
  }

  const inputs: string[] = []
  const filterLines: string[] = []
  const aDir = assetsDir()

  // Generate a black base canvas of timeline duration
  const colorSrc = `color=c=black:s=${width}x${height}:r=${fps}:d=${durationMs / 1000}`
  filterLines.push(`${colorSrc}[base]`)

  // Sort video clips by z_index, then start_ms — so lower z renders first
  const videoClips: { clip: Clip; asset: Asset; inputIdx: number }[] = []
  const audioClips: { clip: Clip; asset: Asset; inputIdx: number }[] = []

  for (const clip of clips) {
    const asset = assetById.get(clip.asset_id)
    const track = trackById.get(clip.track_id)
    if (!asset || !track) continue

    // Tracks are type-agnostic: any asset works on any track.
    const wantsVideo =
      clip.hidden === 0 && (asset.type === 'video' || asset.type === 'image')
    const wantsAudio =
      clip.muted === 0 && (asset.type === 'audio' || asset.type === 'video')

    if (!wantsVideo && !wantsAudio) continue

    const inputIdx = inputs.length
    inputs.push(path.join(aDir, asset.filename))

    if (wantsVideo) videoClips.push({ clip, asset, inputIdx })
    if (wantsAudio) audioClips.push({ clip, asset, inputIdx })
  }

  // Map our curve value (-2..2, 0=linear) to ffmpeg's closest fade curve preset.
  const curvePreset = (curve: number): string => {
    const exp = Math.pow(2, curve)
    if (exp >= 3.5) return 'ipar'
    if (exp >= 2.4) return 'cub'
    if (exp >= 1.5) return 'qua'
    if (exp >= 0.85) return 'tri'
    if (exp >= 0.4) return 'squ'
    return 'cbr'
  }

  // Tracks with LOWER order_index render on top. ffmpeg's overlay composites
  // each new input on top of the running canvas, so we render the highest
  // order_index FIRST (bottom of the stack) and the lowest LAST (top of stack).
  videoClips.sort((a, b) => {
    const ta = trackById.get(a.clip.track_id)?.order_index ?? 0
    const tb = trackById.get(b.clip.track_id)?.order_index ?? 0
    if (ta !== tb) return tb - ta
    return a.clip.start_ms - b.clip.start_ms
  })

  const videoLabels: string[] = []
  videoClips.forEach(({ clip, asset, inputIdx }, i) => {
    const clipDurSec = (clip.out_ms - clip.in_ms) / 1000
    const fadeInSec = clip.fade_in_ms / 1000
    const fadeOutSec = clip.fade_out_ms / 1000
    const fadeOutStart = Math.max(0, clipDurSec - fadeOutSec)
    const label = `v${i}`
    let chain: string

    // Scale media to fit canvas while preserving aspect ratio (no pad).
    if (asset.type === 'image') {
      chain =
        `[${inputIdx}:v]loop=loop=-1:size=1,trim=duration=${clipDurSec},` +
        `setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1`
    } else {
      chain =
        `[${inputIdx}:v]trim=start=${clip.in_ms / 1000}:end=${clip.out_ms / 1000},` +
        `setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1`
    }

    // Apply user scale transform if not 1.
    const userScale = clip.transform_scale ?? 1
    if (userScale > 0 && Math.abs(userScale - 1) > 0.001) {
      chain += `,scale=iw*${userScale}:ih*${userScale}`
    }

    // Apply rotation if not zero. Use diagonal bbox so corners aren't cropped.
    const rotDeg = clip.transform_rotation ?? 0
    if (Math.abs(rotDeg) > 0.001) {
      const rad = (rotDeg * Math.PI) / 180
      chain += `,rotate=${rad}:c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`
    }

    if (fadeInSec > 0) {
      chain += `,fade=t=in:st=0:d=${fadeInSec}:alpha=1:curve=${curvePreset(clip.fade_curve_in)}`
    }
    if (fadeOutSec > 0) {
      chain += `,fade=t=out:st=${fadeOutStart}:d=${fadeOutSec}:alpha=1:curve=${curvePreset(clip.fade_curve_out)}`
    }

    chain += `,format=yuva420p[${label}]`
    filterLines.push(chain)
    videoLabels.push(label)
  })

  // Overlay each clip onto base, positioned by clip transform + centered.
  let prev = 'base'
  videoClips.forEach(({ clip }, i) => {
    const label = videoLabels[i]
    const next = `vov${i}`
    const startSec = clip.start_ms / 1000
    const endSec = (clip.start_ms + (clip.out_ms - clip.in_ms)) / 1000
    const tx = clip.transform_x ?? 0
    const ty = clip.transform_y ?? 0
    // (W-w)/2 + tx centers the overlay then shifts by tx; same for y.
    const txExpr = `(W-w)/2${tx >= 0 ? '+' : ''}${tx}`
    const tyExpr = `(H-h)/2${ty >= 0 ? '+' : ''}${ty}`
    filterLines.push(
      `[${prev}][${label}]overlay=enable='between(t,${startSec},${endSec})':x='${txExpr}':y='${tyExpr}'[${next}]`
    )
    prev = next
  })

  const finalVideoLabel = videoClips.length > 0 ? prev : 'base'

  // Audio streams: per-clip atrim + afade + adelay
  const audioLabels: string[] = []
  audioClips.forEach(({ clip, inputIdx }, i) => {
    const clipDurSec = (clip.out_ms - clip.in_ms) / 1000
    const fadeInSec = clip.fade_in_ms / 1000
    const fadeOutSec = clip.fade_out_ms / 1000
    const fadeOutStart = Math.max(0, clipDurSec - fadeOutSec)
    const label = `a${i}`

    let chain =
      `[${inputIdx}:a]atrim=start=${clip.in_ms / 1000}:end=${clip.out_ms / 1000},` +
      `asetpts=PTS-STARTPTS`

    if (fadeInSec > 0) {
      chain += `,afade=t=in:st=0:d=${fadeInSec}:curve=${curvePreset(clip.fade_curve_in)}`
    }
    if (fadeOutSec > 0) {
      chain += `,afade=t=out:st=${fadeOutStart}:d=${fadeOutSec}:curve=${curvePreset(clip.fade_curve_out)}`
    }

    chain += `,adelay=${clip.start_ms}|${clip.start_ms}[${label}]`
    filterLines.push(chain)
    audioLabels.push(label)
  })

  let outAudio: string | null = null
  if (audioLabels.length > 0) {
    const mixIn = audioLabels.map((l) => `[${l}]`).join('')
    filterLines.push(`${mixIn}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[aout]`)
    outAudio = '[aout]'
  }

  return {
    inputs,
    filterComplex: filterLines.join(';'),
    outVideo: `[${finalVideoLabel}]`,
    outAudio,
    durationMs
  }
}
