import { useEffect, useMemo, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Film, Image as ImageIcon, Music } from 'lucide-react'
import type { Clip as ClipType, AssetType } from '@shared/types'
import { useStore } from '../../store'
import { msToPx, pxToMs } from '../../lib/geometry'
import { applyCurve, clampFades } from '@shared/fadeMath'
import { maxOutForRightTrim, minStartForLeftTrim } from '../../lib/timeline'

const TYPE_ICONS: Record<AssetType, typeof Film> = {
  video: Film,
  image: ImageIcon,
  audio: Music
}

const GRADIENT_BASE_ALPHA = 0.55
const GRADIENT_STOPS = 10

function buildFadeGradient(direction: 'in' | 'out', curve: number): string {
  const stops: string[] = []
  for (let i = 0; i <= GRADIENT_STOPS; i++) {
    const t = i / GRADIENT_STOPS
    // visibility(t) = how visible the underlying clip is at position t.
    // For fade-in, t=0 is invisible (start), t=1 is fully visible.
    // For fade-out, t=0 is fully visible (start of fade-out region), t=1 invisible.
    const visibility = direction === 'in' ? applyCurve(t, curve) : applyCurve(1 - t, curve)
    const alpha = ((1 - visibility) * GRADIENT_BASE_ALPHA).toFixed(3)
    stops.push(`rgba(14,165,233,${alpha}) ${(t * 100).toFixed(1)}%`)
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

function buildCurvePath(
  direction: 'in' | 'out',
  curve: number,
  w: number,
  h: number
): string {
  if (w < 2 || h < 2) return ''
  const steps = 24
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const visibility = direction === 'in' ? applyCurve(t, curve) : applyCurve(1 - t, curve)
    const x = (t * w).toFixed(1)
    const y = ((1 - visibility) * h).toFixed(1)
    pts.push(`${x},${y}`)
  }
  return 'M ' + pts.join(' L ')
}

interface Props {
  clip: ClipType
}

export function Clip({ clip }: Props): JSX.Element {
  const pxPerSecond = useStore((s) => s.pxPerSecond)
  const selectedId = useStore((s) => s.selectedClipId)
  const selectClip = useStore((s) => s.selectClip)
  const updateClip = useStore((s) => s.updateClip)
  const splitClip = useStore((s) => s.splitClip)
  const assets = useStore((s) => s.assets)
  const toolMode = useStore((s) => s.toolMode)

  const asset = assets.find((a) => a.id === clip.asset_id)
  const clipDurMs = clip.out_ms - clip.in_ms
  const isSelected = selectedId === clip.id
  const cutMode = toolMode === 'cut'

  const left = msToPx(clip.start_ms, pxPerSecond)
  const width = Math.max(8, msToPx(clipDurMs, pxPerSecond))

  const elRef = useRef<HTMLDivElement | null>(null)

  const draggableData = useMemo(
    () => ({ type: 'clip' as const, clipId: clip.id }),
    [clip.id]
  )
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `clip-${clip.id}`,
    data: draggableData,
    disabled: cutMode
  })

  const setRefs = (node: HTMLDivElement | null): void => {
    elRef.current = node
    setNodeRef(node)
  }

  const [resizing, setResizing] = useState<'left' | 'right' | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!asset?.thumbnail_path) {
      setThumbUrl(null)
      return
    }
    let cancelled = false
    void window.api.assets.getThumbUrl(asset.thumbnail_path).then((u) => {
      if (!cancelled) setThumbUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [asset?.thumbnail_path])

  const startResize = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setResizing(side)
    const startX = e.clientX
    const startIn = clip.in_ms
    const startOut = clip.out_ms
    const startStart = clip.start_ms
    // Images have no natural duration cap — let them stretch up to 5 minutes.
    const isImage = asset?.type === 'image'
    const assetCap = isImage
      ? 300_000
      : asset?.duration_ms && asset.duration_ms > 0
        ? asset.duration_ms
        : clip.out_ms
    // Images don't trim from the source either — keep in_ms at 0 always.
    const lockLeftEdge = isImage

    const allClips = useStore.getState().clips
    const neighborMaxOut = maxOutForRightTrim(clip, allClips, assetCap)
    const neighborMinStart = minStartForLeftTrim(clip, allClips)

    const onMove = (ev: PointerEvent): void => {
      const deltaPx = ev.clientX - startX
      const deltaMs = Math.round((deltaPx / pxPerSecond) * 1000)
      if (side === 'left') {
        if (lockLeftEdge) {
          // Move the whole clip horizontally, but don't push into previous clip.
          const requested = startStart + deltaMs
          const clipDur = startOut - startIn
          const newStart = Math.max(neighborMinStart, Math.min(requested, startStart))
          // Don't push past the right neighbor either (won't change duration here)
          const maxStart = neighborMaxOut === Number.POSITIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : startStart + (neighborMaxOut - startOut)
          const finalStart = Math.max(0, Math.min(newStart, maxStart, requested))
          // If requested is to the LEFT of original AND below neighborMinStart, clamp.
          const clamped = Math.max(neighborMinStart, Math.max(0, finalStart))
          updateClip(clip.id, { start_ms: clamped }, { optimistic: true })
          return
        }
        // Normal trim-from-source: in_ms grows, start_ms moves in lockstep so
        // the right edge stays put. The left edge can't go below neighborMinStart.
        const desiredIn = startIn + deltaMs
        const consumedLowerBound = neighborMinStart - startStart // (negative if room to the left)
        const newIn = Math.max(
          Math.max(0, startIn + consumedLowerBound),
          Math.min(startOut - 100, desiredIn)
        )
        const consumed = newIn - startIn
        const newStart = startStart + consumed
        updateClip(
          clip.id,
          { in_ms: newIn, start_ms: newStart },
          { optimistic: true }
        )
      } else {
        const newOut = Math.max(
          startIn + 100,
          Math.min(neighborMaxOut, startOut + deltaMs)
        )
        updateClip(clip.id, { out_ms: newOut }, { optimistic: true })
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizing(null)
      // Reclamp fades to the new duration after resize
      const state = useStore.getState()
      const current = state.clips.find((c) => c.id === clip.id)
      if (current) {
        const newDur = current.out_ms - current.in_ms
        const maxFadeMs = state.meta?.max_fade_ms ?? 7000
        const clamped = clampFades(current.fade_in_ms, current.fade_out_ms, newDur, maxFadeMs)
        if (clamped.fadeInMs !== current.fade_in_ms || clamped.fadeOutMs !== current.fade_out_ms) {
          void updateClip(clip.id, {
            fade_in_ms: clamped.fadeInMs,
            fade_out_ms: clamped.fadeOutMs
          })
        }

        // Push undo history if anything geometric changed
        const changed =
          current.start_ms !== startStart ||
          current.in_ms !== startIn ||
          current.out_ms !== startOut
        if (changed) {
          const clipId = clip.id
          useStore.getState().pushHistory({
            description: side === 'left' ? 'trim left' : 'trim right',
            undo: async () => {
              await useStore.getState().updateClip(clipId, {
                start_ms: startStart,
                in_ms: startIn,
                out_ms: startOut
              })
            }
          })
        }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (cutMode) {
      const el = elRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const offsetPx = e.clientX - rect.left
      const offsetMs = pxToMs(Math.max(0, offsetPx), pxPerSecond)
      const atTimelineMs = clip.start_ms + offsetMs
      void splitClip(clip.id, atTimelineMs)
      return
    }
    selectClip(clip.id)
  }

  // Fade overlay widths (visual hint on the clip)
  const fadeInPx = msToPx(clip.fade_in_ms, pxPerSecond)
  const fadeOutPx = msToPx(clip.fade_out_ms, pxPerSecond)
  const showFadeCurves = useStore((s) => s.showFadeCurves)

  const fadeInGradient = useMemo(
    () => buildFadeGradient('in', clip.fade_curve_in ?? 0),
    [clip.fade_curve_in]
  )
  const fadeOutGradient = useMemo(
    () => buildFadeGradient('out', clip.fade_curve_out ?? 0),
    [clip.fade_curve_out]
  )

  return (
    <div
      ref={setRefs}
      {...(cutMode ? {} : attributes)}
      {...(cutMode ? {} : listeners)}
      onClick={handleClick}
      className={`timeline-clip ${isSelected ? 'selected' : ''} ${
        isDragging ? 'z-30 shadow-lg ring-2 ring-sky-400' : ''
      } ${cutMode ? 'hover:ring-2 hover:ring-red-400' : ''}`}
      style={{
        left,
        width,
        cursor: cutMode
          ? 'crosshair'
          : resizing
            ? 'ew-resize'
            : isDragging
              ? 'grabbing'
              : 'grab',
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : undefined
      }}
      title={cutMode ? 'Click to split here' : asset?.filename}
    >
      <div className="h-full w-full overflow-hidden rounded relative">
        {thumbUrl && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("${thumbUrl}")`,
              backgroundRepeat: 'repeat-x',
              backgroundSize: 'auto 100%',
              opacity: 0.55
            }}
          />
        )}
        <div className="relative px-1.5 py-1 text-[11px] truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] flex items-center gap-1">
          {asset && (() => {
            const Icon = TYPE_ICONS[asset.type]
            return <Icon className="h-3 w-3 flex-shrink-0 opacity-90" />
          })()}
          <span className="truncate">
            {asset
              ? asset.linked
                ? (asset.filename.split(/[/\\]/).pop() ?? asset.filename)
                : asset.filename
              : '...'}
          </span>
        </div>
        {fadeInPx > 0 && (
          <FadeOverlay
            side="left"
            widthPx={fadeInPx}
            gradient={fadeInGradient}
            curve={clip.fade_curve_in ?? 0}
            showCurveOverlay={showFadeCurves}
            direction="in"
          />
        )}
        {fadeOutPx > 0 && (
          <FadeOverlay
            side="right"
            widthPx={fadeOutPx}
            gradient={fadeOutGradient}
            curve={clip.fade_curve_out ?? 0}
            showCurveOverlay={showFadeCurves}
            direction="out"
          />
        )}
      </div>
      {!cutMode && (
        <>
          <div
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-sky-400"
            onPointerDown={startResize('left')}
          />
          <div
            className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-sky-400"
            onPointerDown={startResize('right')}
          />
        </>
      )}
    </div>
  )
}

interface FadeOverlayProps {
  side: 'left' | 'right'
  widthPx: number
  gradient: string
  curve: number
  showCurveOverlay: boolean
  direction: 'in' | 'out'
}

function FadeOverlay({
  side,
  widthPx,
  gradient,
  curve,
  showCurveOverlay,
  direction
}: FadeOverlayProps): JSX.Element {
  // Reasonable assumed clip row height; SVG uses preserveAspectRatio=none so
  // the actual pixel height doesn't matter for the visual.
  const svgH = 32
  const path = buildCurvePath(direction, curve, widthPx, svgH)
  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{
        width: widthPx,
        [side]: 0,
        background: gradient
      }}
    >
      {showCurveOverlay && widthPx >= 6 && (
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${widthPx} ${svgH}`}
          preserveAspectRatio="none"
        >
          <path
            d={path}
            stroke="#7dd3fc"
            strokeWidth={1.5}
            fill="none"
            opacity={0.9}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}
