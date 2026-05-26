import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { useStore } from './store'
import { findValidStart } from './lib/timeline'
import type { Clip } from '@shared/types'
import { Topbar } from './components/Topbar'
import { StartScreen } from './components/StartScreen'
import { AssetLibrary } from './components/AssetLibrary/AssetLibrary'
import { Preview } from './components/Preview/Preview'
import { Timeline } from './components/Timeline/Timeline'
import { TimelineSplitter } from './components/Timeline/TimelineSplitter'
import { Inspector } from './components/Inspector/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { HelpDialog } from './components/HelpDialog'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { pxToMs } from './lib/geometry'

export function App(): JSX.Element {
  const meta = useStore((s) => s.meta)
  const loadAll = useStore((s) => s.loadAll)
  const createClip = useStore((s) => s.createClip)
  const updateClip = useStore((s) => s.updateClip)
  const pxPerSecond = useStore((s) => s.pxPerSecond)
  const tracks = useStore((s) => s.tracks)
  const assets = useStore((s) => s.assets)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const timelineHeight = useStore((s) => s.timelineHeight)
  const inspectorCollapsed = useStore((s) => s.inspectorCollapsed)
  const INSPECTOR_WIDTH = inspectorCollapsed ? 28 : 300

  useKeyboardShortcuts()

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Snapshot of the clip being dragged at the moment the drag starts, so we
  // can build an undo entry for its pre-drag position/track at drag end.
  const dragStartClipRef = useRef<Clip | null>(null)

  const handleDragStart = (e: DragStartEvent): void => {
    const data = e.active.data.current as
      | { type: 'asset'; assetId: number }
      | { type: 'clip'; clipId: number }
      | undefined
    if (data?.type === 'clip') {
      const c = useStore.getState().clips.find((x) => x.id === data.clipId)
      dragStartClipRef.current = c ?? null
    } else {
      dragStartClipRef.current = null
    }
  }

  const handleDragEnd = async (e: DragEndEvent): Promise<void> => {
    if (!e.over) return
    const overData = e.over.data.current as
      | { type: 'track'; trackId: number; rectLeft: number }
      | undefined
    const activeData = e.active.data.current as
      | { type: 'asset'; assetId: number }
      | { type: 'clip'; clipId: number }
      | undefined
    if (!overData || overData.type !== 'track' || !activeData) return

    if (activeData.type === 'asset') {
      const asset = assets.find((a) => a.id === activeData.assetId)
      const track = tracks.find((t) => t.id === overData.trackId)
      if (!asset || !track) return
      // For a new clip dropped from the library, place its start where the pointer is.
      const pointerX = (e.activatorEvent as PointerEvent).clientX + e.delta.x
      const relativeX = pointerX - overData.rectLeft
      const requestedStart = pxToMs(Math.max(0, relativeX), pxPerSecond)
      // Images have no intrinsic duration — default to 5s so the user can extend it.
      const defaultOut =
        asset.type === 'image' ? 5000 : asset.duration_ms || 5000

      // Snap to nearest non-overlapping slot. Reject if no slot fits.
      const validStart = findValidStart(useStore.getState().clips, {
        trackId: track.id,
        startMs: requestedStart,
        durationMs: defaultOut
      })
      if (validStart === null) return // no room

      const created = await createClip({
        track_id: track.id,
        asset_id: asset.id,
        start_ms: validStart,
        in_ms: 0,
        out_ms: defaultOut,
        fade_in_ms: 0,
        fade_out_ms: 0,
        z_index: 0
      })
      useStore.getState().pushHistory({
        description: 'add clip',
        undo: async () => {
          await window.api.clips.delete(created.id)
          useStore.setState((s) => ({
            clips: s.clips.filter((c) => c.id !== created.id),
            selectedClipId: s.selectedClipId === created.id ? null : s.selectedClipId
          }))
        }
      })
    } else if (activeData.type === 'clip') {
      // For an existing clip, translate by delta so the grab point stays under the cursor.
      const current = useStore.getState().clips.find((c) => c.id === activeData.clipId)
      if (!current) return
      const before = dragStartClipRef.current ?? current
      const deltaMs = Math.round((e.delta.x / pxPerSecond) * 1000)
      const requestedStart = Math.max(0, before.start_ms + deltaMs)
      const durationMs = current.out_ms - current.in_ms

      const validStart = findValidStart(useStore.getState().clips, {
        trackId: overData.trackId,
        startMs: requestedStart,
        durationMs,
        excludeClipId: current.id
      })
      if (validStart === null) return // no room — keep original position

      await updateClip(activeData.clipId, {
        start_ms: validStart,
        track_id: overData.trackId
      })

      // Only record history if something actually changed
      if (validStart !== before.start_ms || overData.trackId !== before.track_id) {
        const clipId = current.id
        const beforeStart = before.start_ms
        const beforeTrack = before.track_id
        useStore.getState().pushHistory({
          description: 'move clip',
          undo: async () => {
            await useStore
              .getState()
              .updateClip(clipId, { start_ms: beforeStart, track_id: beforeTrack })
          }
        })
      }
    }
    dragStartClipRef.current = null
  }

  if (!meta) {
    return <StartScreen />
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="h-full w-full bg-background text-foreground overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateRows: '40px minmax(0, 1fr)',
          minWidth: 0,
          minHeight: 0
        }}
      >
        <Topbar
          onExportClick={() => setExportOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
          onHelpClick={() => setHelpOpen(true)}
        />
        <div
          className="overflow-hidden border-t border-border"
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0, 1fr) ${INSPECTOR_WIDTH}px`,
            minWidth: 0,
            minHeight: 0
          }}
        >
          {/* Left column: assets + preview on top, splitter, timeline on bottom */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: `minmax(0, 1fr) 6px ${timelineHeight}px`,
              minWidth: 0,
              minHeight: 0
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '240px minmax(0, 1fr)',
                minWidth: 0,
                minHeight: 0
              }}
              className="overflow-hidden"
            >
              <AssetLibrary />
              <Preview />
            </div>
            <TimelineSplitter />
            <Timeline />
          </div>
          {/* Right column: full-height inspector (or collapsed strip) */}
          <Inspector />
        </div>
      </div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </DndContext>
  )
}
