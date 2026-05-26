export type AssetType = 'video' | 'image' | 'audio'
export type TrackKind = 'video' | 'audio'

export interface ProjectMeta {
  schema_version: number
  project_name: string
  fps: number
  width: number
  height: number
  duration_ms: number
  max_fade_ms: number
  created_at: number
  modified_at: number
  project_dir: string
}

export interface Asset {
  id: number
  /** For copied assets: filename relative to assets/. For linked: absolute source path. */
  filename: string
  type: AssetType
  duration_ms: number
  original_path: string | null
  thumbnail_path: string | null
  width: number | null
  height: number | null
  sample_rate: number | null
  imported_at: number
  /** 0 = copied into project assets/. 1 = referenced in place. */
  linked: number
}

export interface Track {
  id: number
  kind: TrackKind
  order_index: number
  name: string
}

export interface Clip {
  id: number
  track_id: number
  asset_id: number
  start_ms: number
  in_ms: number
  out_ms: number
  fade_in_ms: number
  fade_out_ms: number
  z_index: number
  muted: number
  hidden: number
  fade_curve_in: number
  fade_curve_out: number
  /** Canvas-pixel offset from the canvas center. */
  transform_x: number
  transform_y: number
  /** Multiplier on the clip's natural fit-size (1 = unchanged). */
  transform_scale: number
  /** Rotation in degrees, clockwise. */
  transform_rotation: number
}

export interface NewClipPayload {
  track_id: number
  asset_id: number
  start_ms: number
  in_ms?: number
  out_ms?: number
  fade_in_ms?: number
  fade_out_ms?: number
  z_index?: number
  muted?: number
  hidden?: number
  fade_curve_in?: number
  fade_curve_out?: number
  transform_x?: number
  transform_y?: number
  transform_scale?: number
  transform_rotation?: number
}

export type ClipPatch = Partial<Omit<Clip, 'id'>>

export interface ImportedAssetResult {
  asset: Asset
  warnings: string[]
}

export interface ExportOptions {
  width?: number
  height?: number
  fps?: number
  crf?: number
}

export interface ExportProgress {
  frame: number
  fps: number
  time_ms: number
  total_ms: number
  percent: number
  speed: number
}

export interface RecentProject {
  path: string
  name: string
  last_opened: number
}
