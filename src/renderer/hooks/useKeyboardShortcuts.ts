import { useEffect } from 'react'
import { useStore } from '../store'

export function useKeyboardShortcuts(): void {
  const togglePlay = useStore((s) => s.togglePlay)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      // Ctrl/Cmd+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        void useStore.getState().undo()
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
        return
      }

      if (e.code === 'Delete' || e.code === 'Backspace') {
        const state = useStore.getState()
        const id = state.selectedClipId
        if (id === null) return
        const snapshot = state.clips.find((c) => c.id === id)
        if (!snapshot) return
        e.preventDefault()
        void state.deleteClip(id)
        state.pushHistory({
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])
}
