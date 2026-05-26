#!/usr/bin/env node
/**
 * Launches a node_modules .bin command after sanitizing the environment.
 *
 * Electron treats ELECTRON_RUN_AS_NODE as "present means yes" — setting it
 * to "" does NOT unset it. We need to actually delete it from process.env
 * before spawning electron-vite / electron-builder.
 */

const { spawn } = require('node:child_process')
const path = require('node:path')

delete process.env.ELECTRON_RUN_AS_NODE

const [, , binName, ...rest] = process.argv
if (!binName) {
  console.error('Usage: node scripts/run.js <bin> [args...]')
  process.exit(2)
}

const isWin = process.platform === 'win32'
const cmd = path.join(
  'node_modules',
  '.bin',
  isWin ? `${binName}.cmd` : binName
)

const child = spawn(cmd, rest, {
  stdio: 'inherit',
  env: process.env,
  shell: isWin // .cmd needs shell on Windows
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 0)
  }
})
