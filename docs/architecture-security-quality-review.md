# Architecture, Security & Quality Review

**Scope:** All TypeScript/TSX under `src/` plus build config (`electron.vite.config.ts`,
`electron-builder.yml`, `package.json`, `scripts/run.js`). ~6,250 LOC across main,
preload, renderer, and shared layers.

**Reviewed at commit:** `claude/architecture-security-quality-review-UMubi`
(working tree clean).

---

## 1. Architecture

### What works well

- **Clean three-process layout.** `main`, `preload`, `renderer`, and `shared` are
  kept separate; the preload uses `contextBridge.exposeInMainWorld` and
  `contextIsolation: true` + `nodeIntegration: false`, which is the modern
  Electron baseline (`src/main/index.ts:69-74`, `src/preload/index.ts:92`).
- **Project-as-folder model is well executed.** A SQLite file plus an
  `assets/` directory is opened/closed atomically through
  `src/main/db/connection.ts`. WAL mode and foreign keys are enabled on every
  open (`connection.ts:43-48`). No global app state leaks between projects.
- **Schema migrations are versioned and idempotent.**
  `src/main/db/migrations/runner.ts` runs pending migrations in a transaction,
  tolerates partial replays via the `duplicate column name` swallow, and has a
  belt-and-suspenders `ensureExpectedColumns` safety net that re-adds known
  columns regardless of recorded version. Good defensive design for a
  user-data-on-disk product.
- **Single source of truth for fade math.** `src/shared/fadeMath.ts` is
  imported by both `PlaybackEngine` (preview) and `filterGraph` (export). This
  is exactly the right factoring to keep preview matching export.
- **IPC surface is thin and consistent.** `src/main/ipc.ts` is a flat fan-out
  to repos / pipeline modules with no business logic inline. Easy to audit.
- **Store/UI is decoupled from persistence.** Zustand store delegates all
  writes through `window.api.*`; optimistic updates are explicit
  (`updateClip(..., { optimistic: true })` in `store/index.ts:224-232`).

### Concerns

#### A1. Renderer components carry too much logic (medium)
Several files mix presentational concerns, gesture math, IPC, and undo
bookkeeping in one place:

| File | LOC | Mixed responsibilities |
| --- | --- | --- |
| `renderer/components/Preview/Preview.tsx` | 523 | layout + media element registration + playback rAF + drag-sync state machine |
| `renderer/components/Preview/EditorOverlay.tsx` | 398 | rotation/scale/move drag math + history + optimistic state |
| `renderer/components/Timeline/Clip.tsx` | 377 | rendering + per-edge resize math + fade gradient rendering + history |
| `renderer/components/Timeline/Timeline.tsx` | 354 | ruler + project-end drag + zoom + tool mode UI |

These will become hard to evolve without tests. Suggested split:
- Extract pointer-drag controllers into hooks under `src/renderer/hooks/`
  (e.g. `useClipResize`, `useLayerTransform`).
- Move the playback rAF loop and media-element sync engine into a single
  non-component module that the `Preview` component just observes.

#### A2. Undo is closure-based; restored entities get fresh ids (medium)
`store.deleteClip` undo path creates a new clip via
`window.api.clips.create(...)` (`Inspector.tsx:88-109`,
`useKeyboardShortcuts.ts:37-54`). The new clip has a new database id, so any
previously-pushed history entry that referenced the original id silently
becomes a no-op (`DELETE FROM clips WHERE id = ?` on a missing id is a noop).
Today nothing chains across that boundary because there is no redo, but if
redo is added, or two undo entries reference the same clip across a delete,
the state will drift.

Recommendation: track id remaps in the undo closure, or model history as
inverse-ops on a typed log so the runner can re-resolve ids.

#### A3. `withWrite` doesn't await async work (low)
`src/main/ipc.ts:33-37` wraps every mutating handler in
`withWrite(() => fn())` then calls `touchModified()` *synchronously* on the
returned value. For async handlers (`assets:import`, `assets:link`,
`clips:create`, etc.) the returned value is a `Promise` — `touchModified()`
runs before the write actually lands. `modified_at` is therefore incorrect
for any async write. Fix:

```ts
function withWrite<T>(fn: () => T | Promise<T>): Promise<T> | T {
  const r = fn()
  if (r && typeof (r as Promise<T>).then === 'function') {
    return (r as Promise<T>).then((v) => { touchModified(); return v })
  }
  touchModified()
  return r
}
```

