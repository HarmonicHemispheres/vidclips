import { useEffect, useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Asset } from '@shared/types'
import { useStore } from '../../store'
import { Button } from '../ui/button'
import {
  FilePlus2,
  Film,
  Music,
  Image as ImageIcon,
  Trash2,
  Link2
} from 'lucide-react'
import { formatMs } from '../../lib/utils'

export function AssetLibrary(): JSX.Element {
  const assets = useStore((s) => s.assets)
  const importAssetsViaDialog = useStore((s) => s.importAssetsViaDialog)
  const linkAssetsViaDialog = useStore((s) => s.linkAssetsViaDialog)
  const refreshAssets = useStore((s) => s.refreshAssets)

  return (
    <div className="flex flex-col bg-card border-r border-border overflow-hidden min-w-0 min-h-0">
      <div className="flex items-center justify-between px-2 h-10 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assets
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void linkAssetsViaDialog()}
            title="Link media (reference without copying)"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void importAssetsViaDialog()}
            title="Import media (copy into project)"
          >
            <FilePlus2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
        {assets.length === 0 && (
          <div className="col-span-2 text-center text-xs text-muted-foreground py-8">
            No assets yet.
            <br />
            <FilePlus2 className="inline h-3 w-3" /> import or{' '}
            <Link2 className="inline h-3 w-3" /> link a file.
          </div>
        )}
        {assets.map((a) => (
          <AssetCard key={a.id} asset={a} onDeleted={() => void refreshAssets()} />
        ))}
      </div>
    </div>
  )
}

function AssetCard({ asset, onDeleted }: { asset: Asset; onDeleted: () => void }): JSX.Element {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    if (!asset.thumbnail_path) {
      setThumb(null)
      return
    }
    void window.api.assets.getThumbUrl(asset.thumbnail_path).then(setThumb)
  }, [asset.thumbnail_path])

  const draggableData = useMemo(
    () => ({ type: 'asset' as const, assetId: asset.id }),
    [asset.id]
  )
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `asset-${asset.id}`,
    data: draggableData
  })

  const Icon = asset.type === 'audio' ? Music : asset.type === 'image' ? ImageIcon : Film
  const isLinked = asset.linked === 1
  const displayName = isLinked
    ? asset.filename.split(/[/\\]/).pop() ?? asset.filename
    : asset.filename

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative rounded border bg-background overflow-hidden cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      } ${isLinked ? 'border-amber-600/60' : 'border-border'}`}
      title={isLinked ? `Linked: ${asset.filename}` : asset.filename}
    >
      <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
        {thumb ? (
          <img src={thumb} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-6 w-6 text-muted-foreground" />
        )}
        {isLinked && (
          <div
            className="absolute top-1 left-1 h-5 px-1 flex items-center gap-0.5 rounded bg-amber-600/90 text-zinc-50 text-[9px] uppercase tracking-wide font-medium"
            title="Linked — file is referenced in place, not copied into the project"
          >
            <Link2 className="h-3 w-3" />
            <span>link</span>
          </div>
        )}
      </div>
      <div className="px-1.5 py-1">
        <div className="truncate text-[11px]">{displayName}</div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="uppercase flex items-center gap-1">
            <Icon className="h-3 w-3" />
            {asset.type}
          </span>
          <span>{formatMs(asset.duration_ms)}</span>
        </div>
      </div>
      <button
        className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center h-5 w-5 rounded bg-zinc-900/90 hover:bg-destructive text-zinc-200"
        onClick={async (e) => {
          e.stopPropagation()
          await window.api.assets.delete(asset.id)
          onDeleted()
        }}
        title="Remove asset"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
