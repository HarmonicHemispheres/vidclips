import { create } from 'zustand'
import type {
  Asset,
  Clip,
  ClipPatch,
  NewClipPayload,
  ProjectMeta,
  Track
} from '@shared/types'

export interface VidclipsState {
  // project
  meta: ProjectMeta | null
  // entities
  assets: Asset[]
  tracks: Track[]
  clips: Clip[]
  // selection
  selectedClipId: number | null
  // playback
  isPlaying: boolean
  currentTimeMs: number
  pxPerSecond: number

  // UI prefs (persisted to localStorage)
  showFadeCurves: boolean
  timelineHeight: number
  inspectorCollapsed: boolean
  inspectorDetailsCollapsed: boolean
  previewMode: 'preview' | 'editor'

  // Transient session state
  toolMode: 'select' | 'cut'
  editorZoom: number

  // Undo history (transient, max 50)
  history: HistoryEntry[]

  // project actions
  setMeta: (meta: ProjectMeta | null) => void
  loadAll: () => Promise<void>

  // assets
  importAssetsViaDialog: () => Promise<void>
  linkAssetsViaDialog: () => Promise<void>
  refreshAssets: () => Promise<void>

  // tracks
  refreshTracks: () => Promise<void>
  updateTrack: (id: number, patch: { name?: string }) => Promise<void>
  addTrack: () => Promise<void>
  deleteTrack: (id: number) => Promise<void>

  // clips
  refreshClips: () => Promise<void>
  createClip: (payload: NewClipPayload) => Promise<Clip>
  updateClip: (id: number, patch: ClipPatch, opts?: { optimistic?: boolean }) => Promise<void>
  deleteClip: (id: number) => Promise<void>
  splitClip: (id: number, atTimelineMs: number) => Promise<void>

  // selection
  selectClip: (id: number | null) => void

  // playback
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (ms: number) => void
  setPxPerSecond: (px: number) => void

  // UI prefs
  setShowFadeCurves: (v: boolean) => void
  setTimelineHeight: (px: number) => void
  setInspectorCollapsed: (v: boolean) => void
  toggleInspector: () => void
  setInspectorDetailsCollapsed: (v: boolean) => void
  setPreviewMode: (m: 'preview' | 'editor') => void
  setToolMode: (m: 'select' | 'cut') => void
  setEditorZoom: (z: number) => void

  // Undo
  pushHistory: (entry: HistoryEntry) => void
  undo: () => Promise<void>
  clearHistory: () => void
}

export interface HistoryEntry {
  description: string
  undo: () => Promise<void>
}

const HISTORY_LIMIT = 50

/** Set true while running an undo to suppress history recording from nested calls. */
let suppressHistory = false
export function isHistorySuppressed(): boolean {
  return suppressHistory
}

const PREFS_KEY = 'vidclips:prefs:v1'

interface PersistedPrefs {
  showFadeCurves?: boolean
  timelineHeight?: number
  inspectorCollapsed?: boolean
  inspectorDetailsCollapsed?: boolean
  previewMode?: 'preview' | 'editor'
}

function loadPrefs(): PersistedPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as PersistedPrefs) : {}
  } catch {
    return {}
  }
}

