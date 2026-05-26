# Suggested features

A roadmap of features inspired by Adobe Premiere, CapCut, Canva, InVideo, ClipChamp, and friends — filtered down to what makes sense for **vidclips's audience**: people making short-to-medium-length videos for **YouTube, TikTok, Instagram Reels, X, and LinkedIn**, who want something that stays simple by default but gets out of the way when they want a specific look.

The bar for adding anything here is: **does it serve a creator who isn't a video professional, or is it a power feature that a pro would reach for occasionally without polluting the default UI?**

---

## Current state (for reference)

vidclips already covers the foundation:

- Multi-track type-agnostic timeline, trim/move/split, drag-and-drop drops with overlap snapping
- Per-clip mute / hide, fade in/out with **adjustable curves** (applied to video, image, and audio)
- Editor mode with **per-clip move / scale / rotate** + a dotted exportable-region outline + zoomable canvas
- Aspect ratio + resolution + fps presets, project length, max fade duration
- Linked vs copied assets (great for large source media), portable single-folder project
- Cut tool, undo (50 actions), MP4 export with bundled ffmpeg
- Help dialog, themed scrollbars, persisted UI prefs

The schema is already extensible — most additions below are new clip fields or new clip *types*, not architectural rewrites.

---

## Roadmap tiers

| Tier | Theme | When |
| --- | --- | --- |
| **1. Social parity** | Things social creators expect in a video editor today. Skipping these is the most likely reason a TikTok creator would bounce. | Next |
| **2. Polish & speed** | Quality-of-life upgrades for users already in the app — make existing flows faster and feel more like a pro tool. | Soon |
| **3. Power tools** | Features that pros pay for elsewhere. Hidden behind toggles or extra panes so they don't intimidate beginners. | Later |
| **4. AI / smart** | The frontier. Highest user delight but highest implementation cost and infra dependency. | When justified |

---

## Tier 1 — Social parity

### Text overlays & captions

Every competitor has this; we don't. It's the #1 missing primitive.

- **Text as a clip type**: a new `text` asset type or a new `Clip.kind = 'text'` row with content, style, transform.
- **Style controls**: font family, size, color, outline / stroke, drop shadow, background pill, alignment.
- **Animated text presets**: typewriter, slide-in from any edge, pop-bounce, fade, karaoke highlight (word-by-word). Each is a curve over `opacity` / `translate` / `scale`.
- **Caption tracks**: a list of `{ start_ms, end_ms, text }` rows tied to a style. Render as overlays.
- **Auto-captions**: run the project's audio through a local Whisper model (or a remote API behind a setting) to populate a caption track. Editable after generation.
- **Position presets** ("top safe", "centered", "bottom third") that map to canvas-relative coordinates so they stay placed when aspect ratio changes.

> **Why this first:** TikTok / Reels / YouTube Shorts viewers watch with sound off. Open captions are the difference between a watchable post and skipped one.

### Aspect-ratio platform presets + safe zones

Already have the presets. Missing the social-specific layer:

- **Platform presets** in Settings: "TikTok / Reels (9:16, 60fps)", "YouTube Shorts (9:16, 60fps)", "YouTube (16:9, 30/60fps)", "X (16:9, 1:1)", "LinkedIn (16:9, 1:1)".
- **Safe-zone overlay** in editor mode: dashed inner rectangles showing where each platform's UI (caption strip, share buttons, profile chip) covers the video. Toggle per platform.
- **Auto-reframe**: when switching aspect ratios mid-project, offer a smart-crop that keeps subjects centered using face/object detection (Tier 4) or just re-center + scale (Tier 1).

### Transitions

Right now clips just hard-cut into each other. Most editors have a small library:

- **Cross-dissolve** (already half-done — equivalent to overlapping fades). Make it a first-class affordance: drag a transition icon onto the seam between two clips.
- **Slide**, **wipe**, **zoom**, **fade-to-black**, **glitch**. Each is a short overlap region with a filter graph mod.
- Store as `transition` rows: `{ before_clip_id, after_clip_id, kind, duration_ms, curve }`.

### Speed control (slow-mo + fast-forward)

A staple of every social editor — even basic ones.

- Add `playback_rate` to `Clip` (default 1.0).
- Renderer scales `el.playbackRate` for video, `setpts` for export.
- Slider in the Inspector: 0.25× → 4×. Above 1×, audio gets pitch-corrected (`atempo` chain in ffmpeg) or muted.
- **Freeze frame**: a clip with `playback_rate = 0` at a specific `in_ms`. Useful for emphasis cuts.

