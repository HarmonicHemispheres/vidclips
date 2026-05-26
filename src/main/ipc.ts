import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  closeProject,
  createProject,
  getProjectDir,
  isOpen,
  openProject,
  touchModified
} from './db/connection'
import { getMeta, updateMeta, type MetaPatch } from './db/repos/metaRepo'
import { deleteAsset, listAssets, getAsset } from './db/repos/assetsRepo'
import {
  createTrack,
  deleteTrack,
  listTracks,
  reorderTracks,
  updateTrack,
  type TrackPatch
} from './db/repos/tracksRepo'
import {
  createClip,
  deleteClip,
  listClips,
  updateClip
} from './db/repos/clipsRepo'
import { importFiles, linkFiles } from './assets/importer'
import { listRecent, pushRecent, removeRecent } from './recent'
import { cancelExport, startExport } from './export/pipeline'
import type { ClipPatch, ExportOptions, NewClipPayload, TrackKind } from '@shared/types'

function withWrite<T>(fn: () => T): T {
  const r = fn()
  touchModified()
  return r
}

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // ---- project ----
  ipcMain.handle('project:create', async (_e, dir: string, name: string) => {
    const res = createProject(dir, name)
    pushRecent({ path: dir, name, last_opened: Date.now() })
    return res
  })
  ipcMain.handle('project:open', async (_e, dirOrFile: string) => {
    const res = openProject(dirOrFile)
    const meta = getMeta()
    pushRecent({ path: res.dir, name: meta.project_name, last_opened: Date.now() })
    return res
  })
  ipcMain.handle('project:close', () => {
    closeProject()
  })
  ipcMain.handle('project:getMeta', () => {
    if (!isOpen()) return null
    return getMeta()
  })
  ipcMain.handle('project:updateMeta', (_e, patch: MetaPatch) =>
    withWrite(() => updateMeta(patch))
  )
  ipcMain.handle('project:isOpen', () => isOpen())
  ipcMain.handle('project:listRecent', () => listRecent())
  ipcMain.handle('project:removeRecent', (_e, p: string) => removeRecent(p))
  ipcMain.handle('project:revealInFolder', () => {
    if (isOpen()) shell.openPath(getProjectDir())
  })

  // ---- assets ----
  ipcMain.handle('assets:import', async (_e, filePaths: string[]) => {
    return withWrite(async () => importFiles(filePaths)) as Promise<unknown>
  })
  ipcMain.handle('assets:link', async (_e, filePaths: string[]) => {
    return withWrite(async () => linkFiles(filePaths)) as Promise<unknown>
  })
  ipcMain.handle('assets:list', () => listAssets())
  ipcMain.handle('assets:delete', (_e, id: number) => withWrite(() => deleteAsset(id)))
  ipcMain.handle('assets:getThumbUrl', (_e, relativePath: string) => {
    if (!isOpen()) return null
    const abs = path.join(getProjectDir(), relativePath)
    if (!fs.existsSync(abs)) return null
    const url = relativePath.split(path.sep).map(encodeURIComponent).join('/')
    return `vidclips://asset/${url}`
  })
  ipcMain.handle('assets:getMediaUrl', (_e, assetId: number) => {
    if (!isOpen()) return null
    const asset = getAsset(assetId)
    if (!asset) return null
    if (asset.linked) {
      // Linked assets: filename is the absolute source path.
      if (!fs.existsSync(asset.filename)) return null
      const encoded = asset.filename.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
      return `vidclips://ext/${encoded}`
    }
    const abs = path.join(getProjectDir(), 'assets', asset.filename)
    if (!fs.existsSync(abs)) return null
    return `vidclips://asset/assets/${encodeURIComponent(asset.filename)}`
  })

  // ---- tracks ----
  ipcMain.handle('tracks:list', () => listTracks())
  ipcMain.handle('tracks:create', (_e, kind: TrackKind, name: string) =>
    withWrite(() => createTrack(kind, name))
  )
  ipcMain.handle('tracks:reorder', (_e, ids: number[]) =>
    withWrite(() => reorderTracks(ids))
  )
  ipcMain.handle('tracks:update', (_e, id: number, patch: TrackPatch) =>
    withWrite(() => updateTrack(id, patch))
  )
  ipcMain.handle('tracks:delete', (_e, id: number) => withWrite(() => deleteTrack(id)))

  // ---- clips ----
  ipcMain.handle('clips:list', () => listClips())
  ipcMain.handle('clips:create', (_e, payload: NewClipPayload) =>
    withWrite(() => createClip(payload))
  )
  ipcMain.handle('clips:update', (_e, id: number, patch: ClipPatch) =>
    withWrite(() => updateClip(id, patch))
  )
  ipcMain.handle('clips:delete', (_e, id: number) => withWrite(() => deleteClip(id)))

  // ---- export ----
  ipcMain.handle(
    'export:start',
    async (_e, outPath: string, opts: ExportOptions) => {
      await startExport({
        outPath,
        opts,
        onProgress: (p) => {
          const w = getMainWindow()
          w?.webContents.send('export:progress', p)
        }
      })
      return { outPath }
    }
  )
  ipcMain.handle('export:cancel', () => cancelExport())

  // ---- dialog ----
  ipcMain.handle('dialog:pickProjectFolder', async (_e, mode: 'open' | 'create') => {
    const win = getMainWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      properties: mode === 'open' ? ['openDirectory'] : ['openDirectory', 'createDirectory'],
      title: mode === 'open' ? 'Open vidclips project folder' : 'Choose folder for new project'
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })
  ipcMain.handle('dialog:pickFiles', async (_e, filters: Electron.FileFilter[] | undefined) => {
    const win = getMainWindow()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: filters ?? [
        {
          name: 'Media',
          extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac']
        }
      ]
    })
    if (r.canceled) return null
    return r.filePaths
  })
  ipcMain.handle('dialog:pickSavePath', async (_e, defaultName?: string) => {
    const win = getMainWindow()
    if (!win) return null
    const r = await dialog.showSaveDialog(win, {
      title: 'Export video',
      defaultPath: defaultName ?? 'export.mp4',
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    })
    if (r.canceled || !r.filePath) return null
    return r.filePath
  })

  // ---- misc ----
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
