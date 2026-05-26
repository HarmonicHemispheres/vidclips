import { useRef } from 'react'
import { useStore } from '../../store'
import type { RenderableLayer } from './PlaybackEngine'

interface Props {
  layers: RenderableLayer[]
  canvasW: number
  canvasH: number
  displayScale: number
  boxSize: { w: number; h: number }
  selectedClipId: number | null
  naturalFit: (
    canvasW: number,
    canvasH: number,
    assetW: number | null,
    assetH: number | null
  ) => { w: number; h: number }
}

const HANDLE_SIZE = 10
const ROTATION_HANDLE_OFFSET = 32

function rotatePoint(x: number, y: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return { x: x * c - y * s, y: x * s + y * c }
}

interface DragKind {
  kind: 'scale' | 'rotate'
  corner?: 'tl' | 'tr' | 'br' | 'bl'
}

export function EditorOverlay({
  layers,
  canvasW,
  canvasH,
  displayScale,
  boxSize,
  selectedClipId,
  naturalFit
}: Props): JSX.Element | null {
  const updateClip = useStore((s) => s.updateClip)
  const clips = useStore((s) => s.clips)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const selected = layers.find((l) => l.clip.id === selectedClipId)
  if (!selected) return null

  const fit = naturalFit(canvasW, canvasH, selected.asset.width, selected.asset.height)
  const halfW = (fit.w / 2) * selected.clip.transform_scale
  const halfH = (fit.h / 2) * selected.clip.transform_scale
  const centerCanvasX = canvasW / 2 + selected.clip.transform_x
  const centerCanvasY = canvasH / 2 + selected.clip.transform_y
  // Local coords: positions inside the overlay div (which fills the canvas div).
  // The overlay's top-left maps to canvas (0, 0). To compare against
  // viewport-relative mouse coords (clientX/Y) during drag, we read the
  // wrapper's bounding rect at drag-start.
  const centerScreenX = centerCanvasX * displayScale
  const centerScreenY = centerCanvasY * displayScale
  const rot = selected.clip.transform_rotation

  // Corner offsets from center in canvas coords (pre-rotation)
  const cornersLocal = {
    tl: { x: -halfW, y: -halfH },
    tr: { x: halfW, y: -halfH },
    br: { x: halfW, y: halfH },
    bl: { x: -halfW, y: halfH }
  } as const
  type CornerKey = keyof typeof cornersLocal

  const cornerScreen = (key: CornerKey): { x: number; y: number } => {
    const local = cornersLocal[key]
    const rotated = rotatePoint(local.x, local.y, rot)
    return {
      x: centerScreenX + rotated.x * displayScale,
      y: centerScreenY + rotated.y * displayScale
    }
  }

  const tl = cornerScreen('tl')
  const tr = cornerScreen('tr')
  const br = cornerScreen('br')
  const bl = cornerScreen('bl')

  // Rotation handle sits above the midpoint of the top edge, offset along the up vector
  const upVec = rotatePoint(0, -1, rot)
  const topMidLocal = rotatePoint(0, -halfH, rot)
  const topMidScreen = {
    x: centerScreenX + topMidLocal.x * displayScale,
    y: centerScreenY + topMidLocal.y * displayScale
  }
  const rotHandle = {
    x: topMidScreen.x + upVec.x * ROTATION_HANDLE_OFFSET,
    y: topMidScreen.y + upVec.y * ROTATION_HANDLE_OFFSET
  }

  const startDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const wrapperRect = wrapper.getBoundingClientRect()
    // Origin (viewport-relative) of the canvas region. Add this to any
    // local canvas-pixel position to get a clientX/Y-comparable coord.
    const originX = wrapperRect.left
    const originY = wrapperRect.top
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    // Read CURRENT clip state at drag-start (not the closure's `selected`)
    const startClip = useStore.getState().clips.find((c) => c.id === selectedClipId)
    if (!startClip) return
    const startScale = startClip.transform_scale
    const startRot = startClip.transform_rotation
    const startTx = startClip.transform_x
    const startTy = startClip.transform_y

    // Layer center in viewport-relative screen coords (for rotation handle).
    const startCenterCanvasX = canvasW / 2 + startTx
    const startCenterCanvasY = canvasH / 2 + startTy
    const centerVpX = originX + startCenterCanvasX * displayScale
    const centerVpY = originY + startCenterCanvasY * displayScale

    // Anchor for scaling: the OPPOSITE corner of the dragged handle (or the
    // layer center if not a scale drag). The anchor stays fixed in canvas
    // space throughout the drag.
    const oppositeOffset = {
      tl: { x: 1, y: 1 },
      tr: { x: -1, y: 1 },
      br: { x: -1, y: -1 },
      bl: { x: 1, y: -1 }
    } as const

    const halfWUnscaled = fit.w / 2
    const halfHUnscaled = fit.h / 2

    let anchorCanvasX = startCenterCanvasX
    let anchorCanvasY = startCenterCanvasY
    if (kind.kind === 'scale' && kind.corner) {
      const sign = oppositeOffset[kind.corner]
      const offCanvas = {
        x: sign.x * halfWUnscaled * startScale,
        y: sign.y * halfHUnscaled * startScale
      }
      const rotatedCanvas = rotatePoint(offCanvas.x, offCanvas.y, startRot)
      anchorCanvasX = startCenterCanvasX + rotatedCanvas.x
      anchorCanvasY = startCenterCanvasY + rotatedCanvas.y
    }
    const anchorVpX = originX + anchorCanvasX * displayScale
    const anchorVpY = originY + anchorCanvasY * displayScale

    // Build the diagonal unit vector (from anchor toward the dragged corner)
    // and project the live mouse onto it. Projection (signed) maps directly
    // to how far the corner has moved along its natural drag axis: outward
    // grows, inward toward the anchor shrinks, past the anchor goes negative
    // (which we clamp).
    const diagVecX = startMouseX - anchorVpX
    const diagVecY = startMouseY - anchorVpY
    const diagLen = Math.hypot(diagVecX, diagVecY)
    const diagUnitX = diagLen > 0 ? diagVecX / diagLen : 0
    const diagUnitY = diagLen > 0 ? diagVecY / diagLen : 0

    const initialAngle = Math.atan2(startMouseY - centerVpY, startMouseX - centerVpX)
    let latest: {
      transform_scale?: number
      transform_rotation?: number
      transform_x?: number
      transform_y?: number
    } = {}

    const move = (ev: PointerEvent): void => {
      if (kind.kind === 'scale') {
        if (diagLen < 1) return
        // Signed projection of current mouse offset along the diagonal axis.
        const dx = ev.clientX - anchorVpX
        const dy = ev.clientY - anchorVpY
        const projection = dx * diagUnitX + dy * diagUnitY
        const rawRatio = projection / diagLen
        const clampedScale = Math.max(0.05, Math.min(10, startScale * rawRatio))
        // Re-derive the effective ratio after clamping so the anchor stays
        // truly fixed even at the scale limits.
        const effectiveRatio = clampedScale / startScale
        const newCenterCanvasX =
          anchorCanvasX + effectiveRatio * (startCenterCanvasX - anchorCanvasX)
        const newCenterCanvasY =
          anchorCanvasY + effectiveRatio * (startCenterCanvasY - anchorCanvasY)
        const nextX = newCenterCanvasX - canvasW / 2
        const nextY = newCenterCanvasY - canvasH / 2
        latest = {
          transform_scale: clampedScale,
          transform_x: nextX,
          transform_y: nextY
        }
        useStore.setState((s) => ({
          clips: s.clips.map((c) =>
            c.id === startClip.id
              ? {
                  ...c,
                  transform_scale: clampedScale,
                  transform_x: nextX,
                  transform_y: nextY
                }
              : c
          )
        }))
      } else if (kind.kind === 'rotate') {
        const ang = Math.atan2(ev.clientY - centerVpY, ev.clientX - centerVpX)
        const deltaDeg = ((ang - initialAngle) * 180) / Math.PI
        const nextRot = (startRot + deltaDeg + 540) % 360 - 180 // normalize to (-180, 180]
        latest = { transform_rotation: nextRot }
        useStore.setState((s) => ({
          clips: s.clips.map((c) =>
            c.id === startClip.id ? { ...c, transform_rotation: nextRot } : c
          )
        }))
      }
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (
        latest.transform_scale !== undefined ||
        latest.transform_rotation !== undefined
      ) {
        void updateClip(startClip.id, latest, { optimistic: false })
        const clipId = startClip.id
        const beforeScale = startScale
        const beforeRotation = startRot
        const beforeX = startTx
        const beforeY = startTy
        useStore.getState().pushHistory({
          description: kind.kind === 'scale' ? 'scale clip' : 'rotate clip',
          undo: async () => {
            await useStore.getState().updateClip(clipId, {
              transform_scale: beforeScale,
              transform_rotation: beforeRotation,
              transform_x: beforeX,
              transform_y: beforeY
            })
          }
        })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startMoveDrag = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const startClip = clips.find((c) => c.id === selectedClipId)
    if (!startClip) return
    const startMouseX = e.clientX
    const startMouseY = e.clientY
    const startTx = startClip.transform_x
    const startTy = startClip.transform_y
    let latest: { transform_x: number; transform_y: number } = { transform_x: startTx, transform_y: startTy }

    const move = (ev: PointerEvent): void => {
      // Mouse delta is in viewport pixels; divide by displayScale to get
      // canvas pixels. (Viewport translation cancels out for deltas, so
      // no canvas-origin lookup is needed here.)
      const dx = (ev.clientX - startMouseX) / displayScale
      const dy = (ev.clientY - startMouseY) / displayScale
      const nextX = startTx + dx
      const nextY = startTy + dy
      latest = { transform_x: nextX, transform_y: nextY }
      useStore.setState((s) => ({
        clips: s.clips.map((c) =>
          c.id === startClip.id ? { ...c, transform_x: nextX, transform_y: nextY } : c
        )
      }))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      void updateClip(startClip.id, latest, { optimistic: false })
      if (latest.transform_x !== startTx || latest.transform_y !== startTy) {
        const clipId = startClip.id
        useStore.getState().pushHistory({
          description: 'move (canvas)',
          undo: async () => {
            await useStore.getState().updateClip(clipId, {
              transform_x: startTx,
              transform_y: startTy
            })
          }
        })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const halfHandle = HANDLE_SIZE / 2
  const corners: { key: CornerKey; pos: { x: number; y: number } }[] = [
    { key: 'tl', pos: tl },
    { key: 'tr', pos: tr },
    { key: 'br', pos: br },
    { key: 'bl', pos: bl }
  ]

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 pointer-events-none"
    >
      <svg
        className="absolute inset-0 pointer-events-none w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <polygon
          points={[tl, tr, br, bl].map((p) => `${p.x},${p.y}`).join(' ')}
          stroke="rgba(14,165,233,0.9)"
          strokeWidth={1}
          fill="rgba(14,165,233,0.08)"
        />
        <line
          x1={topMidScreen.x}
          y1={topMidScreen.y}
          x2={rotHandle.x}
          y2={rotHandle.y}
          stroke="rgba(14,165,233,0.9)"
          strokeWidth={1}
        />
      </svg>

      {/* Body move target — interior polygon */}
      <BodyMoveTarget
        tl={tl}
        tr={tr}
        br={br}
        bl={bl}
        onPointerDown={startMoveDrag}
      />

      {corners.map(({ key, pos }) => (
        <div
          key={key}
          className="absolute bg-sky-400 border border-white rounded-sm cursor-nwse-resize pointer-events-auto"
          style={{
            left: pos.x - halfHandle,
            top: pos.y - halfHandle,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE
          }}
          onPointerDown={startDrag({ kind: 'scale', corner: key })}
        />
      ))}

      <div
        className="absolute bg-sky-400 border border-white rounded-full cursor-grab pointer-events-auto"
        style={{
          left: rotHandle.x - halfHandle,
          top: rotHandle.y - halfHandle,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE
        }}
        onPointerDown={startDrag({ kind: 'rotate' })}
        title="Drag to rotate"
      />
    </div>
  )
}

/**
 * Renders an invisible polygon over the rotated layer body that captures
 * pointerdown for move-drag. SVG hit-testing handles the rotated shape.
 */
function BodyMoveTarget({
  tl,
  tr,
  br,
  bl,
  onPointerDown
}: {
  tl: { x: number; y: number }
  tr: { x: number; y: number }
  br: { x: number; y: number }
  bl: { x: number; y: number }
  onPointerDown: (e: React.PointerEvent) => void
}): JSX.Element {
  return (
    <svg
      className="absolute inset-0"
      style={{ pointerEvents: 'none', width: '100%', height: '100%' }}
    >
      <polygon
        points={[tl, tr, br, bl].map((p) => `${p.x},${p.y}`).join(' ')}
        fill="transparent"
        style={{ pointerEvents: 'auto', cursor: 'move' }}
        onPointerDown={(e) => onPointerDown(e as unknown as React.PointerEvent)}
      />
    </svg>
  )
}
