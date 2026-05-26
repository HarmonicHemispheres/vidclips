import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Shortcut {
  keys: string[]
  label: string
}

interface Section {
  title: string
  shortcuts: Shortcut[]
}

const SECTIONS: Section[] = [
  {
    title: 'Playback',
    shortcuts: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['Click ruler'], label: 'Move the playhead' },
      { keys: ['Drag ruler'], label: 'Scrub the playhead' }
    ]
  },
  {
    title: 'Timeline',
    shortcuts: [
      { keys: ['Ctrl', 'Mouse wheel'], label: 'Zoom timeline in / out' },
      { keys: ['Drag clip'], label: 'Move clip (snaps to non-overlapping slot)' },
      { keys: ['Drag clip edge'], label: 'Trim clip (respects neighbor clips)' },
      { keys: ['Click clip'], label: 'Select clip (Select tool)' },
      { keys: ['Click clip'], label: 'Split clip at click position (Cut tool)' },
      { keys: ['Drag END marker'], label: 'Adjust project length' },
      { keys: ['Drag the divider'], label: 'Resize the timeline area' },
      { keys: ['Delete', 'Backspace'], label: 'Delete the selected clip' }
    ]
  },
  {
    title: 'Editor canvas',
    shortcuts: [
      { keys: ['Ctrl', 'Mouse wheel'], label: 'Zoom canvas in / out' },
      { keys: ['Click layer'], label: 'Select a visual layer' },
      { keys: ['Drag body'], label: 'Move the selected layer' },
      { keys: ['Drag corner'], label: 'Resize from the opposite corner anchor' },
      { keys: ['Drag rotation handle'], label: 'Rotate the selected layer' },
      { keys: ['Click empty canvas'], label: 'Deselect' }
    ]
  },
  {
    title: 'Inspector',
    shortcuts: [
      { keys: ['Double-click value'], label: 'Edit fade duration (up to 100s override)' },
      { keys: ['Drag curve node'], label: 'Reshape a fade curve' },
      { keys: ['Click section title'], label: 'Collapse / expand clip details' }
    ]
  },
  {
    title: 'Assets',
    shortcuts: [
      { keys: ['Drag asset → timeline'], label: 'Drop a clip onto a track' },
      { keys: ['Hover + trash icon'], label: 'Remove an asset' }
    ]
  },
  {
    title: 'History',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], label: 'Undo (up to 50 actions)' }
    ]
  },
  {
    title: 'Project',
    shortcuts: [
      { keys: ['Click LENGTH value'], label: 'Edit project length inline' }
    ]
  }
]

export function HelpDialog({ open, onOpenChange }: Props): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hotkeys &amp; shortcuts</DialogTitle>
          <DialogDescription>
            Quick reference for every keyboard and mouse shortcut in vidclips, grouped by
            feature. On macOS, use ⌘ wherever Ctrl is shown.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.shortcuts.map((s, i) => (
                  <li
                    key={`${section.title}-${i}`}
                    className="flex items-start gap-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-1 flex-shrink-0 min-w-[140px]">
                      {s.keys.map((k, ki) => (
                        <span key={ki} className="inline-flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 rounded border border-border bg-card font-mono text-[10px]">
                            {k}
                          </kbd>
                          {ki < s.keys.length - 1 && (
                            <span className="text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="text-muted-foreground leading-relaxed">
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
