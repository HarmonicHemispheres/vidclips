import { getDb } from '../connection'
import type { Track, TrackKind } from '@shared/types'

export function listTracks(): Track[] {
  const db = getDb()
  return db.prepare('SELECT * FROM tracks ORDER BY order_index ASC').all() as Track[]
}

export function createTrack(kind: TrackKind, name: string): Track {
  const db = getDb()
  const maxRow = db.prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM tracks').get() as {
    m: number
  }
  const nextOrder = maxRow.m + 1
  const result = db
    .prepare('INSERT INTO tracks (kind, order_index, name) VALUES (?, ?, ?)')
    .run(kind, nextOrder, name)
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(result.lastInsertRowid) as Track
}

export function reorderTracks(ids: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE tracks SET order_index = ? WHERE id = ?')
  const tx = db.transaction(() => {
    ids.forEach((id, i) => stmt.run(i, id))
  })
  tx()
}

export function deleteTrack(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id)
}

export interface TrackPatch {
  name?: string
  order_index?: number
}

export function updateTrack(id: number, patch: TrackPatch): Track {
  const db = getDb()
  const fields = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  )
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
    db.prepare(`UPDATE tracks SET ${setClause} WHERE id = @id`).run({ ...patch, id })
  }
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track
}
