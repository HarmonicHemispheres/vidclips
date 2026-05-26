import { useStore } from '../../store'
import { FadeSliders } from './FadeSliders'
import { FadeCurveEditor } from './FadeCurveEditor'
import { Button } from '../ui/button'
import {
  Trash2,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { formatMs } from '../../lib/utils'
import type { Clip } from '@shared/types'

export function Inspector(): JSX.Element {
  const selectedId = useStore((s) => s.selectedClipId)
  const clip = useStore((s) => s.clips.find((c) => c.id === selectedId) ?? null)
  const asset = useStore((s) =>
    clip ? s.assets.find((a) => a.id === clip.asset_id) ?? null : null
  )
  const updateClip = useStore((s) => s.updateClip)
  const deleteClip = useStore((s) => s.deleteClip)
  const collapsed = useStore((s) => s.inspectorCollapsed)
  const toggleInspector = useStore((s) => s.toggleInspector)
  const detailsCollapsed = useStore((s) => s.inspectorDetailsCollapsed)
  const setDetailsCollapsed = useStore((s) => s.setInspectorDetailsCollapsed)
  const pushHistory = useStore((s) => s.pushHistory)

  if (collapsed) {
    return (
      <div className="flex flex-col bg-card border-l border-border h-full w-full overflow-hidden">
        <button
          onClick={toggleInspector}
          className="h-10 w-full flex items-center justify-center hover:bg-accent border-b border-border"
          title="Expand inspector"
        >
          <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div
            className="text-[10px] uppercase tracking-widest text-muted-foreground"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Inspector
          </div>
        </div>
      </div>
    )
  }

  const toggleMuted = (): void => {
    if (!clip) return
    const before = clip.muted
    const next = before ? 0 : 1
    void updateClip(clip.id, { muted: next })
    const clipId = clip.id
    pushHistory({
      description: next ? 'mute clip' : 'unmute clip',
      undo: async () => {
        await useStore.getState().updateClip(clipId, { muted: before })
      }
    })
  }
  const toggleHidden = (): void => {
    if (!clip) return
    const before = clip.hidden
    const next = before ? 0 : 1
    void updateClip(clip.id, { hidden: next })
    const clipId = clip.id
    pushHistory({
      description: next ? 'hide clip' : 'show clip',
      undo: async () => {
        await useStore.getState().updateClip(clipId, { hidden: before })
      }
    })
  }

  const handleDelete = (): void => {
    if (!clip) return
    const snapshot = { ...clip }
    void deleteClip(clip.id)
    pushHistory({
      description: 'delete clip',
      undo: async () => {
        const restored = await window.api.clips.create({
          track_id: snapshot.track_id,
          asset_id: snapshot.asset_id,
          start_ms: snapshot.start_ms,
          in_ms: snapshot.in_ms,
          out_ms: snapshot.out_ms,
          fade_in_ms: snapshot.fade_in_ms,
          fade_out_ms: snapshot.fade_out_ms,
          fade_curve_in: snapshot.fade_curve_in,
          fade_curve_out: snapshot.fade_curve_out,
          z_index: snapshot.z_index,
          muted: snapshot.muted,
          hidden: snapshot.hidden,
          transform_x: snapshot.transform_x,
          transform_y: snapshot.transform_y,
          transform_scale: snapshot.transform_scale,
          transform_rotation: snapshot.transform_rotation
        })
        useStore.setState((s) => ({ clips: [...s.clips, restored] }))
      }
    })
  }

  // Tracks are type-agnostic: visibility of the toggles depends purely on
  // what the asset can produce.
  const canHaveVideo = asset?.type === 'video' || asset?.type === 'image'
  const canHaveAudio = asset?.type === 'audio' || asset?.type === 'video'

  return (
    <div className="flex flex-col bg-card border-l border-border overflow-hidden min-w-0 min-h-0 h-full w-full">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Inspector
        </span>
        <button
          onClick={toggleInspector}
          className="rounded p-1 hover:bg-accent text-muted-foreground"
          title="Collapse inspector"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!clip ? (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Select a clip on the timeline to edit it.
          </p>
        ) : (
          <>
            <div>
              <button
                type="button"
                className="flex items-center gap-1 w-full text-left text-xs uppercase tracking-wide text-muted-foreground mb-1 hover:text-foreground"
                onClick={() => setDetailsCollapsed(!detailsCollapsed)}
              >
                {detailsCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span>Clip details</span>
              </button>
              {!detailsCollapsed && (
                <div className="space-y-2">
                  <div>
                    <div className="text-sm truncate">
                      {asset?.filename ?? '(missing asset)'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {asset?.type.toUpperCase()}
                    </div>
                  </div>
                  <DetailRow label="Start" value={formatMs(clip.start_ms)} />
                  <DetailRow label="Duration" value={formatMs(clip.out_ms - clip.in_ms)} />
                  <DetailRow label="Trim in" value={formatMs(clip.in_ms)} />
                  <DetailRow
                    label="Trim out"
                    value={asset ? formatMs(asset.duration_ms - clip.out_ms) : '—'}
                  />
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-border">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Visibility
              </div>
              <div className="flex gap-2">
                {canHaveVideo && (
                  <Button
                    variant={clip.hidden ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={toggleHidden}
                    title={clip.hidden ? 'Show video' : 'Hide video'}
                  >
                    {clip.hidden ? (
                      <EyeOff className="h-4 w-4 mr-1.5" />
                    ) : (
                      <Eye className="h-4 w-4 mr-1.5" />
                    )}
                    {clip.hidden ? 'Hidden' : 'Visible'}
                  </Button>
                )}
                {canHaveAudio && (
                  <Button
                    variant={clip.muted ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={toggleMuted}
                    title={clip.muted ? 'Unmute' : 'Mute'}
                  >
                    {clip.muted ? (
                      <VolumeX className="h-4 w-4 mr-1.5" />
                    ) : (
                      <Volume2 className="h-4 w-4 mr-1.5" />
                    )}
                    {clip.muted ? 'Muted' : 'Audible'}
                  </Button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <FadeSliders clip={clip} />
              <FadeCurveSection clip={clip} />
            </div>

            <div className="pt-4">
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete clip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FadeCurveSection({ clip }: { clip: Clip }): JSX.Element {
  const updateClip = useStore((s) => s.updateClip)

  // During drag (commit=false): patch store optimistically only — no IPC per move.
  // On release (commit=true): write the final value to the DB once.
  const handleChange = (
    field: 'fade_curve_in' | 'fade_curve_out',
    v: number,
    commit?: boolean
  ): void => {
    if (commit) {
      void updateClip(clip.id, { [field]: v })
    } else {
      useStore.setState((s) => ({
        clips: s.clips.map((c) => (c.id === clip.id ? { ...c, [field]: v } : c))
      }))
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-border space-y-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Fade curves
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Fade-in shape</div>
        <FadeCurveEditor
          curve={clip.fade_curve_in}
          disabled={clip.fade_in_ms === 0}
          onChange={(v, commit) => handleChange('fade_curve_in', v, commit)}
        />
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Fade-out shape</div>
        <FadeCurveEditor
          curve={clip.fade_curve_out}
          isOut
          disabled={clip.fade_out_ms === 0}
          onChange={(v, commit) => handleChange('fade_curve_out', v, commit)}
        />
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">
        Drag the dot to change how the fade ramps. Up = slower start, down = faster start.
      </p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}
