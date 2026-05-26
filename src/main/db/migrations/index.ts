/**
 * Inline migrations. We don't load .sql from disk because electron-vite
 * doesn't copy them into the build output. Add new migrations by appending
 * to this array with the next sequential version number.
 */

export interface Migration {
  version: number
  name: string
  sql: string
}

const m001_init: Migration = {
  version: 1,
  name: 'init',
  sql: `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('video','image','audio')),
  duration_ms INTEGER NOT NULL,
  original_path TEXT,
  thumbnail_path TEXT,
  width INTEGER,
  height INTEGER,
  sample_rate INTEGER,
  imported_at INTEGER NOT NULL
);

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('video','audio')),
  order_index INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  start_ms INTEGER NOT NULL,
  in_ms INTEGER NOT NULL DEFAULT 0,
  out_ms INTEGER NOT NULL,
  fade_in_ms INTEGER NOT NULL DEFAULT 0,
  fade_out_ms INTEGER NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_clips_track_start ON clips(track_id, start_ms);
CREATE INDEX idx_tracks_order ON tracks(order_index);

INSERT INTO meta (key, value) VALUES ('schema_version', '1');

INSERT INTO tracks (kind, order_index, name) VALUES
  ('video', 0, 'V1'),
  ('video', 1, 'V2'),
  ('audio', 2, 'A1'),
  ('audio', 3, 'A2');
`
}

const m002_clip_flags: Migration = {
  version: 2,
  name: 'clip_flags',
  sql: `
ALTER TABLE clips ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN fade_curve_in REAL NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN fade_curve_out REAL NOT NULL DEFAULT 0;
`
}

const m003_linked_assets: Migration = {
  version: 3,
  name: 'linked_assets',
  sql: `
ALTER TABLE assets ADD COLUMN linked INTEGER NOT NULL DEFAULT 0;
`
}

const m004_transforms: Migration = {
  version: 4,
  name: 'clip_transforms',
  sql: `
ALTER TABLE clips ADD COLUMN transform_x REAL NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN transform_y REAL NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN transform_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE clips ADD COLUMN transform_rotation REAL NOT NULL DEFAULT 0;
`
}

export const migrations: Migration[] = [
  m001_init,
  m002_clip_flags,
  m003_linked_assets,
  m004_transforms
].sort((a, b) => a.version - b.version)
