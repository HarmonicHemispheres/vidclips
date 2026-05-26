import { useEffect, useRef, useState } from 'react'
import type { Clip } from '@shared/types'
import { Slider } from '../ui/slider'
import { useStore } from '../../store'
import { formatMs } from '../../lib/utils'

const HARD_MAX_MS = 100_000 // 100s ceiling for double-click override

interface Props {
  clip: Clip
}

export function FadeSliders({ clip }: Props): JSX.Element {
  const updateClip = useStore((s) => s.updateClip)
  const maxFadeMs = useStore((s) => s.meta?.max_fade_ms ?? 7000)
  // Slider max follows the settings value directly. The override path still
  // lets users dial in any value up to HARD_MAX_MS via double-click.
  const sliderMax = Math.max(0, maxFadeMs)

  const [fadeIn, setFadeIn] = useState(clip.fade_in_ms)
  const [fadeOut, setFadeOut] = useState(clip.fade_out_ms)
  const persistTimer = useRef<number | null>(null)

  useEffect(() => {
    setFadeIn(clip.fade_in_ms)
    setFadeOut(clip.fade_out_ms)
  }, [clip.id, clip.fade_in_ms, clip.fade_out_ms])

  const schedulePersist = (next: { fade_in_ms?: number; fade_out_ms?: number }): void => {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      void updateClip(clip.id, next, { optimistic: false })
    }, 150)
  }

  const clampValue = (ms: number): number =>
    Math.max(0, Math.min(HARD_MAX_MS, Math.round(ms)))

  const onChangeIn = (v: number[]): void => {
    const next = clampValue(v[0])
    setFadeIn(next)
    void updateClip(clip.id, { fade_in_ms: next }, { optimistic: true })
    schedulePersist({ fade_in_ms: next })
  }
  const onChangeOut = (v: number[]): void => {
    const next = clampValue(v[0])
    setFadeOut(next)
    void updateClip(clip.id, { fade_out_ms: next }, { optimistic: true })
    schedulePersist({ fade_out_ms: next })
  }

  const commitOverride = (kind: 'in' | 'out', secondsStr: string): void => {
    const secs = parseFloat(secondsStr)
    if (!isFinite(secs)) return
    const ms = clampValue(secs * 1000)
    if (kind === 'in') {
      setFadeIn(ms)
      void updateClip(clip.id, { fade_in_ms: ms })
    } else {
      setFadeOut(ms)
      void updateClip(clip.id, { fade_out_ms: ms })
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Fades</div>

      <FadeRow
        label="Fade in"
        valueMs={fadeIn}
        max={sliderMax}
        onSliderChange={onChangeIn}
        onOverrideCommit={(s) => commitOverride('in', s)}
      />

      <FadeRow
        label="Fade out"
        valueMs={fadeOut}
        max={sliderMax}
        onSliderChange={onChangeOut}
        onOverrideCommit={(s) => commitOverride('out', s)}
      />

      <p className="text-[11px] text-muted-foreground">
        Slider max follows your project setting · double-click the value to type a custom
        duration (up to 100s).
      </p>
    </div>
  )
}

interface FadeRowProps {
  label: string
  valueMs: number
  max: number
  onSliderChange: (v: number[]) => void
  onOverrideCommit: (secondsStr: string) => void
}

function FadeRow({
  label,
  valueMs,
  max,
  onSliderChange,
  onOverrideCommit
}: FadeRowProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft((valueMs / 1000).toFixed(2))
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, valueMs])

  const finish = (commit: boolean): void => {
    if (commit) onOverrideCommit(draft)
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <label className="text-sm">{label}</label>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            step="0.05"
            min={0}
            max={100}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish(true)
              else if (e.key === 'Escape') finish(false)
            }}
            className="h-6 w-24 rounded border border-input bg-background px-2 text-right font-mono text-xs"
            title="Custom override (max 100s). Enter to commit, Esc to cancel."
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditing(true)}
            className="font-mono tabular-nums text-xs text-muted-foreground hover:text-foreground cursor-text"
            title="Double-click to override (up to 100s)"
          >
            {formatMs(valueMs)}
          </button>
        )}
      </div>
      <Slider
        value={[Math.min(valueMs, max)]}
        min={0}
        max={Math.max(0, max)}
        step={50}
        onValueChange={onSliderChange}
      />
    </div>
  )
}
