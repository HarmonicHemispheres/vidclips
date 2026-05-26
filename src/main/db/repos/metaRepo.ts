import { getDb, getProjectDir } from '../connection'
import type { ProjectMeta } from '@shared/types'

export function getMeta(): ProjectMeta {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM meta').all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (k: string, fallback = 0) => parseInt(map.get(k) ?? String(fallback), 10)
  return {
    schema_version: num('schema_version', 1),
    project_name: map.get('project_name') ?? 'Untitled',
    fps: num('fps', 30),
    width: num('width', 1920),
    height: num('height', 1080),
    duration_ms: num('duration_ms', 60000),
    max_fade_ms: num('max_fade_ms', 7000),
    created_at: num('created_at', Date.now()),
    modified_at: num('modified_at', Date.now()),
    project_dir: getProjectDir()
  }
}

export function setMetaValue(key: string, value: string | number): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value))
}

export interface MetaPatch {
  project_name?: string
  width?: number
  height?: number
  fps?: number
  duration_ms?: number
  max_fade_ms?: number
}

export function updateMeta(patch: MetaPatch): ProjectMeta {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      setMetaValue(k, v)
    }
  })
  tx()
  return getMeta()
}
