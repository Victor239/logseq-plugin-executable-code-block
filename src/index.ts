import '@logseq/libs'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecState {
  slot: string
  output: string
  running: boolean
  parentUuid: string
  exitCode: number | null
}

// ── State ─────────────────────────────────────────────────────────────────────

const execState = new Map<string, ExecState>()

// ── WebSocket ─────────────────────────────────────────────────────────────────

const WS_URL = 'ws://localhost:8765'
let ws: WebSocket | null = null
let wsConnecting = false

function connectWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws?.readyState === WebSocket.OPEN) {
      resolve(ws)
      return
    }
    if (wsConnecting) {
      const poll = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          clearInterval(poll)
          resolve(ws)
        }
      }, 100)
      setTimeout(() => {
        clearInterval(poll)
        reject(new Error('Connection timeout'))
      }, 3000)
      return
    }

    wsConnecting = true
    const socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      ws = socket
      wsConnecting = false
      resolve(socket)
    }

    socket.onmessage = (event) => {
      try {
        const msg: { id: string; type: 'stdout' | 'stderr' | 'exit'; data?: string; code?: number } =
          JSON.parse(event.data)
        const s = execState.get(msg.id)
        if (!s) return

        if (msg.type === 'stdout' || msg.type === 'stderr') {
          s.output += msg.data ?? ''
          renderExecUI(msg.id)
        } else if (msg.type === 'exit') {
          s.running = false
          s.exitCode = msg.code ?? 0
          renderExecUI(msg.id)
        }
      } catch (_) {
        // ignore malformed messages
      }
    }

    socket.onerror = () => {
      ws = null
      wsConnecting = false
      reject(new Error('WebSocket error'))
    }

    socket.onclose = () => {
      ws = null
      wsConnecting = false
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CODE_BLOCK_REGEX = /^```(?:shell|bash|sh)\r?\n([\s\S]*?)\r?\n```/m
const SHELL_LANGS = new Set(['shell', 'bash', 'sh'])

function isDBCodeBlock(block: Record<string, unknown>): boolean {
  const displayType = String(
    block[':logseq.property.node/display-type'] ?? ''
  ).replace(/^:/, '')
  const lang = String(
    block[':logseq.property.code/lang'] ?? ''
  ).toLowerCase()
  return displayType === 'code' && SHELL_LANGS.has(lang)
}

function extractCode(content: string, block?: Record<string, unknown>): string | null {
  const match = content.match(CODE_BLOCK_REGEX)
  if (match) return match[1]
  // New DB-style code block: content is raw code, no markdown fences
  if (block && isDBCodeBlock(block)) return content
  return null
}

// ── UI Renderer ───────────────────────────────────────────────────────────────

function renderExecUI(execId: string): void {
  const s = execState.get(execId)
  if (!s) return

  const running = s.running
  const btnClass = running ? 'ecb-run-btn ecb-running' : 'ecb-run-btn'
  const btnIcon = running ? '■' : '▶'
  const btnHandler = running ? 'stopCodeBlock' : 'runCodeBlock'
  const btnTitle = running ? 'STOP execution' : 'Run code block'
  const outId = `ecb-out-${execId}`

  let outputContent: string
  if (s.output === '') {
    outputContent = '<span class="ecb-placeholder">─ click ▶ to run ─</span>'
  } else {
    const exitBadge =
      s.exitCode !== null && !running
        ? `<span class="ecb-exit-badge ${s.exitCode === 0 ? 'ecb-exit-ok' : 'ecb-exit-err'}">exit ${s.exitCode}</span>`
        : ''
    outputContent = `${exitBadge}<span class="ecb-text">${escapeHtml(s.output)}</span>`
  }

  logseq.provideUI({
    key: execId,
    slot: s.slot,
    reset: true,
    template: `
      <div class="ecb-container">
        <button
          class="${btnClass}"
          data-on-click="${btnHandler}"
          data-exec-id="${execId}"
          data-parent-uuid="${s.parentUuid}"
          title="${btnTitle}"
        >${btnIcon}</button>
        <div class="ecb-output" id="${outId}">${outputContent}</div>
      </div>
      <script>
      (function() {
        var out = document.getElementById('${outId}');
        if (!out) return;
        window.__ecbScroll = window.__ecbScroll || {};
        if (window.__ecbScroll['${execId}'] !== false) {
          out.scrollTop = out.scrollHeight;
        }
        if (out.__ecbListener) return;
        out.__ecbListener = true;
        out.addEventListener('scroll', function() {
          window.__ecbScroll['${execId}'] =
            out.scrollTop + out.clientHeight >= out.scrollHeight - 10;
        }, { passive: true });
      })();
      <\/script>
    `,
  })
}

function renderSetupError(execId: string): void {
  const s = execState.get(execId)
  if (!s) return

  logseq.provideUI({
    key: execId,
    slot: s.slot,
    reset: true,
    template: `
      <div class="ecb-container">
        <button class="ecb-run-btn ecb-error" title="Server not running" disabled>!</button>
        <div class="ecb-output ecb-output-error">
          <span class="ecb-error-msg">
            ⚠ Executable code block server not running.<br/>
            Run the one-time setup:<br/>
            <code>cd &lt;plugin-dir&gt;/server &amp;&amp; npm install &amp;&amp; bash setup.sh</code><br/>
            Then reload Logseq.
          </span>
        </div>
      </div>
    `,
  })
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const STYLES = `
  .ecb-container {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
    box-sizing: border-box;
  }

  .ecb-run-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: #22863a;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition: background 0.15s ease;
    user-select: none;
  }

  .ecb-run-btn:hover:not(:disabled) {
    background: #28a745;
  }

  .ecb-run-btn:active:not(:disabled) {
    background: #1a6b2d;
  }

  .ecb-run-btn.ecb-running {
    background: #6c757d;
    animation: ecb-pulse 1.2s infinite;
    cursor: pointer;
  }

  .ecb-run-btn.ecb-running:hover {
    background: #c0392b;
    animation: none;
  }

  .ecb-run-btn.ecb-error {
    background: #c0392b;
    cursor: not-allowed;
  }

  @keyframes ecb-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }

  .ecb-output {
    flex: 1;
    min-height: 34px;
    max-height: 300px;
    overflow-y: auto;
    background: #1e1e1e;
    border-radius: 6px;
    padding: 6px 10px;
    font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #d4d4d4;
    white-space: pre-wrap;
    word-break: break-all;
    box-sizing: border-box;
  }

  .ecb-output-error {
    background: #2d1b1b;
  }

  .ecb-placeholder {
    color: #555;
    font-style: italic;
  }

  .ecb-text {
    display: block;
  }

  .ecb-exit-badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    margin-bottom: 4px;
    font-family: sans-serif;
  }

  .ecb-exit-ok  { background: #1a3a1a; color: #4caf50; }
  .ecb-exit-err { background: #3a1a1a; color: #f44336; }

  .ecb-error-msg {
    color: #e06c75;
    line-height: 1.8;
  }

  .ecb-error-msg code {
    background: #2d2d2d;
    padding: 2px 4px;
    border-radius: 3px;
    color: #abb2bf;
    font-size: 11px;
  }
`

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logseq.provideStyle(STYLES)

  // Register model (click handlers)
  logseq.provideModel({
    async stopCodeBlock(e: { dataset: { execId: string } }) {
      const { execId } = e.dataset
      const s = execState.get(execId)
      if (!s || !s.running) return
      try {
        const socket = await connectWS()
        socket.send(JSON.stringify({ id: execId, type: 'kill' }))
      } catch (_) {}
    },

    async runCodeBlock(e: { dataset: { execId: string; parentUuid: string } }) {
      const { execId, parentUuid } = e.dataset
      const s = execState.get(execId)
      if (!s || s.running) return

      const block = await logseq.Editor.getBlock(parentUuid)
      if (!block?.content) {
        logseq.App.showMsg('Parent block not found', 'error')
        return
      }

      const code = extractCode(block.content, block as unknown as Record<string, unknown>)
      if (!code) {
        logseq.App.showMsg('No executable code block found in parent', 'warning')
        return
      }

      s.output = ''
      s.exitCode = null
      s.running = true
      renderExecUI(execId)

      try {
        const socket = await connectWS()
        socket.send(JSON.stringify({ id: execId, code }))
      } catch (_) {
        s.running = false
        renderSetupError(execId)
      }
    },
  })

  // Context menu: "Create executable code block"
  logseq.Editor.registerBlockContextMenuItem(
    'Create executable code block',
    async (e) => {
      const uuid = (e as any).uuid ?? (e as any).blockId
      const block = await logseq.Editor.getBlock(uuid)
      if (!block?.content) return

      const blockRecord = block as unknown as Record<string, unknown>
      const hasCodeBlock = CODE_BLOCK_REGEX.test(block.content) || isDBCodeBlock(blockRecord)
      if (!hasCodeBlock) {
        logseq.App.showMsg(
          'This block does not contain a shell/bash/sh code block',
          'warning'
        )
        return
      }

      await logseq.Editor.insertBlock(
        uuid,
        `{{renderer :exec-code-block, ${uuid}}}`,
        { sibling: false }
      )
    }
  )

  // Macro renderer: handles {{renderer :exec-code-block, <parentUuid>}}
  logseq.App.onMacroRendererSlotted(({ slot, payload }) => {
    const [type, parentUuid] = payload.arguments
    if (!type?.startsWith(':exec-code-block') || !parentUuid) return

    const execId = `ecb-${parentUuid.trim()}`

    if (!execState.has(execId)) {
      execState.set(execId, {
        slot,
        output: '',
        running: false,
        parentUuid: parentUuid.trim(),
        exitCode: null,
      })
    } else {
      // Refresh slot reference when block is re-rendered (e.g., after navigation)
      execState.get(execId)!.slot = slot
    }

    renderExecUI(execId)
  })
}

logseq.ready(main).catch(console.error)
