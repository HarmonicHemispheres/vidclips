import { useRef } from 'react'
import { useStore } from '../../store'

export function TimelineSplitter(): JSX.Element {
  const timelineHeight = useStore((s) => s.timelineHeight)
  const setTimelineHeight = useStore((s) => s.setTimelineHeight)
  const draggingRef = useRef(false)

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    draggingRef.current = true
    const startY = e.clientY
    const startHeight = timelineHeight
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent): void => {
      if (!draggingRef.current) return
      // Drag UP grows the timeline; drag DOWN shrinks it.
      const next = startHeight - (ev.clientY - startY)
      const maxH = Math.floor(window.innerHeight * 0.7)
      setTimelineHeight(Math.max(120, Math.min(maxH, next)))
    }
    const onUp = (): void => {
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className="group h-1.5 bg-border hover:bg-sky-500 transition-colors cursor-row-resize flex items-center justify-center"
      onPointerDown={onPointerDown}
      title="Drag to resize timeline"
    >
      <div className="h-0.5 w-8 bg-zinc-600 group-hover:bg-sky-300 rounded" />
    </div>
  )
}
