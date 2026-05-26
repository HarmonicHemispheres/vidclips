import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { runMigrations } from './migrations/runner'

const PROJECT_DB_NAME = 'project.db'
const ASSETS_DIR = 'assets'
const THUMBS_DIR = '.thumbs'

let currentDb: Database.Database | null = null
let currentDir: string | null = null

export class DbError extends Error {}

export function getDb(): Database.Database {
  if (!currentDb) throw new DbError('No project is open')
  return currentDb
}

export function getProjectDir(): string {
  if (!currentDir) throw new DbError('No project is open')
  return currentDir
}

export function isOpen(): boolean {
  return currentDb !== null
}

export function assetsDir(): string {
  return path.join(getProjectDir(), ASSETS_DIR)
}

export function thumbsDir(): string {
  return path.join(getProjectDir(), ASSETS_DIR, THUMBS_DIR)
}

function ensureProjectFolderStructure(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, ASSETS_DIR), { recursive: true })
  fs.mkdirSync(path.join(dir, ASSETS_DIR, THUMBS_DIR), { recursive: true })
}

function openConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export interface OpenProjectResult {
  dir: string
  created: boolean
}

/**
 * Accepts either a folder path containing project.db, or a path to project.db directly.
 * Returns the resolved project folder.
 */
function resolveProjectDir(input: string): string {
  if (fs.existsSync(input) && fs.statSync(input).isFile()) {
    return path.dirname(input)
  }
  return input
}

export function createProject(dir: string, projectName: string): OpenProjectResult {
  closeProject()
  ensureProjectFolderStructure(dir)
  const dbPath = path.join(dir, PROJECT_DB_NAME)
  if (fs.existsSync(dbPath)) {
    throw new DbError(`A project already exists at ${dbPath}`)
  }
  const db = openConnection(dbPath)
  runMigrations(db)
  const now = Date.now()
  const insertMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
  const tx = db.transaction(() => {
    insertMeta.run('project_name', projectName)
    insertMeta.run('fps', '30')
    insertMeta.run('width', '1920')
    insertMeta.run('height', '1080')
    insertMeta.run('duration_ms', '60000')
    insertMeta.run('max_fade_ms', '7000')
    insertMeta.run('created_at', String(now))
    insertMeta.run('modified_at', String(now))
  })
  tx()

  currentDb = db
  currentDir = dir
  return { dir, created: true }
}

export function openProject(input: string): OpenProjectResult {
  closeProject()
  const dir = resolveProjectDir(input)
  const dbPath = path.join(dir, PROJECT_DB_NAME)
  if (!fs.existsSync(dbPath)) {
    throw new DbError(`No project.db found at ${dbPath}`)
  }
  ensureProjectFolderStructure(dir)
  const db = openConnection(dbPath)
  runMigrations(db)
  currentDb = db
  currentDir = dir
  return { dir, created: false }
}

export function closeProject(): void {
  if (currentDb) {
    currentDb.close()
    currentDb = null
  }
  currentDir = null
}

export function touchModified(): void {
  if (!currentDb) return
  currentDb
    .prepare("UPDATE meta SET value = ? WHERE key = 'modified_at'")
    .run(String(Date.now()))
}