#### A4. `tracks.kind` is dead metadata (low)
Migration 001 seeds tracks with `kind = 'video'` or `'audio'`, but the
renderer treats tracks as type-agnostic (any asset on any track —
`PlaybackEngine.ts:62-67`, `filterGraph.ts:68-72`,
`Inspector.tsx:112-115`), and `addTrack` always creates `'video'`
(`store/index.ts:183-189`). Either remove the column, or actually use it to
constrain drops.

#### A5. Two URL shapes for media (low)
`vidclips://asset/...` for copied assets and `vidclips://ext/...` for linked
assets. The `ext` path uses absolute paths with no project anchoring; see
**S1**. Worth unifying behind a single resolver that the renderer doesn't
have to know about.

#### A6. No tests, no lint, no CI (medium)
`package.json` only has `dev`, `build`, `preview`, `typecheck*`, `package`,
`postinstall`. There is no test framework wired up, no ESLint/Prettier
config, and no `.github/workflows`. For a Windows-only portable app this is
defensible at v0.1, but the timeline geometry, fade math, and filter-graph
construction are all pure functions with no UI dependency and would benefit
enormously from a Vitest suite.

---

## 2. Security

The app runs locally with no network surface beyond `connect-src 'self' ws:
http://localhost:* vidclips:` in the CSP. Most findings here matter only if
the renderer is compromised — which in an Electron app is a real concern
(malicious media, vulnerable transitive dep, etc.).

#### S1. `vidclips://ext/<absolute-path>` reads any file on disk (high)
`src/main/index.ts:35-38`:
```ts
if (host === 'ext') {
  const abs = path.resolve(rel)
  return net.fetch(pathToFileURL(abs).toString())
}
```
There is no allowlist check. The intent is to support linked assets
(referenced in place), but the handler accepts any path the renderer
constructs. A compromised renderer can `fetch('vidclips://ext/etc/passwd')`,
`vidclips://ext/Users/you/.ssh/id_rsa`, `vidclips://ext/C:/Windows/...`,
etc. Compare with the `asset` branch immediately above, which correctly
guards against escape via `path.resolve` containment check.

**Recommended fix:** maintain an in-memory allowlist of linked asset paths
(populated from `assets.linked = 1` rows on project open and when a link is
added) and reject any `ext` request not in that set:

```ts
const linkedPaths = new Set<string>() // populated from assetsRepo
// ...
if (host === 'ext') {
  const abs = path.resolve(rel)
  if (!linkedPaths.has(abs)) return new Response('Forbidden', { status: 403 })
  return net.fetch(pathToFileURL(abs).toString())
}
```

#### S2. SQL identifier injection in `updateClip` / `updateTrack` (high)
`src/main/db/repos/clipsRepo.ts:55-64` and
`src/main/db/repos/tracksRepo.ts:40-50` both build their `SET` clause by
joining raw object keys:
```ts
const fields = Object.keys(patch).filter((k) => (patch as any)[k] !== undefined)
const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
db.prepare(`UPDATE clips SET ${setClause} WHERE id = @id`).run({ ...patch, id })
```
Values are bound parameters (safe), but the *field names* are interpolated.
The keys come from IPC patches sent by the renderer. A compromised renderer
can send a key like `"x = (SELECT value FROM meta), foo"`  which will be
spliced verbatim into the SQL. Better-sqlite3 will reject the statement if
the resulting SQL is invalid, but a carefully-crafted key (e.g. one that
matches a real column followed by a comma and another expression) can still
mutate other columns. This is a real injection sink under our threat model
(renderer-compromise → main process privilege).

**Recommended fix:** allowlist columns per repo:
```ts
const ALLOWED_CLIP_FIELDS = new Set([
  'track_id','asset_id','start_ms','in_ms','out_ms','fade_in_ms','fade_out_ms',
  'z_index','muted','hidden','fade_curve_in','fade_curve_out',
  'transform_x','transform_y','transform_scale','transform_rotation'
])
const fields = Object.keys(patch).filter(
  (k) => ALLOWED_CLIP_FIELDS.has(k) && (patch as any)[k] !== undefined
)
```

The same fix applies to `tracksRepo.updateTrack`.

#### S3. `sandbox: false` (medium)
`src/main/index.ts:71`: `sandbox: false` is set explicitly. With
`contextIsolation: true` and `nodeIntegration: false`, the renderer doesn't
get a Node global, but the renderer process is still un-sandboxed at the OS
level — a Chromium RCE has a wider blast radius. Unless the preload requires
something that doesn't work under the sandbox (it doesn't, as written; it
only uses `contextBridge` and `ipcRenderer`), set `sandbox: true`.

