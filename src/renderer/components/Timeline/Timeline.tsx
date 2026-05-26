import { useEffect, useRef, useState } from 'react'
import { useStore, getTimelineDurationMs } from '../../store'
import { Track } from './Track'
import { Playhead } from './Playhead'
import { LABEL_OFFSET, msToPx, pxToMs } from '../../lib/geometry'
import { formatMs } from '../../lib/utils'
import { Button } from '../ui/button'
import { Plus, MousePointer2, Scissors } from 'lucide-react'

const RULER_HEIGHT = 24
const TRACK_HEIGHT = 56

export function Timeline(): JSX.Element {
  const tracks = useStore((s) => s.tracks)
  const pxPerSecond = useStore((s) => s.pxPerSecond)
  const setPxPerSecond = useStore((s) => s.setPxPerSecond)
  const totalMs = useStore(getTimelineDurationMs)
  const currentMs = useStore((s) => s.currentTimeMs)
  const seek = useStore((s) => s.seek)
  const pause = useStore((s) => s.pause)
  const selectClip = useStore((s) => s.selectClip)
  const projectDurationMs = useStore((s) => s.meta?.duration_ms ?? 60000)
  const addTrack = useStore((s) => s.addTrack)
  const toolMode = useStore((s) => s.toolMode)
  const setToolMode = useStore((s) => s.setToolMode)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Pixel width: at least the project's intended length, plus a small overscroll buffer.
  const visibleMs = Math.max(totalMs, projectDurationMs) + 5000
  const contentPx = LABEL_OFFSET + msToPx(visibleMs, pxPerSecond)

  // Zoom with ctrl+wheel
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        setPxPerSecond(pxPerSecond * factor)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pxPerSecond, setPxPerSecond])

  // Click-and-drag the ruler to scrub.
  const handleRulerPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    pause()
    const target = e.currentTarget as HTMLDivElement
    const apply = (clientX: number): void => {
      const rect = target.getBoundingClientRect()
      const x = clientX - rect.left - LABEL_OFFSET
      seek(pxToMs(Math.max(0, x), pxPerSecond))
    }
    apply(e.clientX)
    const move = (ev: PointerEvent): void => apply(ev.clientX)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleBackgroundClick = (): void => {
    selectClip(null)
  }

  return (
    <div className="flex flex-col bg-card border-t border-border min-h-0 min-w-0 overflow-hidden h-full">
      <div className="flex items-center justify-between gap-2 px-3 h-8 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Timeline
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => void addTrack()}
            title="Add a new track"
          >
            <Plus className="h-3 w-3" />
            Track
          </Button>
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 ml-1">
            <button
              type="button"
              onClick={() => setToolMode('select')}
              className={`h-5 w-6 rounded flex items-center justify-center transition-colors ${
                toolMode === 'select'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Select tool (drag and trim clips)"
            >
              <MousePointer2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setToolMode('cut')}
              className={`h-5 w-6 rounded flex items-center justify-center transition-colors ${
                toolMode === 'cut'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Cut tool — click a clip to split it at that point"
            >
              <Scissors className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <ProjectLengthField durationMs={projectDurationMs} />
          <span className="hidden sm:inline font-mono tabular-nums">
            {Math.round(pxPerSecond)} px/s
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto" ref={scrollRef} onClick={handleBackgroundClick}>
        <div
          className="relative timeline-content"
          style={{ width: contentPx, minHeight: RULER_HEIGHT + tracks.length * TRACK_HEIGHT }}
        >
          <Ruler
            durationMs={visibleMs}
            pxPerSecond={pxPerSecond}
            height={RULER_HEIGHT}
            onPointerDown={handleRulerPointerDown}
          />
          <ProjectEndMarker
            durationMs={projectDurationMs}
            pxPerSecond={pxPerSecond}
            top={RULER_HEIGHT}
          />
          <div style={{ top: RULER_HEIGHT, position: 'relative' }}>
            {tracks.map((t, i) => (
              <Track key={t.id} track={t} top={i * TRACK_HEIGHT} height={TRACK_HEIGHT} />
            ))}
          </div>
          <Playhead currentMs={currentMs} pxPerSecond={pxPerSecond} top={RULER_HEIGHT} />
        </div>
      </div>
    </div>
  )
}