function savePrefs(prefs: PersistedPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

const initialPrefs = loadPrefs()

export const useStore = create<VidclipsState>((set, get) => ({
  meta: null,
  assets: [],
  tracks: [],
  clips: [],
  selectedClipId: null,
  isPlaying: false,
  currentTimeMs: 0,
  pxPerSecond: 100,

  showFadeCurves: initialPrefs.showFadeCurves ?? false,
  timelineHeight: Math.max(120, Math.min(800, initialPrefs.timelineHeight ?? 240)),
  inspectorCollapsed: initialPrefs.inspectorCollapsed ?? false,
  inspectorDetailsCollapsed: initialPrefs.inspectorDetailsCollapsed ?? false,
  previewMode: initialPrefs.previewMode ?? 'preview',
  toolMode: 'select',
  editorZoom: 1,
  history: [],

  setMeta: (meta) => set({ meta }),

  loadAll: async () => {
    const meta = await window.api.project.getMeta()
    if (!meta) {
      set({ meta: null, assets: [], tracks: [], clips: [], history: [] })
      return
    }
    const [assets, tracks, clips] = await Promise.all([
      window.api.assets.list(),
      window.api.tracks.list(),
      window.api.clips.list()
    ])
    set({ meta, assets, tracks, clips, history: [] })
  },

  refreshAssets: async () => {
    const assets = await window.api.assets.list()
    set({ assets })
  },

  refreshTracks: async () => {
    const tracks = await window.api.tracks.list()
    set({ tracks })
  },

  updateTrack: async (id, patch) => {
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    }))
    const updated = await window.api.tracks.update(id, patch)
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? updated : t)) }))
  },

  addTrack: async () => {
    const current = get().tracks
    const nextIndex = current.length + 1
    const name = `L${nextIndex}`
    const created = await window.api.tracks.create('video', name)
    set((s) => ({ tracks: [...s.tracks, created] }))
  },

  deleteTrack: async (id) => {
    await window.api.tracks.delete(id)
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.track_id !== id)
    }))
  },

  refreshClips: async () => {
    const clips = await window.api.clips.list()
    set({ clips })
  },

  importAssetsViaDialog: async () => {
    const files = await window.api.dialog.pickFiles()
    if (!files || files.length === 0) return
    await window.api.assets.import(files)
    await get().refreshAssets()
  },

  linkAssetsViaDialog: async () => {
    const files = await window.api.dialog.pickFiles()
    if (!files || files.length === 0) return
    await window.api.assets.link(files)
    await get().refreshAssets()
  },

  createClip: async (payload) => {
    const clip = await window.api.clips.create(payload)
    set((s) => ({ clips: [...s.clips, clip] }))
    return clip
  },

  updateClip: async (id, patch, opts) => {
    if (opts?.optimistic !== false) {
      set((s) => ({
        clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }))
    }
    const updated = await window.api.clips.update(id, patch)
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? updated : c)) }))
  },

  deleteClip: async (id) => {
    await window.api.clips.delete(id)
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      selectedClipId: s.selectedClipId === id ? null : s.selectedClipId
    }))
  },

  splitClip: async (id, atTimelineMs) => {
    const original = get().clips.find((c) => c.id === id)
    if (!original) return
    const clipEnd = original.start_ms + (original.out_ms - original.in_ms)
    if (atTimelineMs <= original.start_ms || atTimelineMs >= clipEnd) return
    const cutInMs = original.in_ms + (atTimelineMs - original.start_ms)

    // Shrink the left half: keeps fade_in, drops fade_out (now mid-clip)
    await window.api.clips.update(id, {
      out_ms: cutInMs,
      fade_out_ms: 0
    })
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === id ? { ...c, out_ms: cutInMs, fade_out_ms: 0 } : c
      )
    }))

    // Create the right half: inherits transforms, mute/hide, original fade_out,
    // but no fade_in (now mid-clip)
    const right = await window.api.clips.create({
      track_id: original.track_id,
      asset_id: original.asset_id,
      start_ms: atTimelineMs,
      in_ms: cutInMs,
      out_ms: original.out_ms,
      fade_in_ms: 0,
      fade_out_ms: original.fade_out_ms,
      fade_curve_in: 0,
      fade_curve_out: original.fade_curve_out,
      z_index: original.z_index,
      muted: original.muted,
      hidden: original.hidden,
      transform_x: original.transform_x,
      transform_y: original.transform_y,
      transform_scale: original.transform_scale,
      transform_rotation: original.transform_rotation
    })
    set((s) => ({ clips: [...s.clips, right] }))

    // Record undo: delete right half, restore left's out_ms + fade_out
    if (!suppressHistory) {
      const leftId = id
      const rightId = right.id
      const leftOriginalOut = original.out_ms
      const leftOriginalFadeOut = original.fade_out_ms
      const leftOriginalFadeCurveOut = original.fade_curve_out
      get().pushHistory({
        description: 'split clip',
        undo: async () => {
          await window.api.clips.delete(rightId)
          useStore.setState((s) => ({
            clips: s.clips.filter((c) => c.id !== rightId),
            selectedClipId:
              s.selectedClipId === rightId ? null : s.selectedClipId
          }))
          await useStore.getState().updateClip(leftId, {
            out_ms: leftOriginalOut,
            fade_out_ms: leftOriginalFadeOut,
            fade_curve_out: leftOriginalFadeCurveOut
          })
        }
      })
    }
  },

  selectClip: (id) => set({ selectedClipId: id }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  seek: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setPxPerSecond: (px) => set({ pxPerSecond: Math.max(10, Math.min(400, px)) }),

  setShowFadeCurves: (v) => {
    set({ showFadeCurves: v })
    persistFromState()
  },
  setTimelineHeight: (px) => {
    const clamped = Math.max(120, Math.min(800, px))
    set({ timelineHeight: clamped })
    persistFromState()
  },
  setInspectorCollapsed: (v) => {
    set({ inspectorCollapsed: v })
    persistFromState()
  },
  toggleInspector: () => {
    set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed }))
    persistFromState()
  },
  setInspectorDetailsCollapsed: (v) => {
    set({ inspectorDetailsCollapsed: v })
    persistFromState()
  },
  setPreviewMode: (m) => {
    set({ previewMode: m })
    if (m === 'editor') set({ isPlaying: false })
    persistFromState()
  },
  setToolMode: (m) => set({ toolMode: m }),
  setEditorZoom: (z) => set({ editorZoom: Math.max(0.1, Math.min(8, z)) }),

  pushHistory: (entry) => {
    if (suppressHistory) return
    set((s) => ({
      history: [...s.history, entry].slice(-HISTORY_LIMIT)
    }))
  },

  undo: async () => {
    const entry = get().history[get().history.length - 1]
    if (!entry) return
    suppressHistory = true
    try {
      await entry.undo()
    } catch (err) {
      console.error('Undo failed:', err)
    } finally {
      suppressHistory = false
    }
    set((s) => ({ history: s.history.slice(0, -1) }))
  },

  clearHistory: () => set({ history: [] })
}))

function persistFromState(): void {
  const s = useStore.getState()
  savePrefs({
    showFadeCurves: s.showFadeCurves,
    timelineHeight: s.timelineHeight,
    inspectorCollapsed: s.inspectorCollapsed,
    inspectorDetailsCollapsed: s.inspectorDetailsCollapsed,
    previewMode: s.previewMode
  })
}

export function getContentEndMs(state: VidclipsState): number {
  return state.clips.reduce((max, c) => {
    return Math.max(max, c.start_ms + (c.out_ms - c.in_ms))
  }, 0)
}

/**
 * The "end of the timeline" for playback and display purposes — the larger of
 * (a) where the last clip ends and (b) the project's set length. This lets
 * playback continue past the last clip into the explicitly-set project end.
 */
export function getTimelineDurationMs(state: VidclipsState): number {
  const contentEnd = getContentEndMs(state)
  const projectEnd = state.meta?.duration_ms ?? 0
  return Math.max(contentEnd, projectEnd)
}
