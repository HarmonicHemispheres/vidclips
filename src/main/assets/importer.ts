import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { assetsDir, thumbsDir } from '../db/connection'
import { insertAsset } from '../db/repos/assetsRepo'
import { ffmpegPath } from '../ffmpeg/locate'
import { probe } from './ffprobe'
import type { Asset, AssetType, ImportedAssetResult } from '@shared/types'

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'])

function classify(file: string): AssetType | null {
  const ext = path.extname(file).toLowerCase()
  if (VIDEO_EXT.has(ext)) return 'video'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext)) return 'audio'
  return null
}

function uniqueFilename(dir: string, original: string): string {
  const ext = path.extname(original)
  const base = path.basename(original, ext)
  let candidate = `${base}${ext}`
  let i = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}_${i}${ext}`
    i++
  }
  return candidate
}

function generateThumbnail(
  sourcePath: string,
  type: AssetType,
  durationMs: number,
  destPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let args: string[]

    if (type === 'image') {
      args = ['-y', '-i', sourcePath, '-vf', 'scale=160:-2', '-frames:v', '1', destPath]
    } else if (type === 'video') {
      const seekSec = Math.max(0.1, (durationMs / 1000) * 0.1)
      args = [
        '-y',
        '-ss', String(seekSec),
        '-i', sourcePath,
        '-frames:v', '1',
        '-vf', 'scale=160:-2',
        destPath
      ]
    } else {
      // audio — generate a simple waveform png
      args = [
        '-y',
        '-i', sourcePath,
        '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=160x90:colors=#9ca3af',
        '-frames:v', '1',
        destPath
      ]
    }

    const proc = spawn(ffmpegPath(), args)
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg thumbnail exited ${code}: ${stderr}`))
    })
  })
}

export async function importFiles(filePaths: string[]): Promise<ImportedAssetResult[]> {
  const results: ImportedAssetResult[] = []
  const dest = assetsDir()
  const tdest = thumbsDir()

  for (const src of filePaths) {
    const warnings: string[] = []
    const type = classify(src)
    if (!type) {
      warnings.push(`Skipped unsupported file type: ${path.basename(src)}`)
      continue
    }

    const filename = uniqueFilename(dest, path.basename(src))
    const destPath = path.join(dest, filename)
    fs.copyFileSync(src, destPath)

    let probed: import('./ffprobe').ProbeResult = {
      duration_ms: 0,
      width: null,
      height: null,
      sample_rate: null,
      has_video: false,
      has_audio: false
    }
    try {
      probed = await probe(destPath)
    } catch (err) {
      warnings.push(`Probe failed for ${filename}: ${(err as Error).message}`)
    }

    const thumbName = `${path.basename(filename, path.extname(filename))}_${Date.now()}.jpg`
    const thumbDest = path.join(tdest, thumbName)
    let thumbnail_path: string | null = null
    try {
      await generateThumbnail(destPath, type, probed.duration_ms, thumbDest)
      thumbnail_path = path.join('assets', '.thumbs', thumbName)
    } catch (err) {
      warnings.push(`Thumbnail failed for ${filename}: ${(err as Error).message}`)
    }

    const asset: Asset = insertAsset({
      filename,
      type,
      duration_ms: probed.duration_ms,
      original_path: src,
      thumbnail_path,
      width: probed.width,
      height: probed.height,
      sample_rate: probed.sample_rate,
      linked: 0
    })

    results.push({ asset, warnings })
  }

  return results
}

/**
 * Links files without copying them into the project. The asset's filename
 * stores the absolute source path. If the source file is later moved or
 * deleted, the asset will fail to load.
 */
export async function linkFiles(filePaths: string[]): Promise<ImportedAssetResult[]> {
  const results: ImportedAssetResult[] = []
  const tdest = thumbsDir()

  for (const src of filePaths) {
    const warnings: string[] = []
    const type = classify(src)
    if (!type) {
      warnings.push(`Skipped unsupported file type: ${path.basename(src)}`)
      continue
    }
    if (!fs.existsSync(src)) {
      warnings.push(`Source file not found: ${src}`)
      continue
    }

    let probed: import('./ffprobe').ProbeResult = {
      duration_ms: 0,
      width: null,
      height: null,
      sample_rate: null,
      has_video: false,
      has_audio: false
    }
    try {
      probed = await probe(src)
    } catch (err) {
      warnings.push(`Probe failed: ${(err as Error).message}`)
    }

    // Thumbnails still go into the project so reopens are fast.
    const safeName = path.basename(src).replace(/[^A-Za-z0-9._-]/g, '_')
    const thumbName = `linked_${safeName}_${Date.now()}.jpg`
    const thumbDest = path.join(tdest, thumbName)
    let thumbnail_path: string | null = null
    try {
      await generateThumbnail(src, type, probed.duration_ms, thumbDest)
      thumbnail_path = path.join('assets', '.thumbs', thumbName)
    } catch (err) {
      warnings.push(`Thumbnail failed: ${(err as Error).message}`)
    }

    const asset: Asset = insertAsset({
      filename: src, // absolute path for linked
      type,
      duration_ms: probed.duration_ms,
      original_path: src,
      thumbnail_path,
      width: probed.width,
      height: probed.height,
      sample_rate: probed.sample_rate,
      linked: 1
    })

    results.push({ asset, warnings })
  }

  return results
}
