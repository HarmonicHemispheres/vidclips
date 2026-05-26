import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc'
import { closeProject, getProjectDir, isOpen } from './db/connection'
import { resolveBinariesAtStartup } from './ffmpeg/locate'

let mainWindow: BrowserWindow | null = null

// Must be called BEFORE app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vidclips',
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: false
    }
  }
])

function registerVidclipsProtocol(): void {
  protocol.handle('vidclips', async (req) => {
    try {
      const url = new URL(req.url)
      // URL shapes:
      //   vidclips://asset/<relative-path-under-project-dir>
      //   vidclips://ext/<encoded-absolute-path>   (linked assets)
      const host = url.hostname // 'asset' or 'ext'
      const rel = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!rel) return new Response('Empty path', { status: 400 })

      if (host === 'ext') {
        const abs = path.resolve(rel)
        return net.fetch(pathToFileURL(abs).toString())
      }

      // Default: asset under project dir
      if (!isOpen()) return new Response('No project open', { status: 404 })
      const projectDir = getProjectDir()
      const abs = path.resolve(projectDir, rel)
      const root = path.resolve(projectDir) + path.sep
      if (!abs.startsWith(root)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(abs).toString())
    } catch (err) {
      return new Response(`Error: ${(err as Error).message}`, { status: 500 })
    }
  })
}

function isDev(): boolean {
  return !app.isPackaged
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: 'vidclips',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev() && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.harmonichemispheres.vidclips')
  }

  try {
    resolveBinariesAtStartup()
  } catch (err) {
    console.error('Failed to resolve ffmpeg/ffprobe:', err)
  }

  registerVidclipsProtocol()
  registerIpc(() => mainWindow)
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  closeProject()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeProject()
})
