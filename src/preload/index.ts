import { contextBridge, ipcRenderer } from 'electron'
import type {
  Asset,
  Clip,
  ClipPatch,
  ExportOptions,
  ExportProgress,
  ImportedAssetResult,
  NewClipPayload,
  ProjectMeta,
  RecentProject,
  Track,
  TrackKind
} from '../shared/types'

const api = {
  project: {
    create: (dir: string, name: string): Promise<{ dir: string; created: boolean }> =>
      ipcRenderer.invoke('project:create', dir, name),
    open: (dirOrFile: string): Promise<{ dir: string; created: boolean }> =>
      ipcRenderer.invoke('project:open', dirOrFile),
    close: (): Promise<void> => ipcRenderer.invoke('project:close'),
    getMeta: (): Promise<ProjectMeta | null> => ipcRenderer.invoke('project:getMeta'),
    updateMeta: (patch: {
      project_name?: string
      width?: number
      height?: number
      fps?: number
      duration_ms?: number
      max_fade_ms?: number
    }): Promise<ProjectMeta> => ipcRenderer.invoke('project:updateMeta', patch),
    isOpen: (): Promise<boolean> => ipcRenderer.invoke('project:isOpen'),
    listRecent: (): Promise<RecentProject[]> => ipcRenderer.invoke('project:listRecent'),
    removeRecent: (path: string): Promise<void> =>
      ipcRenderer.invoke('project:removeRecent', path),
    revealInFolder: (): Promise<void> => ipcRenderer.invoke('project:revealInFolder')
  },
  assets: {
    import: (filePaths: string[]): Promise<ImportedAssetResult[]> =>
      ipcRenderer.invoke('assets:import', filePaths),
    link: (filePaths: string[]): Promise<ImportedAssetResult[]> =>
      ipcRenderer.invoke('assets:link', filePaths),
    list: (): Promise<Asset[]> => ipcRenderer.invoke('assets:list'),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('assets:delete', id),
    getThumbUrl: (relativePath: string): Promise<string | null> =>
      ipcRenderer.invoke('assets:getThumbUrl', relativePath),
    getMediaUrl: (assetId: number): Promise<string | null> =>
      ipcRenderer.invoke('assets:getMediaUrl', assetId)
  },
  tracks: {
    list: (): Promise<Track[]> => ipcRenderer.invoke('tracks:list'),
    create: (kind: TrackKind, name: string): Promise<Track> =>
      ipcRenderer.invoke('tracks:create', kind, name),
    reorder: (ids: number[]): Promise<void> => ipcRenderer.invoke('tracks:reorder', ids),
    update: (id: number, patch: { name?: string; order_index?: number }): Promise<Track> =>
      ipcRenderer.invoke('tracks:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('tracks:delete', id)
  },
  clips: {
    list: (): Promise<Clip[]> => ipcRenderer.invoke('clips:list'),
    create: (payload: NewClipPayload): Promise<Clip> =>
      ipcRenderer.invoke('clips:create', payload),
    update: (id: number, patch: ClipPatch): Promise<Clip> =>
      ipcRenderer.invoke('clips:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('clips:delete', id)
  },
  export: {
    start: (outPath: string, opts: ExportOptions): Promise<{ outPath: string }> =>
      ipcRenderer.invoke('export:start', outPath, opts),
    cancel: (): Promise<void> => ipcRenderer.invoke('export:cancel'),
    onProgress: (cb: (p: ExportProgress) => void): (() => void) => {
      const handler = (_e: unknown, p: ExportProgress): void => cb(p)
      ipcRenderer.on('export:progress', handler)
      return () => ipcRenderer.off('export:progress', handler)
    }
  },
  dialog: {
    pickProjectFolder: (mode: 'open' | 'create'): Promise<string | null> =>
      ipcRenderer.invoke('dialog:pickProjectFolder', mode),
    pickFiles: (filters?: Electron.FileFilter[]): Promise<string[] | null> =>
      ipcRenderer.invoke('dialog:pickFiles', filters),
    pickSavePath: (defaultName?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:pickSavePath', defaultName)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion')
  }
}

export type VidclipsApi = typeof api

contextBridge.exposeInMainWorld('api', api)
