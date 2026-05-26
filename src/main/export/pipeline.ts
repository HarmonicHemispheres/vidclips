import { listClips } from '../db/repos/clipsRepo'
import { listTracks } from '../db/repos/tracksRepo'
import { listAssets } from '../db/repos/assetsRepo'
import { getMeta } from '../db/repos/metaRepo'
import { buildFilterGraph } from './filterGraph'
import { runExport, cancelExport as runnerCancel } from './runner'
import type { ExportOptions, ExportProgress } from '@shared/types'

export interface StartExportArgs {
  outPath: string
  opts: ExportOptions
  onProgress: (p: ExportProgress) => void
}

export async function startExport(args: StartExportArgs): Promise<void> {
  const meta = getMeta()
  const clips = listClips()
  const tracks = listTracks()
  const assets = listAssets()

  if (clips.length === 0) {
    throw new Error('Nothing to export — the timeline is empty')
  }

  const graph = buildFilterGraph({
    clips,
    tracks,
    assets,
    width: args.opts.width ?? meta.width,
    height: args.opts.height ?? meta.height,
    fps: args.opts.fps ?? meta.fps
  })

  await runExport({
    outPath: args.outPath,
    graph,
    crf: args.opts.crf,
    onProgress: args.onProgress
  })
}

export function cancelExport(): void {
  runnerCancel()
}
