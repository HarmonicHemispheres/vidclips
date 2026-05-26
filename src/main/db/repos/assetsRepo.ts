import { getDb } from '../connection'
import type { Asset } from '@shared/types'

export interface NewAssetRow {
  filename: string
  type: Asset['type']
  duration_ms: number
  original_path: string | null
  thumbnail_path: string | null
  width: number | null
  height: number | null
  sample_rate: number | null
  linked?: number
}

export function insertAsset(row: NewAssetRow): Asset {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO assets (filename, type, duration_ms, original_path, thumbnail_path, width, height, sample_rate, imported_at, linked)
       VALUES (@filename, @type, @duration_ms, @original_path, @thumbnail_path, @width, @height, @sample_rate, @imported_at, @linked)`
    )
    .run({ ...row, imported_at: Date.now(), linked: row.linked ?? 0 })
  return getAsset(Number(result.lastInsertRowid))!
}

export function getAsset(id: number): Asset | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Asset | undefined
}

export function listAssets(): Asset[] {
  const db = getDb()
  return db.prepare('SELECT * FROM assets ORDER BY imported_at DESC').all() as Asset[]
}

export function deleteAsset(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM assets WHERE id = ?').run(id)
}