function Ruler({
  durationMs,
  pxPerSecond,
  height,
  onPointerDown
}: {
  durationMs: number
  pxPerSecond: number
  height: number
  onPointerDown: (e: React.PointerEvent) => void
}): JSX.Element {
  const ticks: JSX.Element[] = []
  const totalSec = Math.ceil(durationMs / 1000)
  const labelEvery = pxPerSecond < 40 ? 5 : pxPerSecond < 80 ? 2 : 1
  for (let s = 0; s <= totalSec; s++) {
    const x = LABEL_OFFSET + msToPx(s * 1000, pxPerSecond)
    const isMajor = s % labelEvery === 0
    ticks.push(
      <div
        key={s}
        className="absolute top-0 bottom-0 border-l border-border pointer-events-none"
        style={{ left: x, opacity: isMajor ? 1 : 0.4 }}
      >
        {isMajor && (
          <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground font-mono">
            {formatMs(s * 1000)}
          </span>
        )}
      </div>
    )
  }
  return (
    <div
      className="sticky top-0 z-10 bg-card/80 backdrop-blur cursor-col-resize border-b border-border select-none"
      style={{ height }}
      onPointerDown={onPointerDown}
    >
      <div className="relative h-full">{ticks}</div>
    </div>
  )
}

const MAX_PROJECT_LENGTH_SEC = 36000 // 10 hours

function ProjectLengthField({ durationMs }: { durationMs: number }): JSX.Element {
  const setMeta = useStore((s) => s.setMeta)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft((durationMs / 1000).toFixed(2))
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, durationMs])

  const commit = async (): Promise<void> => {
    const secs = parseFloat(draft)
    setEditing(false)
    if (!isFinite(secs) || secs <= 0) return
    const ms = Math.max(1000, Math.min(MAX_PROJECT_LENGTH_SEC * 1000, Math.round(secs * 1000)))
    if (ms === durationMs) return
    const before = durationMs
    const updated = await window.api.project.updateMeta({ duration_ms: ms })
    setMeta(updated)
    useStore.getState().pushHistory({
      description: 'change project length',
      undo: async () => {
        const reverted = await window.api.project.updateMeta({ duration_ms: before })
        useStore.getState().setMeta(reverted)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="uppercase tracking-wide text-[10px]">Length</span>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min={1}
          step="0.1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            else if (e.key === 'Escape') setEditing(false)
          }}
          className="h-5 w-20 rounded border border-input bg-background px-1.5 text-right font-mono text-[11px]"
          title="Project length in seconds. Enter to save, Esc to cancel."
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-mono tabular-nums text-[11px] text-foreground hover:text-sky-400 cursor-text"
          title="Click to edit project length"
        >
          {formatMs(durationMs)}
        </button>
      )}
    </div>
  )
}

function ProjectEndMarker({
  durationMs,
  pxPerSecond,
  top
}: {
  durationMs: number
  pxPerSecond: number
  top: number
}): JSX.Element {
  const setMeta = useStore((s) => s.setMeta)
  const meta = useStore((s) => s.meta)
  const x = LABEL_OFFSET + msToPx(durationMs, pxPerSecond)

  const startDrag = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!meta) return
    const container = (e.currentTarget as HTMLElement).closest(
      '.timeline-content'
    ) as HTMLDivElement | null
    if (!container) return

    const computeMs = (clientX: number): number => {
      const rect = container.getBoundingClientRect()
      const xInContainer = clientX - rect.left - LABEL_OFFSET
      const ms = pxToMs(xInContainer, pxPerSecond)
      return Math.max(1000, Math.min(MAX_PROJECT_LENGTH_SEC * 1000, ms))
    }

    const before = durationMs
    let latest = durationMs
    const move = (ev: PointerEvent): void => {
      latest = computeMs(ev.clientX)
      // Optimistic store update only — no IPC per move.
      const current = useStore.getState().meta
      if (current) setMeta({ ...current, duration_ms: latest })
    }
    const up = async (): Promise<void> => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        const updated = await window.api.project.updateMeta({ duration_ms: latest })
        setMeta(updated)
        if (latest !== before) {
          useStore.getState().pushHistory({
            description: 'change project length',
            undo: async () => {
              const reverted = await window.api.project.updateMeta({
                duration_ms: before
              })
              useStore.getState().setMeta(reverted)
            }
          })
        }
      } catch {
        /* ignore — store already reflects the optimistic value */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className="absolute z-10"
      style={{ left: x, top: 0, bottom: 0, width: 1, pointerEvents: 'none' }}
    >
      <div
        className="absolute left-0 w-px bg-red-500/60"
        style={{ top, bottom: 0 }}
      />
      {/* Wider invisible drag target along the line for easier grabbing */}
      <div
        className="absolute cursor-ew-resize hover:bg-red-500/20"
        style={{
          top,
          bottom: 0,
          left: -4,
          width: 9,
          pointerEvents: 'auto'
        }}
        onPointerDown={startDrag}
        title="Drag to adjust project length"
      />
      <button
        type="button"
        onPointerDown={startDrag}
        className="absolute -top-0.5 -translate-x-1/2 left-0 text-[9px] font-mono text-red-400 bg-card px-1 rounded-sm cursor-ew-resize hover:bg-red-500 hover:text-white select-none"
        style={{ pointerEvents: 'auto' }}
        title="Drag to adjust project length"
      >
        END
      </button>
    </div>
  )
}
