import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const cs = Math.floor((ms % 1000) / 10)
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`
  return `${pad(m)}:${pad(s)}.${pad(cs)}`
}
