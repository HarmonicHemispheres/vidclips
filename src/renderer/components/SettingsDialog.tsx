import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Button } from './ui/button'
import { useStore } from '../store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Preset {
  label: string
  width: number
  height: number
}

const PRESETS: Preset[] = [
  { label: '16:9 · 1920×1080 (FullHD)', width: 1920, height: 1080 },
  { label: '16:9 · 3840×2160 (4K)', width: 3840, height: 2160 },
  { label: '16:9 · 1280×720 (HD)', width: 1280, height: 720 },
  { label: '9:16 · 1080×1920 (Vertical / Reels)', width: 1080, height: 1920 },
  { label: '1:1 · 1080×1080 (Square)', width: 1080, height: 1080 },
  { label: '4:3 · 1440×1080', width: 1440, height: 1080 },
  { label: '21:9 · 2560×1080 (Ultrawide)', width: 2560, height: 1080 }
]

const FPS_OPTIONS = [24, 25, 30, 50, 60]

function presetKey(w: number, h: number): string {
  return `${w}x${h}`
}

export function SettingsDialog({ open, onOpenChange }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)
  const showFadeCurves = useStore((s) => s.showFadeCurves)
  const setShowFadeCurves = useStore((s) => s.setShowFadeCurves)

  const [name, setName] = useState('')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [fps, setFps] = useState(30)
  const [durationSec, setDurationSec] = useState(60)
  const [maxFadeSec, setMaxFadeSec] = useState(7)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !meta) return
    setName(meta.project_name)
    setWidth(meta.width)
    setHeight(meta.height)
    setFps(meta.fps)
    setDurationSec(Math.round((meta.duration_ms ?? 60000) / 1000))
    setMaxFadeSec(Math.round((meta.max_fade_ms ?? 7000) / 1000))
    setError(null)
  }, [open, meta])

  const matchedPreset = PRESETS.find((p) => p.width === width && p.height === height)
  const presetValue = matchedPreset ? presetKey(matchedPreset.width, matchedPreset.height) : 'custom'

  const onPresetChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value
    if (value === 'custom') return
    const found = PRESETS.find((p) => presetKey(p.width, p.height) === value)
    if (found) {
      setWidth(found.width)
      setHeight(found.height)
    }
  }

  const save = async (): Promise<void> => {
    setError(null)
    setSaving(true)
    try {
      const updated = await window.api.project.updateMeta({
        project_name: name.trim() || 'Untitled',
        width: Math.max(64, Math.floor(width)),
        height: Math.max(64, Math.floor(height)),
        fps: Math.max(1, Math.min(120, Math.floor(fps))),
        duration_ms: Math.max(1, Math.floor(durationSec)) * 1000,
        max_fade_ms: Math.max(0, Math.floor(maxFadeSec)) * 1000
      })
      setMeta(updated)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            Aspect ratio drives the preview and the exported MP4 dimensions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Project name">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Aspect ratio · resolution">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={presetValue}
              onChange={onPresetChange}
            >
              {PRESETS.map((p) => (
                <option key={presetKey(p.width, p.height)} value={presetKey(p.width, p.height)}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Width">
              <input
                type="number"
                min={64}
                step={2}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value, 10) || 0)}
              />
            </Field>
            <Field label="Height">
              <input
                type="number"
                min={64}
                step={2}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)}
              />
            </Field>
          </div>

          <Field label="Frame rate (fps)">
            <div className="flex flex-wrap gap-1">
              {FPS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFps(opt)}
                  className={`h-8 rounded-md border border-input px-3 text-xs ${
                    fps === opt ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Project length (seconds)">
              <input
                type="number"
                min={1}
                step={1}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                value={durationSec}
                onChange={(e) => setDurationSec(parseInt(e.target.value, 10) || 0)}
              />
            </Field>
            <Field label="Max fade duration (seconds)">
              <input
                type="number"
                min={0}
                step={1}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
                value={maxFadeSec}
                onChange={(e) => setMaxFadeSec(parseInt(e.target.value, 10) || 0)}
              />
            </Field>
          </div>

          <div className="pt-2 border-t border-border">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-sky-500"
                checked={showFadeCurves}
                onChange={(e) => setShowFadeCurves(e.target.checked)}
              />
              <div className="flex-1">
                <div className="text-sm">Show fade curves on timeline</div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Draws the fade-in and fade-out curve line on top of the blue gradient
                  in each timeline clip. The curve editor in the inspector is always
                  available regardless of this setting.
                </div>
              </div>
            </label>
          </div>

          {error && (
            <div className="rounded bg-destructive/20 border border-destructive p-3 text-xs">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
