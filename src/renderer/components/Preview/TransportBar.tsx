import { useStore, getTimelineDurationMs } from '../../store'
import { Button } from '../ui/button'
import { Play, Pause, SkipBack, SkipForward, Square } from 'lucide-react'
import { formatMs } from '../../lib/utils'

export function TransportBar(): JSX.Element {
  const isPlaying = useStore((s) => s.isPlaying)
  const togglePlay = useStore((s) => s.togglePlay)
  const pause = useStore((s) => s.pause)
  const seek = useStore((s) => s.seek)
  const currentMs = useStore((s) => s.currentTimeMs)
  const totalMs = useStore(getTimelineDurationMs)

  const stop = (): void => {
    pause()
    seek(0)
  }

  const stepBack = (): void => seek(Math.max(0, currentMs - 1000))
  const stepFwd = (): void => seek(Math.min(totalMs, currentMs + 1000))

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-950 border-t border-border">
      <div className="font-mono tabular-nums text-xs text-muted-foreground w-24 text-right">
        {formatMs(currentMs)}
      </div>
      <Button size="icon" variant="ghost" onClick={stepBack} title="Back 1s">
        <SkipBack className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={stop} title="Stop">
        <Square className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant={isPlaying ? 'secondary' : 'default'}
        onClick={togglePlay}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" onClick={stepFwd} title="Forward 1s">
        <SkipForward className="h-4 w-4" />
      </Button>
      <div className="font-mono tabular-nums text-xs text-muted-foreground w-24">
        {formatMs(totalMs)}
      </div>
    </div>
  )
}