#### S4. `shell.openExternal(details.url)` opens any URL (medium)
`src/main/index.ts:79-82`:
```ts
win.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url)
  return { action: 'deny' }
})
```
`details.url` is renderer-controlled. A compromised renderer can pop
`file:///...` URLs to launch the user's default handler for arbitrary files,
or `javascript:` / `data:` / custom-scheme URLs. Validate the URL:
```ts
const u = new URL(details.url)
if (u.protocol === 'http:' || u.protocol === 'https:') {
  shell.openExternal(details.url)
}
return { action: 'deny' }
```

#### S5. CSP allows `'unsafe-inline'` (low)
`src/renderer/index.html:7`:
```
default-src 'self' 'unsafe-inline' data: blob: vidclips:;
```
`'unsafe-inline'` defeats the main XSS mitigation. With Tailwind producing
class-based styles this is workable, but inline styles are present in many
components (perfectly normal React). A tighter approach:
- Split out explicit directives:
  `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: vidclips:;`
- Drop `unsafe-inline` from script-src entirely; inline styles are needed
  for React's `style=` attributes.

#### S6. IPC handlers don't validate argument shapes (medium)
Every handler in `src/main/ipc.ts` trusts the renderer to send well-formed
payloads. With `contextIsolation: true` and the preload's typed API this is
fine for normal usage, but it leaves no defense-in-depth. Concrete examples:
- `assets:import` accepts `filePaths: string[]` and copies each into the
  project. A compromised renderer can pass arbitrary host paths, exfiltrating
  copies of `~/Documents/...` into the project's `assets/` folder.
- `clips:create` / `clips:update` patches are forwarded to the DB without
  numeric range checks (see also **S7**).
- `dialog:pickFiles` accepts a filters array that the renderer can shape
  freely (low risk, but possible UI confusion).

Recommend a small validator layer (zod, or hand-rolled) per IPC channel.

#### S7. `NaN` / `Infinity` numbers flow into the filter graph (low)
`src/main/export/filterGraph.ts` stringifies clip numbers directly into the
filter_complex string (e.g. `setpts=PTS-STARTPTS,scale=iw*${userScale}:...`
on line 127, `rotate=${rad}` on line 134). If any of these is `NaN` or
`Infinity` (possible if the renderer ever wrote one), the export silently
emits a malformed filter. ffmpeg is invoked via `spawn` with an arg array
(no shell), so there is no command injection — but the export will fail in
a confusing way. Validate at the IPC boundary or coerce in the graph
builder.

#### S8. Renderer media list is built without a deletion sweep (low)
`src/renderer/components/Preview/Preview.tsx:51` keeps a `Map<number, string>`
of media URLs that only ever grows. After many add/remove cycles the map
keeps stale URL strings around. Memory pressure is small (strings), but it's
a leak. Sweep `mediaUrls` whenever `assets` changes.

#### S9. Recent-projects list is unbounded by user, but bounded by code (informational)
`src/main/recent.ts` caps the list at 10 entries — fine. Stored in `userData`
as plain JSON. No path validation when an entry is later passed to
`openProject` (the user clicked it; this is the user's own data). Acceptable.

#### S10. Bundled binary integrity (informational)
`ffmpeg-static` and `ffprobe-static` ship the binaries inside the npm
package; they are unpacked from asar at build time (`electron-builder.yml`
lines 13-16) but are not signature-checked at runtime. Standard practice
for Electron desktop apps; raises only if you ever support out-of-band
binary updates.

---

## 3. Code quality

### Strengths

- **Type discipline.** `tsconfig.*.json` enables `strict: true` for both
  node and web builds. The shared types in `src/shared/types.ts` are the
  authoritative shape used end-to-end. No `any` in domain types.
- **Pure-function factoring of hot logic.** `lib/timeline.ts`,
  `shared/fadeMath.ts`, and `export/filterGraph.ts` are all stateless and
  easy to test.
- **No dead `console.log` noise.** Logging is intentional
  (`console.error('Failed to resolve ffmpeg/ffprobe:', err)`).

### Issues

#### Q1. No automated tests (medium)
There's no test runner installed, no test directory, and no test scripts.
For an editor whose correctness depends on timeline geometry, fade math, and
ffmpeg filter graph generation, this is the single highest-leverage area to
invest in. Suggested first targets:
- `shared/fadeMath.ts` — five small pure functions.
- `lib/timeline.ts` — `overlapsAny`, `findValidStart`, `maxOutForRightTrim`,
  `minStartForLeftTrim`.
- `export/filterGraph.ts` — given a fixture timeline, snapshot-test the
  emitted filter_complex string.
- `db/migrations/runner.ts` — open a fresh DB, run all migrations, assert
  schema; then run again, assert no-op.

#### Q2. No linter / formatter wired up (low)
No `.eslintrc`, no Prettier config, no `lint` script. The code is well
formatted, but reliance on author discipline doesn't survive contributors.
`eslint-plugin-react-hooks` would catch missing/extra dependencies in the
many useEffect blocks in `Preview.tsx`.

#### Q3. Aliases used inconsistently (low)
`@shared`, `@renderer`, `@main`, `@` are configured but many files use
relative paths (`../store`, `../../store`, `../../../shared/...`). Pick one
style.

#### Q4. Subtle `optimistic` default (low)
`store.updateClip` treats `opts?.optimistic !== false` as truthy
(`store/index.ts:224-225`), meaning omitting `opts` opts you in. Several
call sites pass `{ optimistic: false }` to suppress; this reverse-default
is easy to misread. Suggest changing to `opts?.optimistic === true` and
opting in explicitly.

#### Q5. `dialog:pickFiles` filter list is duplicated (low)
`src/main/ipc.ts:151-165` hard-codes the supported extension list as a
default; `src/main/assets/importer.ts:10-12` keeps three `Set`s of supported
extensions. They're nearly identical (`importer.ts` includes `.avi` and
`.bmp`, `ipc.ts` does not). Extract to one shared constant.

