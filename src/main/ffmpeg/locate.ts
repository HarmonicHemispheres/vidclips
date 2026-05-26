import { app } from 'electron'
import path from 'node:path'

/**
 * Resolves the ffmpeg and ffprobe binary paths.
 * In dev, ffmpeg-static / ffprobe-static export the path directly.
 * In packaged builds with asarUnpack, we rewrite from app.asar to app.asar.unpacked.
 */

function unpack(p: string): string {
  if (app.isPackaged) {
    return p.replace('app.asar', 'app.asar.unpacked')
  }
  return p
}

let _ffmpegPath: string | null = null
let _ffprobePath: string | null = null

export function ffmpegPath(): string {
  if (_ffmpegPath) return _ffmpegPath

  const raw = require('ffmpeg-static') as string | null
  if (!raw) throw new Error('ffmpeg-static did not export a path')
  _ffmpegPath = unpack(raw)
  return _ffmpegPath
}

export function ffprobePath(): string {
  if (_ffprobePath) return _ffprobePath

  const mod = require('ffprobe-static') as { path: string }
  if (!mod?.path) throw new Error('ffprobe-static did not export a path')
  _ffprobePath = unpack(mod.path)
  return _ffprobePath
}

export function resolveBinariesAtStartup(): void {
  ffmpegPath()
  ffprobePath()
}

export function _binariesDir(): string {
  return path.dirname(ffmpegPath())
}
