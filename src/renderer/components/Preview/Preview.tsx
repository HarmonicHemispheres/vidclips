import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, getTimelineDurationMs } from '../../store'
import { computeVisible, type VisibleState, type RenderableLayer } from './PlaybackEngine'
import { TransportBar } from './TransportBar'
import { EditorOverlay } from './EditorOverlay'

interface MediaRef {
  el: HTMLVideoElement | HTMLAudioElement
  type: 'video' | 'audio' | 'image'
  imgEl?: HTMLImageElement
}

/** Compute object-contain natural size for a layer inside the canvas. */
function naturalFit(
  canvasW: number,
  canvasH: number,
  assetW: number | null,
  assetH: number | null
): { w: number; h: number } {
  if (!assetW || !assetH || assetW <= 0 || assetH <= 0) {
    return { w: canvasW, h: canvasH }
  }
  const canvasAspect = canvasW / canvasH
  const assetAspect = assetW / assetH
  if (assetAspect > canvasAspect) {
    return { w: canvasW, h: canvasW / assetAspect }
  }
  return { w: canvasH * assetAspect, h: canvasH }
}

export function Preview(): JSX.Element {
  const clips = useStore((s) => s.clips)
  const assets = useStore((s) => s.assets)
  const tracks = useStore((s) => s.tracks)
  const meta = useStore((s) => s.meta)
  const currentMs = useStore((s) => s.currentTimeMs)
  const isPlaying = useStore((s) => s.isPlaying)
  const seek = useStore((s) => s.seek)
  const pause = useStore((s) => s.pause)
  const totalMs = useStore(getTimelineDurationMs)
  const previewMode = useStore((s) => s.previewMode)
  const setPreviewMode = useStore((s) => s.setPreviewMode)
  const selectedClipId = useStore((s) => s.selectedClipId)
  const selectClip = useStore((s) => s.selectClip)
  const editorZoom = useStore((s) => s.editorZoom)
  const setEditorZoom = useStore((s) => s.setEditorZoom)

  const fitRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const mediaRefs = useRef(new Map<number, MediaRef>())
  const mediaUrls = useRef(new Map<number, string>())
  const lastFrameTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const [visible, setVisible] = useState<VisibleState>({ videoLayers: [], audioLayers: [] })
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Resolve media URLs for assets
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const a of assets) {
        if (mediaUrls.current.has(a.id)) continue
        const url = await window.api.assets.getMediaUrl(a.id)
        if (!cancelled && url) mediaUrls.current.set(a.id, url)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assets])

  useEffect(() => {
    setVisible(computeVisible(currentMs, clips, assets, tracks))
  }, [currentMs, clips, assets, tracks])

  // Playback rAF loop: advance currentTimeMs when isPlaying (preview mode only).
  useEffect(() => {
    if (!isPlaying || previewMode === 'editor') {
      lastFrameTimeRef.current = null
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      mediaRefs.current.forEach((m) => {
        if (m.type !== 'image') (m.el as HTMLMediaElement).pause()
      })
      return
    }
    const tick = (t: number): void => {
      const last = lastFrameTimeRef.current ?? t
      const dt = t - last
      lastFrameTimeRef.current = t
      const next = useStore.getState().currentTimeMs + dt
      const dur = getTimelineDurationMs(useStore.getState())
      if (next >= dur) {
        useStore.getState().seek(dur)
        useStore.getState().pause()
        return
      }
      useStore.getState().seek(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [isPlaying, previewMode])

  // Sync each media element's currentTime + play/pause to the playhead.
  //
  // The tricky part: while playing, the rAF loop advances currentTimeMs every
  // frame; the <video> also advances at real time on its own. If we *always*
  // re-seek when there's any drift, we'll trigger a fresh seek every rAF tick
  // before the previous one had a chance to land — the video ends up stuck
  // showing its initial frame.
  //
  // So: while playing, trust the video to advance on its own. Only re-seek if
  // the layer just became active (el.paused) or the drift is huge (e.g., the
  // user scrubbed). While paused, follow the playhead tightly.
  useEffect(() => {
    const activeClipIds = new Set(
      [...visible.videoLayers, ...visible.audioLayers].map((l) => l.clip.id)
    )

    mediaRefs.current.forEach((m, clipId) => {
      if (!activeClipIds.has(clipId) && m.type !== 'image') {
        const el = m.el as HTMLMediaElement
        if (!el.paused) el.pause()
      }
    })

    const wantPlay = isPlaying && previewMode === 'preview'
    // De-dupe layers: a video clip appears in both videoLayers and audioLayers.
    const seenClipIds = new Set<number>()
    const allLayers = [...visible.videoLayers, ...visible.audioLayers].filter((l) => {
      if (seenClipIds.has(l.clip.id)) return false
      seenClipIds.add(l.clip.id)
      return true
    })
    for (const layer of allLayers) {
      const m = mediaRefs.current.get(layer.clip.id)
      if (!m) continue
      if (m.type === 'image') continue
      const el = m.el as HTMLMediaElement
      el.muted = layer.clip.muted === 1
      // Apply fade as audio volume attenuation. layer.opacity already includes
      // the fade-in/out + curve math from PlaybackEngine.
      el.volume = Math.max(0, Math.min(1, layer.opacity))
      const wantTime = layer.assetTimeMs / 1000
      const drift = Math.abs(el.currentTime - wantTime)

      if (wantPlay) {
        // Resync on entry to a clip OR if the user scrubbed far away.
        if (el.paused || drift > 0.5) {
          try {
            el.currentTime = wantTime
          } catch {
            /* not ready */
          }
          if (el.paused) el.play().catch(() => {})
        }
        // Otherwise let the video keep playing naturally.
      } else {
        // Paused or editor mode: hold the video on the exact playhead frame.
        if (drift > 0.05) {
          try {
            el.currentTime = wantTime
          } catch {
            /* not ready */
          }
        }
        if (!el.paused) el.pause()
      }
    }
  }, [visible, isPlaying, previewMode])

  const targetAspect = useMemo(() => {
    if (!meta || meta.height <= 0) return 16 / 9
    return meta.width / meta.height
  }, [meta])

  // Fit the preview box inside the available area while preserving aspect ratio.
  useEffect(() => {
    const el = fitRef.current
    if (!el) return
    const update = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return
      const containerAspect = w / h
      if (containerAspect > targetAspect) {
        setBoxSize({ w: Math.floor(h * targetAspect), h: Math.floor(h) })
      } else {
        setBoxSize({ w: Math.floor(w), h: Math.floor(w / targetAspect) })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [targetAspect])

  const canvasW = meta?.width ?? 1920
  const canvasH = meta?.height ?? 1080
  const editorMode = previewMode === 'editor'
  const baseScale = boxSize.w > 0 && canvasW > 0 ? boxSize.w / canvasW : 1
  // In editor mode the user can zoom; in preview mode we always fit to viewport.
  const displayScale = editorMode ? baseScale * editorZoom : baseScale
  const canvasOnscreenW = canvasW * displayScale
  const canvasOnscreenH = canvasH * displayScale

  const onCanvasBackgroundPointerDown = (_e: React.PointerEvent): void => {
    if (previewMode !== 'editor') return
    // Layer + handle handlers stopPropagation, so reaching this handler means
    // the user pressed on empty canvas space.
    selectClip(null)
  }

  const onCanvasWheel = (e: React.WheelEvent): void => {
    if (!editorMode) return
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setEditorZoom(editorZoom * factor)
  }

  return (
    <div className="flex flex-col bg-black overflow-hidden min-w-0 min-h-0">
      <ModeToggle
        mode={previewMode}
        setMode={setPreviewMode}
        editorZoom={editorZoom}
        setEditorZoom={setEditorZoom}
      />
      <div
        ref={fitRef}
        className={`flex-1 flex items-center justify-center p-2 min-h-0 min-w-0 ${
          editorMode ? 'overflow-auto' : 'overflow-hidden'
        }`}
        onWheelCapture={onCanvasWheel}
      >
        <div
          ref={canvasRef}
          className={`relative bg-zinc-950 shadow-2xl flex-shrink-0 ${
            editorMode ? 'outline-dashed outline-2 outline-sky-500/70' : ''
          }`}
          style={{
            width: canvasOnscreenW,
            height: canvasOnscreenH,
            overflow: editorMode ? 'visible' : 'hidden'
          }}
          onPointerDown={onCanvasBackgroundPointerDown}
        >
          {/* Canvas-coord container scaled to display size */}
          <div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              width: canvasW,
              height: canvasH,
              transform: `scale(${displayScale})`,
              transformOrigin: '0 0'
            }}
          >
            {[...visible.videoLayers].map((layer, idx) => (
              <CanvasLayer
                key={layer.clip.id}
                layer={layer}
                canvasW={canvasW}
                canvasH={canvasH}
                zIndex={idx}
                interactive={previewMode === 'editor'}
                isSelected={layer.clip.id === selectedClipId}
                mediaUrl={mediaUrls.current.get(layer.asset.id) ?? null}
                onSelect={() => selectClip(layer.clip.id)}
                registerMediaRef={(ref) => {
                  if (ref) mediaRefs.current.set(layer.clip.id, ref)
                }}
              />
            ))}
          </div>

          {/* Audio-only sources */}
          {[...visible.audioLayers]
            .filter((l) => l.asset.type === 'audio')
            .map((layer) => {
              const url = mediaUrls.current.get(layer.asset.id)
              if (!url) return null
              return (
                <audio
                  key={layer.clip.id}
                  ref={(el) => {
                    if (el) mediaRefs.current.set(layer.clip.id, { el, type: 'audio' })
                  }}
                  src={url}
                  style={{ display: 'none' }}
                />
              )
            })}

          {visible.videoLayers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
              Drop a clip onto the timeline to {previewMode === 'editor' ? 'edit' : 'preview'}
            </div>
          )}

          {previewMode === 'editor' && (
            <EditorOverlay
              layers={visible.videoLayers}
              canvasW={canvasW}
              canvasH={canvasH}
              displayScale={displayScale}
              boxSize={boxSize}
              selectedClipId={selectedClipId}
              naturalFit={naturalFit}
            />
          )}
        </div>
      </div>
      <ScrubBar
        totalMs={totalMs}
        currentMs={currentMs}
        onSeek={(ms) => {
          pause()
          seek(ms)
        }}
      />
      <TransportBar />
    </div>
  )
}

function ModeToggle({
  mode,
  setMode,
  editorZoom,
  setEditorZoom
}: {
  mode: 'preview' | 'editor'
  setMode: (m: 'preview' | 'editor') => void
  editorZoom: number
  setEditorZoom: (z: number) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 items-center gap-2 px-3 py-1.5 bg-zinc-950 border-b border-border">
      <div />
      <div className="flex justify-center">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(['editor', 'preview'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 h-6 rounded text-[11px] uppercase tracking-wide transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end items-center gap-1 text-[10px] text-muted-foreground min-w-0">
        {mode === 'editor' && (
          <>
            <button
              type="button"
              onClick={() => setEditorZoom(editorZoom * 0.9)}
              className="h-5 w-5 rounded border border-border hover:bg-accent flex-shrink-0"
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setEditorZoom(1)}
              className="h-5 px-2 rounded border border-border hover:bg-accent font-mono tabular-nums flex-shrink-0"
              title="Reset to 100%"
            >
              {Math.round(editorZoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setEditorZoom(editorZoom * 1.1)}
              className="h-5 w-5 rounded border border-border hover:bg-accent flex-shrink-0"
              title="Zoom in"
            >
              +
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface CanvasLayerProps {
  layer: RenderableLayer
  canvasW: number
  canvasH: number
  zIndex: number
  interactive: boolean
  isSelected: boolean
  mediaUrl: string | null
  onSelect: () => void
  registerMediaRef: (m: MediaRef | null) => void
}

function CanvasLayer({
  layer,
  canvasW,
  canvasH,
  zIndex,
  interactive,
  isSelected,
  mediaUrl,
  onSelect,
  registerMediaRef
}: CanvasLayerProps): JSX.Element | null {
  if (!mediaUrl) return null
  const isImage = layer.asset.type === 'image'
  const fit = naturalFit(canvasW, canvasH, layer.asset.width, layer.asset.height)
  const left = (canvasW - fit.w) / 2 + layer.clip.transform_x
  const top = (canvasH - fit.h) / 2 + layer.clip.transform_y
  const effectiveOpacity = layer.clip.hidden ? 0 : layer.opacity

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (!interactive) return
    e.stopPropagation()
    onSelect()
  }

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: fit.w,
        height: fit.h,
        opacity: effectiveOpacity,
        zIndex,
        transform: `rotate(${layer.clip.transform_rotation}deg) scale(${layer.clip.transform_scale})`,
        transformOrigin: 'center center',
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? (isSelected ? 'move' : 'pointer') : 'default',
        outline: interactive && isSelected ? '2px solid rgba(14,165,233,0.8)' : 'none',
        outlineOffset: -1
      }}
      onPointerDown={handlePointerDown}
    >
      {isImage ? (
        <img
          ref={(el) => {
            if (el) {
              registerMediaRef({
                el: el as unknown as HTMLVideoElement,
                imgEl: el,
                type: 'image'
              })
            }
          }}
          src={mediaUrl}
          className="w-full h-full object-contain block pointer-events-none"
          alt=""
          draggable={false}
        />
      ) : (
        <video
          ref={(el) => {
            if (el) registerMediaRef({ el, type: 'video' })
          }}
          src={mediaUrl}
          playsInline
          className="w-full h-full object-contain block pointer-events-none"
        />
      )}
    </div>
  )
}

function ScrubBar({
  totalMs,
  currentMs,
  onSeek
}: {
  totalMs: number
  currentMs: number
  onSeek: (ms: number) => void
}): JSX.Element {
  const pct = totalMs > 0 ? (currentMs / totalMs) * 100 : 0
  const ref = useRef<HTMLDivElement>(null)

  const handle = (e: React.MouseEvent | MouseEvent): void => {
    const el = ref.current
    if (!el || totalMs <= 0) return
    const rect = el.getBoundingClientRect()
    const x = (e as MouseEvent).clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    onSeek(Math.round(ratio * totalMs))
  }

  return (
    <div
      ref={ref}
      className="relative h-3 bg-zinc-900 cursor-pointer border-t border-border"
      onMouseDown={(e) => {
        handle(e)
        const move = (ev: MouseEvent): void => handle(ev)
        const up = (): void => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
    >
      <div className="absolute top-0 bottom-0 left-0 bg-sky-500/50" style={{ width: `${pct}%` }} />
      <div className="absolute top-0 bottom-0 w-px bg-sky-400" style={{ left: `${pct}%` }} />
    </div>
  )
}

export { naturalFit }
