import { useCallback, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useShallow } from 'zustand/shallow'
import type { Track as TrackType, Clip as ClipType } from '@shared/types'
import { useStore } from '../../store'
import { LABEL_OFFSET } from '../../lib/geometry'
import { Clip } from './Clip'
import { TrackLabel } from './TrackLabel'

interface Props {
  track: TrackType
  top: number
  height: number
}

export function Track({ track, top, height }: Props): JSX.Element {
  const innerRef = useRef<HTMLDivElement | null>(null)

  const clips = useStore(
    useShallow((s): ClipType[] => s.clips.filter((c) => c.track_id === track.id))
  )

  const droppableData = useMemo(
    () => ({
      type: 'track' as const,
      trackId: track.id,
      get rectLeft(): number {
        return innerRef.current?.getBoundingClientRect().left ?? 0
      }
    }),
    [track.id]
  )

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: droppableData
  })

  const setRefs = useCallback(
    (node: HTMLDivElement | null): void => {
      innerRef.current = node
      setNodeRef(node)
    },
    [setNodeRef]
  )

  return (
    <div
      className={`absolute left-0 right-0 border-b border-border ${
        track.kind === 'audio' ? 'bg-zinc-900/40' : 'bg-zinc-900/20'
      }`}
      style={{ top, height }}
    >
      <TrackLabel track={track} width={LABEL_OFFSET} />
      <div
        ref={setRefs}
        className={`absolute right-0 top-0 bottom-0 ${isOver ? 'bg-sky-900/30' : ''}`}
        style={{ left: LABEL_OFFSET }}
      >
        {clips.map((clip) => (
          <Clip key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  )
}
