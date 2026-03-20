#!/usr/bin/env node
'use strict'

const { WebSocketServer } = require('ws')
const { spawn } = require('child_process')

const PORT = 8765

const wss = new WebSocketServer({ port: PORT })

console.log(`[executable-code-block] WebSocket server listening on ws://localhost:${PORT}`)

wss.on('connection', (ws) => {
  /** @type {Map<string, import('child_process').ChildProcess>} */
  const procs = new Map()

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }

    const { id, type, code } = msg
    if (!id) return

    // Handle kill request
    if (type === 'kill') {
      const proc = procs.get(id)
      if (proc) killProc(proc)
      return
    }

    if (typeof code !== 'string') return

    // Kill any existing process for this id
    const existing = procs.get(id)
    if (existing) {
      killProc(existing)
      procs.delete(id)
    }

    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd' : 'bash'
    const args = isWindows ? ['/c', code] : ['-c', code]

    let proc
    try {
      proc = spawn(shell, args, { env: process.env, detached: !isWindows })
    } catch (err) {
      send(ws, { id, type: 'stderr', data: `Failed to spawn shell: ${err.message}\n` })
      send(ws, { id, type: 'exit', code: 1 })
      return
    }

    procs.set(id, proc)

    proc.stdout.on('data', (chunk) => {
      send(ws, { id, type: 'stdout', data: chunk.toString() })
    })

    proc.stderr.on('data', (chunk) => {
      send(ws, { id, type: 'stderr', data: chunk.toString() })
    })

    proc.on('close', (exitCode) => {
      send(ws, { id, type: 'exit', code: exitCode ?? 0 })
      procs.delete(id)
    })

    proc.on('error', (err) => {
      send(ws, { id, type: 'stderr', data: `Process error: ${err.message}\n` })
      send(ws, { id, type: 'exit', code: 1 })
      procs.delete(id)
    })
  })

  ws.on('close', () => {
    // Kill all processes when client disconnects
    for (const proc of procs.values()) {
      killProc(proc)
    }
    procs.clear()
  })
})

/**
 * Kill a process and its entire process group (Unix) or just the process (Windows).
 * @param {import('child_process').ChildProcess} proc
 */
function killProc(proc) {
  try {
    if (process.platform !== 'win32' && proc.pid) {
      process.kill(-proc.pid, 'SIGTERM')
    } else {
      proc.kill()
    }
  } catch (_) {
    try { proc.kill() } catch (_) {}
  }
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {object} payload
 */
function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}
