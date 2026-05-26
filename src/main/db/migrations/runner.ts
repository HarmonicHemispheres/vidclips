import type Database from 'better-sqlite3'
import { migrations } from './index'

function currentSchemaVersion(db: Database.Database): number {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : 0
}

function hasMetaTable(db: Database.Database): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'"
    )
    .get()
  return !!row
}

function columnsOf(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

/**
 * Idempotent safety net that adds expected columns even if a prior migration
 * was interrupted, hand-edited, or run against an older schema. Called after
 * the standard migration runner.
 */
function ensureExpectedColumns(db: Database.Database): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clips'")
    .get()
  if (!tableExists) return

  const clipsCols = columnsOf(db, 'clips')
  const addClipColumn = (name: string, decl: string): void => {
    if (!clipsCols.has(name)) {
      db.exec(`ALTER TABLE clips ADD COLUMN ${name} ${decl}`)
      clipsCols.add(name)
    }
  }
  addClipColumn('muted', 'INTEGER NOT NULL DEFAULT 0')
  addClipColumn('hidden', 'INTEGER NOT NULL DEFAULT 0')
  addClipColumn('fade_curve_in', 'REAL NOT NULL DEFAULT 0')
  addClipColumn('fade_curve_out', 'REAL NOT NULL DEFAULT 0')
  addClipColumn('transform_x', 'REAL NOT NULL DEFAULT 0')
  addClipColumn('transform_y', 'REAL NOT NULL DEFAULT 0')
  addClipColumn('transform_scale', 'REAL NOT NULL DEFAULT 1')
  addClipColumn('transform_rotation', 'REAL NOT NULL DEFAULT 0')

  const assetsCols = columnsOf(db, 'assets')
  if (!assetsCols.has('linked')) {
    db.exec('ALTER TABLE assets ADD COLUMN linked INTEGER NOT NULL DEFAULT 0')
  }
}

export function runMigrations(db: Database.Database): void {
  if (migrations.length === 0) return

  const current = hasMetaTable(db) ? currentSchemaVersion(db) : 0
  const pending = migrations.filter((m) => m.version > current)

  if (pending.length > 0) {
    const tx = db.transaction(() => {
      for (const m of pending) {
        try {
          db.exec(m.sql)
        } catch (err) {
          // Swallow "duplicate column name" errors so re-running a partial
          // migration doesn't permanently brick the project.
          const msg = (err as Error).message
          if (!/duplicate column name/i.test(msg)) {
            throw err
          }
        }
        if (m.version > 1) {
          db.prepare(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)"
          ).run(String(m.version))
        }
      }
    })
    tx()
  }

  // Safety net: ensure all known columns exist regardless of recorded version.
  ensureExpectedColumns(db)
}