### Background music + audio crossfade

Music is most of the work for social.

- Show **waveforms** on audio clips on the timeline (generate at import via ffmpeg `showwavespic` JSON or `ebur128`).
- **Crossfade between audio clips** when they overlap (already works via fade math but needs UI guidance).
- **Background music ducking**: when a voiceover clip is present, automatically attenuate the music underneath by N dB. A checkbox on audio clips: "Duck when other audio plays".

### Subtitles styled like CapCut/TikTok

A specific call-out separate from generic captions:

- **Word-level highlight** (karaoke). Caption clips store words with per-word timings.
- **Animated styles**: bouncing pop, scale-on-emphasis, color flip.
- Render as a single styled overlay layer, not individual clips, so they don't clutter the timeline.

---

## Tier 2 — Polish & speed

### Snapping

When dragging a clip, snap to:
- The playhead
- Other clip edges on the same or adjacent tracks
- Ruler-second marks
- The project END marker

A toggleable feature (icon next to the cut/select tools). Snap distance ~8px configurable.

### Multi-select + ripple delete

- **Shift-click** or marquee-drag to select multiple clips.
- Operations apply to the whole selection: delete, move (preserving offsets), nudge, group.
- **Ripple delete** (default for Delete with a "delete and close gap" alt-modifier): delete the clip and shift everything after it left by the clip's duration.

### Markers / chapters

A new top-of-timeline ruler band where users can drop named markers. Use cases:
- YouTube chapter timestamps (export as `description.txt`)
- Cue points for sound effects
- "Editor notes"

### Track header polish

The left label column already exists. Add:
- Per-track **solo / mute** toggle (separate from per-clip mute)
- Per-track **lock** (prevents accidental drag/trim)
- Drag-to-reorder tracks
- Right-click menu (rename, delete, duplicate)

### Keyboard shortcuts for editing

- `J / K / L` for shuttle (rewind / pause / fast forward)
- `I / O` for in/out marker (used by the export-range feature)
- `S` for split at playhead (no need to switch tools)
- `M` for marker
- `[` / `]` for nudge clip start / end by one frame

### Snap-to-beat

Detect beats on the selected music track (ffmpeg `aresample` + `astats` or a small WASM beat-detection lib) and overlay them as ticks on the timeline. Snapping uses those ticks too. Massively improves the perceived quality of music-driven edits.

### Asset library improvements

- **Search and filter** (by type, by name, by linked-vs-copied).
- **Tags** / folders inside the project.
- **Recently used** section.
- **Replace asset**: swap one source for another while keeping the clip's edit decisions intact.

### Export improvements

- **In/out point export**: only render between markers, not the entire project length.
- **Export presets per platform**: codec, bitrate, container, fps locked to platform recommendations.
- **GIF export** (`gif` muxer, palette generation pass).
- **Still frame export** (PNG at the current playhead).

---

## Tier 3 — Power tools

### Color grading

Per-clip color controls:
- Brightness / contrast / saturation
- Temperature / tint
- Highlights / shadows / mids
- A **LUT loader** (`.cube` files via ffmpeg `lut3d`)

These are stored as new clip columns; the renderer applies via CSS filters in preview and matching ffmpeg filters in export.

### Adjustment layers

A new clip type that has no media but applies its effects to everything on tracks beneath it within its time range. Power users love this for color-grading whole sections at once.

### Keyframes for transform / opacity / volume

Currently `transform_x`, `transform_y`, `transform_scale`, `transform_rotation` are static per clip. Replace with **a list of `(time_ms, value)` keyframes** per parameter, interpolated per frame.

This unlocks:
- Animate position over a clip's duration
- Pan-and-zoom on still images ("Ken Burns")
- Volume automation
- Opacity ramps

Schema: a `keyframes` table with `(clip_id, property, time_ms, value, easing)` rows.

### Chroma key (green screen)

Even Canva has this now. A per-clip toggle that applies ffmpeg's `chromakey` (preview) / `colorkey` (export) with adjustable color picker, similarity, blend.

### Picture-in-picture templates

Pre-built compositions: two videos side-by-side, one in a corner overlay, three-up grid. Apply as a one-click layout that auto-fills with whichever clips the user has selected.

### Nested compositions / "pre-comps"

