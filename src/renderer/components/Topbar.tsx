import { useStore } from '../store'
import { Button } from './ui/button'
import {
  FolderOpen,
  Download,
  Folder,
  Settings as SettingsIcon,
  Undo2,
  HelpCircle
} from 'lucide-react'

interface Props {
  onExportClick: () => void
  onSettingsClick: () => void
  onHelpClick: () => void
}

export function Topbar({ onExportClick, onSettingsClick, onHelpClick }: Props): JSX.Element {
  const meta = useStore((s) => s.meta)
  const historyLength = useStore((s) => s.history.length)
  const undo = useStore((s) => s.undo)
  const lastDescription = useStore((s) =>
    s.history.length > 0 ? s.history[s.history.length - 1].description : null
  )

  const closeProject = async (): Promise<void> => {
    await window.api.project.close()
    useStore.getState().setMeta(null)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2 bg-card border-b border-border min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 flex-shrink">
        <span className="text-sm font-semibold flex-shrink-0">vidclips</span>
        {meta && (
          <>
            <span className="text-xs text-muted-foreground flex-shrink-0">·</span>
            <span className="text-xs text-muted-foreground truncate">{meta.project_name}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={onHelpClick}
          title="Hotkeys & shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void undo()}
          disabled={historyLength === 0}
          title={
            lastDescription ? `Undo: ${lastDescription} (Ctrl+Z)` : 'Nothing to undo'
          }
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onSettingsClick}
          title="Project settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void window.api.project.revealInFolder()}
          title="Reveal in folder"
        >
          <Folder className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void closeProject()}
          title="Close project"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={onExportClick} title="Export to MP4">
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>
    </div>
  )
}
