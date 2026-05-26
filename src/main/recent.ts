import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { RecentProject } from '@shared/types'

const FILENAME = 'recent.json'
const MAX_ENTRIES = 10

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME)
}

export function listRecent(): RecentProject[] {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as RecentProject[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushRecent(p: RecentProject): void {
  const list = listRecent().filter((r) => r.path !== p.path)
  list.unshift(p)
  const trimmed = list.slice(0, MAX_ENTRIES)
  fs.mkdirSync(path.dirname(filePath()), { recursive: true })
  fs.writeFileSync(filePath(), JSON.stringify(trimmed, null, 2))
}

export function removeRecent(projectPath: string): void {
  const list = listRecent().filter((r) => r.path !== projectPath)
  fs.writeFileSync(filePath(), JSON.stringify(list, null, 2))
}
