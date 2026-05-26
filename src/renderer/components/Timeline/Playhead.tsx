import { LABEL_OFFSET, msToPx } from '../../lib/geometry'

interface Props {
  currentMs: number
  pxPerSecond: number
  top: number
}

export function Playhead({ currentMs, pxPerSecond, top }: Props): JSX.Element {
  const x = LABEL_OFFSET + msToPx(currentMs, pxPerSecond)
  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: x,
        top: 0,
        bottom: 0,
        width: 1
      }}
    >
      <div className="absolute top-0 left-[-5px] w-3 h-3 bg-sky-400 rotate-45 origin-center" />
      <div
        className="absolute left-0 w-px bg-sky-400"
        style={{ top, bottom: 0 }}
      />
    </div>
  )
}
