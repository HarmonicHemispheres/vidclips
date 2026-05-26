import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import type { AssetType, Track as TrackType } from '@shared/types'
import { useStore } from '../../store'
import { Film, Music, Image as ImageIcon } from 'lucide-react'

interface Props {
  track: TrackType
  width: number
}

const TYPE_ICONS: Record<AssetType, typeof Film> = {
  video: Film,
  image: ImageIcon,
  audio: Music
}

export function TrackLabel({ track, width }: Props): JSX.Element {
  const updateTrack = useStore((s) => s.updateTrack)

  // Find unique asset types currently used by clips on this track.
  const typesOnTrack = useStore(
    useShallow((s) => {
      const assetById = new Map(s.assets.map((a) => [a.id, a]))
      const types = new Set<AssetType>()
      for (const c of s.clips) {
        if (c.track_id !== track.id) continue
        const a = assetById.get(c.asset_id)
        if (a) types.add(a.type)
      }
      return [...types]
    })
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(track.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(track.name)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, track.name])

  const finish = (commit: boolean): void => {
    if (commit) {
      const next = draft.trim() || track.name
      if (next !== track.name) void updateTrack(track.id, { name: next })
    }
    setEditing(false)
  }

  return (
    <div
      className="absolute left-0 top-0 bottom-0 border-r border-border bg-card flex flex-col justify-center px-2 gap-1 select-none"
      style={{ width }}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true)
            else if (e.key === 'Escape') finish(false)
          }}
          className="h-5 w-full rounded border border-input bg-background px-1 text-[11px] font-medium"
        />
      ) : (
        <div className="text-[11px] uppercase tracking-wide text-foreground truncate">
          {track.name}
        </div>
      )}
      <div className="flex items-center gap-1 text-muted-foreground">
        {typesOnTrack.length === 0 ? (
          <span className="text-[9px] uppercase opacity-60">{track.kind}</span>
        ) : (
          typesOnTrack.map((t) => {
            const Icon = TYPE_ICONS[t]
            return <Icon key={t} className="h-3 w-3" />
          })
        )}
      </div>
    </div>
  )
}
