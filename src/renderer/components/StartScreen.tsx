import { useEffect, useState } from 'react'
import type { RecentProject } from '@shared/types'
import { Button } from './ui/button'
import { useStore } from '../store'
import { Film, FolderOpen, Plus } from 'lucide-react'

export function StartScreen(): JSX.Element {
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadAll = useStore((s) => s.loadAll)

  useEffect(() => {
    void window.api.project.listRecent().then(setRecents)
  }, [])

  async function handleCreate(): Promise<void> {
    setError(null)
    const dir = await window.api.dialog.pickProjectFolder('create')
    if (!dir) return
    setBusy(true)
    try {
      const name = dir.split(/[/\\]/).pop() ?? 'Untitled'
      await window.api.project.create(dir, name)
      await loadAll()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(dir?: string): Promise<void> {
    setError(null)
    const target = dir ?? (await window.api.dialog.pickProjectFolder('open'))
    if (!target) return
    setBusy(true)
    try {
      await window.api.project.open(target)
      await loadAll()
    } catch (err) {
      setError((err as Error).message)
      if (dir) {
        await window.api.project.removeRecent(dir)
        setRecents(await window.api.project.listRecent())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="w-[640px] max-w-[90%] rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <Film className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-xl font-semibold">vidclips</h1>
            <p className="text-xs text-muted-foreground">A simple portable video editor</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <Button onClick={() => void handleCreate()} disabled={busy}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
          <Button variant="outline" onClick={() => void handleOpen()} disabled={busy}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Open Project
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded bg-destructive/20 border border-destructive p-3 text-xs text-destructive-foreground">
            {error}
          </div>
        )}

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Recent
          </h2>
          {recents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent projects.</p>
          ) : (
            <ul className="divide-y divide-border rounded border border-border">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between"
                    onClick={() => void handleOpen(r.path)}
                    disabled={busy}
                  >
                    <div>
                      <div className="text-sm">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.path}</div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.last_opened).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
