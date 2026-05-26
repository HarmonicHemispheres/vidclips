import { useRef } from 'react'
import { applyCurve, clampCurve } from '@shared/fadeMath'

interface Props {
  curve: number
  /** When true the curve represents a fade-out (starts at 1, ends at 0). */
  isOut?: boolean
  onChange: (curve: number, commit?: boolean) => void
  width?: number
  height?: number
  disabled?: boolean
}

/**
 * Visualizes a fade curve and lets the user drag a control node at t=0.5 to
 * steepen or flatten it. Values are stored as a "curve" parameter where 0 is
 * linear, positive numbers are ease-in (slow start), negative numbers are
 * ease-out (fast start). Range is clamped to [-2, 2].
 */
export function FadeCurveEditor({
  curve: curveRaw,
  isOut = false,
  onChange,
  width = 220,
  height = 80,
  disabled = false
}: Props): JSX.Element {
  const curve = typeof curveRaw === 'number' && isFinite(curveRaw) ? curveRaw : 0
  const ref = useRef<SVGSVGElement>(null)
  const padding = 6
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const pathPoints = (() => {
    const steps = 32
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const valueIn = applyCurve(t, curve) // [0,1]
      const value = isOut ? 1 - applyCurve(1 - t, curve) : valueIn
      const x = padding + t * innerW
      const y = padding + (1 - value) * innerH
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return 'M ' + pts.join(' L ')
  })()

  // Position of the control node at t=0.5
  const nodeT = 0.5
  const nodeValRaw = applyCurve(nodeT, curve)
  const nodeVal = isOut ? 1 - applyCurve(1 - nodeT, curve) : nodeValRaw
  const nodeX = padding + nodeT * innerW
  const nodeY = padding + (1 - nodeVal) * innerH

  const startDrag = (e: React.PointerEvent): void => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    const svg = ref.current
    if (!svg) return

    // Track the latest curve value across the drag so we can persist exactly
    // what the user released on. (The `curve` prop captured in this closure
    // is the value at drag-start; using it on release would revert the drag.)
    let latest = curve

    const move = (ev: PointerEvent): void => {
      const rect = svg.getBoundingClientRect()
      const yPx = ev.clientY - rect.top - padding
      const yNorm = Math.max(0.01, Math.min(0.99, yPx / innerH))
      // Convert y back to a curve value. For fade-in: value = (1 - yNorm) = (0.5)^exp
      // For fade-out: value = (1 - yNorm) = 1 - (0.5)^exp -> (0.5)^exp = yNorm
      const v = 1 - yNorm
      const targetValue = isOut ? 1 - v : v
      // Avoid log of 0
      const clamped = Math.max(0.001, Math.min(0.999, targetValue))
      const exp = Math.log(clamped) / Math.log(0.5)
      const next = clampCurve(Math.log2(exp))
      latest = next
      onChange(next, false)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onChange(latest, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const reset = (): void => {
    if (disabled) return
    onChange(0, true)
  }

  return (
    <div className="flex items-stretch gap-2">
      <svg
        ref={ref}
        width={width}
        height={height}
        className={`rounded border border-border bg-zinc-950 ${disabled ? 'opacity-40' : ''}`}
      >
        {/* grid */}
        <line
          x1={padding}
          y1={padding + innerH / 2}
          x2={padding + innerW}
          y2={padding + innerH / 2}
          stroke="#3f3f46"
          strokeDasharray="2 3"
        />
        <line
          x1={padding + innerW / 2}
          y1={padding}
          x2={padding + innerW / 2}
          y2={padding + innerH}
          stroke="#3f3f46"
          strokeDasharray="2 3"
        />
        {/* curve */}
        <path d={pathPoints} fill="none" stroke="#0ea5e9" strokeWidth={1.5} />
        {/* node */}
        <circle
          cx={nodeX}
          cy={nodeY}
          r={6}
          fill="#0ea5e9"
          stroke="#fff"
          strokeWidth={1.5}
          className={disabled ? '' : 'cursor-ns-resize'}
          onPointerDown={startDrag}
        />
      </svg>
      <div className="flex flex-col justify-between text-[10px] text-muted-foreground">
        <button
          type="button"
          className="rounded border border-border px-1.5 py-0.5 hover:bg-accent"
          onClick={reset}
          disabled={disabled}
        >
          Reset
        </button>
        <div className="font-mono">{curve >= 0 ? `+${curve.toFixed(2)}` : curve.toFixed(2)}</div>
      </div>
    </div>
  )
}
