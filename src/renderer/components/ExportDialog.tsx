import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Button } from './ui/button'
import type { ExportProgress } from '@shared/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportDialog({ open, onOpenChange }: Props): JSX.Element {
  const [outPath, setOutPath] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) {
      setOutPath(null)
      setRunning(false)
      setProgress(null)
      setError(null)
      setDone(false)
    }
  }, [open])

  useEffect(() => {
    const off = window.api.export.onProgress(setProgress)
    return off
  }, [])

  const pickPath = async (): Promise<void> => {
    const p = await window.api.dialog.pickSavePath('vidclips-export.mp4')
    if (p) setOutPath(p)
  }

  const startExport = async (): Promise<void> => {
    if (!outPath) return
    setError(null)
    setRunning(true)
    setDone(false)
    try {
      await window.api.export.start(outPath, {})
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const cancel = async (): Promise<void> => {
    await window.api.export.cancel()
    setRunning(false)
  }

  const percent = progress?.percent ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Render the timeline to an MP4 file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Output file
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate rounded border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground">
                {outPath ?? 'No file selected'}
              </div>
              <Button variant="outline" size="sm" onClick={() => void pickPath()}>
                Choose…
              </Button>
            </div>
          </div>

          {running && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{progress ? `${Math.round(percent)}%` : 'Starting…'}</span>
                <span>{progress ? `${progress.speed.toFixed(2)}x` : ''}</span>
              </div>
              <div className="h-2 bg-secondary rounded">
                <div
                  className="h-full bg-sky-500 rounded transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {done && (
            <div className="rounded bg-emerald-900/30 border border-emerald-600/40 p-3 text-xs">
              Export complete: <span className="font-mono">{outPath}</span>
            </div>
          )}

          {error && (
            <div className="rounded bg-destructive/20 border border-destructive p-3 text-xs">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => void cancel()}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button disabled={!outPath} onClick={() => void startExport()}>
                Export
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