Treat a sub-section of the timeline as a single clip you can drop on another timeline. Lets users build a reusable intro/outro once and reuse it.

### Proxy media

For 4K source files, generate a 720p `.mp4` proxy at import. Playback uses the proxy; export uses the original. Big quality-of-life upgrade on weaker laptops.

### Audio mixer pane

A small mixer view showing each audio-bearing track's level meter with sliders for volume and pan. Currently each clip has only its own fade and `el.volume`; a per-track gain would help.

### Project templates

Save / load templates: a frozen timeline structure with placeholder clips you can swap with your media. Useful for repeating intro+content+CTA formats.

---

## Tier 4 — AI / smart features

These are the headline features in CapCut and InVideo. They're costly to ship well, so do them only when one of these is true: there's a clear quality bar, the local model is small enough to bundle, or a cloud opt-in is acceptable.

### Auto-captions (Whisper)

Bundle `whisper.cpp` or use a hosted endpoint. Generates a caption track from the audio. **Highest user value of any AI feature** because it removes a tedious task entirely.

### Smart reframe

Track the subject in a video clip (face / motion / saliency) and produce a per-frame crop window. Used when going landscape → portrait. Open-source approach: MediaPipe or a tiny ONNX model.

### Background remover

Per-frame matte for video (similar to Zoom backgrounds). RVM / MODNet ONNX models work locally.

### Text-to-speech voiceover

For creators who narrate. Bundle Piper or call out to ElevenLabs / OpenAI TTS as opt-in cloud. Generates an audio asset placed at the playhead.

### Auto-cut on silence

Analyze a voiceover clip and produce split points at silent gaps > N ms. One-click "remove silence" tightens up talking-head videos.

### "Magic" features to evaluate later

- **B-roll suggestions** (search stock for keywords detected in caption)
- **Auto-color match** between clips
- **Beat-synced cuts** ("apply music edit" — split clips on beats, auto-cut to length)

---

## Sharing, brand, and stock

### Brand kit

Per-project (and optionally per-user) saved styles:
- Brand colors palette
- Default fonts
- Logo watermark (optional opacity / position / scaling preset)
- Intro/outro template

### Stock asset browsers

Pexels / Pixabay / Unsplash for video and images, plus Free Music Archive for music. All have free APIs. Show a tab in the asset library. The user clicks to import (counts as a linked or copied asset).

### Sticker / shape library

A small library of shapes (rectangles, arrows, circles, callouts), emojis, and animated stickers. Stored as either SVG or animated PNG sequences, dropped as clips.

### Direct upload (or upload-helper)

A "Share" button at the end of export that opens the platform's upload page with the title/description pre-filled in clipboard or via deep link. Avoids OAuth scopes for v1; just makes the next step one less click.

---

## UX guardrails

To keep the app honest about being "simple by default":

1. **Default Inspector is short.** Power controls (color grading, keyframes, chroma key) live behind disclosure / "Advanced" toggles. The default UI shows what 80% of users use 80% of the time.
2. **Templates over knobs.** When introducing a new effect, ship a presets shelf before a fully-customisable panel. CapCut nails this — most users pick from presets, only some open the gear icon.
3. **Sensible auto.** Auto-detect aspect ratio from imported clips when the project is brand-new. Auto-suggest a project preset based on the first clip's resolution.
4. **No modal interruptions.** Long-running tasks (auto-captioning, AI background remove) report progress non-modally; the user can keep editing.
5. **One canonical place for each setting.** Don't duplicate fade duration in three menus. Project-wide things in Settings; per-clip things in Inspector; tool modes in the Timeline toolbar.

---

## Suggested next steps

If I were prioritising the next two milestones, I'd ship them like this:

**Milestone "Social MVP":**
1. Text overlays as clips (Tier 1)
2. Auto-captions (Tier 4 but high value)
3. Platform aspect presets + safe-zone overlays (Tier 1)
4. Transitions (cross-dissolve, slide, fade-to-black) (Tier 1)
5. Speed control (Tier 1)
6. Snapping (Tier 2)

**Milestone "Power user":**
1. Keyframes for transforms (Tier 3)
2. Audio waveform display + ducking (Tier 1)
3. Color grading (Tier 3)
4. Markers + chapter export (Tier 2)
5. Multi-select + ripple delete (Tier 2)
6. Proxy media (Tier 3)

Beyond that, the AI tier becomes the differentiator. Auto-captions alone would be a clear competitive feature against ClipChamp's local editing experience.
