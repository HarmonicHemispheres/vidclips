import { spawn, ChildProcess } from 'node:child_process'
import { ffmpegPath } from '../ffmpeg/locate'
import type { ExportProgress } from '@shared/types'
import type { FilterGraphResult } from './filterGraph'

export interface RunExportOpts {
  outPath: string
  graph: FilterGraphResult
  crf?: number
  onProgress?: (p: ExportProgress) => void
}

let activeProc: ChildProcess | null = null

export function cancelExport(): void {
  if (activeProc) {
    activeProc.kill('SIGKILL')
    activeProc = null
  }
}

export function runExport(opts: RunExportOpts): Promise<void> {
  const { outPath, graph, crf = 20, onProgress } = opts

  const args: string[] = ['-y']
  for (const input of graph.inputs) {
    args.push('-i', input)
  }

  args.push('-filter_complex', graph.filterComplex)
  args.push('-map', graph.outVideo)
  if (graph.outAudio) {
    args.push('-map', graph.outAudio)
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p'
  )
  if (graph.outAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k')
  }
  args.push('-progress', 'pipe:2')
  args.push(outPath)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args)
    activeProc = proc

    let stderrTail = ''
    const progressState: Partial<ExportProgress> = {
      frame: 0,
      fps: 0,
      time_ms: 0,
      total_ms: graph.durationMs,
      percent: 0,
      speed: 0
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrTail = (stderrTail + text).slice(-4000)

      for (const line of text.split(/\r?\n/)) {
        const eq = line.indexOf('=')
        if (eq === -1) continue
        const key = line.slice(0, eq).trim()
        const value = line.slice(eq + 1).trim()
        switch (key) {
          case 'frame':
            progressState.frame = parseInt(value, 10)
            break
          case 'fps':
            progressState.fps = parseFloat(value)
            break
          case 'out_time_ms':
          case 'out_time_us': {
            const n = parseInt(value, 10)
            if (!isNaN(n)) progressState.time_ms = Math.floor(n / 1000)
            break
          }
          case 'speed':
            progressState.speed = parseFloat(value.replace('x', '')) || 0
            break
          case 'progress':
            progressState.percent = graph.durationMs
              ? Math.min(100, ((progressState.time_ms ?? 0) / graph.durationMs) * 100)
              : 0
            onProgress?.(progressState as ExportProgress)
            break
        }
      }
    })

    proc.on('error', (err) => {
      activeProc = null
      reject(err)
    })
    proc.on('close', (code) => {
      activeProc = null
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited ${code}\n${stderrTail}`))
      }
    })
  })
}
