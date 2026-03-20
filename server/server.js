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

    // Handle kill request (SIGINT)
    if (type === 'kill') {
      const proc = procs.get(id)
      if (proc) {
        try { proc.kill('SIGINT') } catch (_) {}
      }
      return
    }

    if (typeof code !== 'string') return

    // Kill any existing process for this id
    const existing = procs.get(id)
    if (existing) {
      try { existing.kill() } catch (_) {}
      procs.delete(id)
    }

    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd' : 'bash'
    const args = isWindows ? ['/c', code] : ['-c', code]

    let proc
    try {
      proc = spawn(shell, args, { env: process.env })
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
      try { proc.kill() } catch (_) {}
    }
    procs.clear()
  })
})

/**
 * @param {import('ws').WebSocket} ws
 * @param {object} payload
 */
function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}