#### Q6. `addTrack` always creates 'video' (low)
`src/renderer/store/index.ts:183-189` — kind is hard-coded. Either remove
the kind column (see **A4**) or surface a UI choice.

#### Q7. `runner.ts` allows concurrent exports (low)
`src/main/export/runner.ts:13` holds `activeProc` as a module-level
singleton. `runExport` overwrites it without checking for an existing run.
Two concurrent exports (e.g., user double-clicks Export) will leak the
first ffmpeg process and only the second is cancellable. Reject the second
call:
```ts
if (activeProc) throw new Error('An export is already running')
```

#### Q8. `mediaUrls` ref isn't reactive (low)
`Preview.tsx:51` stores resolved media URLs in a `useRef(Map)`. New assets
added during the same project lifetime can fail to resolve before a render
that needs them, and a component re-render won't trigger because the map is
not in React state. The `useEffect` on line 58 reads asynchronously, so the
*next* render after the URL lands picks it up — which is what the code
relies on, indirectly via the `assets` dep changing. Tolerable today; would
become fragile if assets were ever updated in place (e.g., re-thumbnailing).

#### Q9. `electron.vite.config.ts` doesn't externalize native modules in main (informational)
`externalizeDepsPlugin()` covers this; just noting it because `better-sqlite3`
and the ffmpeg static packages are correctly handled via `asarUnpack` in
`electron-builder.yml:13-16`. The build pipeline is consistent here.

#### Q10. README "tested on Windows 11" but `process.platform` checks suggest cross-platform intent (informational)
`src/main/index.ts:94-95` only sets the AppUserModelId on Windows, and
`src/main/recent.ts` uses `app.getPath('userData')` which is portable. The
electron-builder config only targets `--win portable`. If macOS/Linux is
ever a goal, the code is mostly ready; the linked-asset URL handling on
non-Windows needs a test pass (paths like `/Users/...` go through
`encodeURIComponent` per segment, then `path.resolve` — looks correct).

---

## 4. Prioritized action list

| # | Severity | Effort | Item |
| --- | --- | --- | --- |
| 1 | High | S | **S2** Allowlist column names in `updateClip`/`updateTrack`. |
| 2 | High | S | **S1** Restrict `vidclips://ext/` to known linked asset paths. |
| 3 | Medium | S | **S3** Set `sandbox: true` on the BrowserWindow. |
| 4 | Medium | S | **S4** Validate URL protocol in `setWindowOpenHandler`. |
| 5 | Medium | M | **Q1** Add Vitest + cover `fadeMath`, `timeline`, `filterGraph`, migrations. |
| 6 | Medium | S | **A3** Make `withWrite` await async results. |
| 7 | Medium | M | **S6** Add per-channel argument validation at the IPC boundary. |
| 8 | Low | S | **S5** Tighten CSP — split directives, drop `unsafe-inline` for scripts. |
| 9 | Low | S | **Q7** Reject overlapping export starts. |
| 10 | Low | S | **S7** Coerce/validate clip numbers before they reach `filterGraph`. |
| 11 | Low | M | **A1** Extract drag controllers from Preview/EditorOverlay/Clip into hooks. |
| 12 | Low | S | **A4 / Q6** Decide on tracks.kind — remove or enforce. |

Items 1, 2, and 6 are small mechanical fixes with the highest
security/correctness payoff and would be a good first PR off this review.
