import { getDb } from '../connection'
import type { Clip, ClipPatch, NewClipPayload } from '@shared/types'
import { getAsset } from './assetsRepo'

export function listClips(): Clip[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM clips ORDER BY track_id ASC, start_ms ASC')
    .all() as Clip[]
}

export function createClip(payload: NewClipPayload): Clip {
  const db = getDb()
  const asset = getAsset(payload.asset_id)
  if (!asset) throw new Error(`Asset ${payload.asset_id} not found`)

  const in_ms = payload.in_ms ?? 0
  const out_ms = payload.out_ms ?? asset.duration_ms

  const result = db
    .prepare(
      `INSERT INTO clips (
         track_id, asset_id, start_ms, in_ms, out_ms,
         fade_in_ms, fade_out_ms, z_index,
         muted, hidden, fade_curve_in, fade_curve_out,
         transform_x, transform_y, transform_scale, transform_rotation
       ) VALUES (
         @track_id, @asset_id, @start_ms, @in_ms, @out_ms,
         @fade_in_ms, @fade_out_ms, @z_index,
         @muted, @hidden, @fade_curve_in, @fade_curve_out,
         @transform_x, @transform_y, @transform_scale, @transform_rotation
       )`
    )
    .run({
      track_id: payload.track_id,
      asset_id: payload.asset_id,
      start_ms: payload.start_ms,
      in_ms,
      out_ms,
      fade_in_ms: payload.fade_in_ms ?? 0,
      fade_out_ms: payload.fade_out_ms ?? 0,
      z_index: payload.z_index ?? 0,
      muted: payload.muted ?? 0,
      hidden: payload.hidden ?? 0,
      fade_curve_in: payload.fade_curve_in ?? 0,
      fade_curve_out: payload.fade_curve_out ?? 0,
      transform_x: payload.transform_x ?? 0,
      transform_y: payload.transform_y ?? 0,
      transform_scale: payload.transform_scale ?? 1,
      transform_rotation: payload.transform_rotation ?? 0
    })
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as Clip
}

export function updateClip(id: number, patch: ClipPatch): Clip {
  const db = getDb()
  const fields = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined)
  if (fields.length === 0) {
    return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as Clip
  }
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`UPDATE clips SET ${setClause} WHERE id = @id`).run({ ...patch, id })
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as Clip
}

export function deleteClip(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM clips WHERE id = ?').run(id)
}
