import { spawn } from 'node:child_process'
import { ffprobePath } from '../ffmpeg/locate'

export interface ProbeResult {
  duration_ms: number
  width: number | null
  height: number | null
  sample_rate: number | null
  has_video: boolean
  has_audio: boolean
}

export async function probe(filePath: string): Promise<ProbeResult> {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath(), args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string }
          streams?: Array<{
            codec_type?: string
            width?: number
            height?: number
            sample_rate?: string
            duration?: string
          }>
        }

        const streams = parsed.streams ?? []
        const video = streams.find((s) => s.codec_type === 'video')
        const audio = streams.find((s) => s.codec_type === 'audio')

        const formatDuration = parsed.format?.duration
          ? parseFloat(parsed.format.duration)
          : null
        const videoDuration = video?.duration ? parseFloat(video.duration) : null
        const audioDuration = audio?.duration ? parseFloat(audio.duration) : null
        const durationSec = formatDuration ?? videoDuration ?? audioDuration ?? 0

        resolve({
          duration_ms: Math.round(durationSec * 1000),
          width: video?.width ?? null,
          height: video?.height ?? null,
          sample_rate: audio?.sample_rate ? parseInt(audio.sample_rate, 10) : null,
          has_video: !!video,
          has_audio: !!audio
        })
      } catch (err) {
        reject(err)
      }
    })
  })
}
