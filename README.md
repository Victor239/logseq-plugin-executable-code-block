# Logseq Executable Code Block

A Logseq plugin that lets you run shell code blocks directly from your notes. Write a code block, right-click the bullet, and create a child execution node with a run button and live terminal output.

![Demo: run button with terminal output panel](./logo.svg)

## Features

- **One-click execution** — click ▶ to run the code block above
- **Live streaming output** — stdout and stderr stream in as the command runs
- **Exit code badge** — green/red badge shows whether the command succeeded
- **Persistent output** — output stays visible until you run again
- **Auto-reconnect** — if Logseq is restarted the plugin reconnects to the server automatically

## Requirements

- [Logseq Desktop](https://logseq.com/) (developer mode enabled)
- [Node.js](https://nodejs.org/) v16 or later

## Installation

### 1. Install the server (one-time setup)

The plugin executes commands through a small local WebSocket server. Register it as a system service so it starts automatically on login:

```sh
cd server
npm install
bash setup.sh        # macOS or Linux
# .\setup.ps1        # Windows (PowerShell)
```

That's it — the server will now start automatically whenever you log in. You never need to touch it again.

> **Manual start** (without the service): `cd server && node server.js`

### 2. Load the plugin in Logseq

1. Open Logseq → **Settings** → **Advanced** → enable **Developer mode**
2. Click the three-dot menu → **Plugins** → **Load unpacked plugin**
3. Select the `executable-code-block/` folder (this directory)

## Usage

1. Write a code block with the language set to `shell`, `bash`, or `sh`:

   ````
   ```shell
   echo "Hello from Logseq!"
   ls -lh ~/Documents
   ```
   ````

2. **Right-click the bullet** of that block → **"Create executable code block"**

3. A child block appears with a ▶ button on the left and a terminal output panel on the right.

4. Click **▶** to run. Output streams in as it executes. The exit code is shown when the command finishes.

> The context menu item appears on all blocks. If the block doesn't contain a `shell`/`bash`/`sh` code block, a warning message is shown instead.

## Managing the background server

### macOS

```sh
# Stop
launchctl unload ~/Library/LaunchAgents/com.logseq.executable-code-block.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.logseq.executable-code-block.plist
launchctl load   ~/Library/LaunchAgents/com.logseq.executable-code-block.plist

# Logs
tail -f ~/Library/Logs/logseq-executable-code-block.log
```

### Linux (systemd)

```sh
systemctl --user status  logseq-executable-code-block
systemctl --user stop    logseq-executable-code-block
systemctl --user restart logseq-executable-code-block
journalctl --user -u logseq-executable-code-block -f
```

### Windows (Task Scheduler)

```powershell
Stop-ScheduledTask    -TaskName LogseqExecutableCodeBlock
Start-ScheduledTask   -TaskName LogseqExecutableCodeBlock
Unregister-ScheduledTask -TaskName LogseqExecutableCodeBlock -Confirm:$false
```

## Development

```sh
npm install
npm run dev    # Vite dev server with HMR
npm run build  # Production build → dist/
```

The plugin source is in `src/index.ts`. The companion server is in `server/server.js`.

## How it works

Logseq plugins run in a sandboxed iframe (no direct access to `child_process`). To execute real shell commands, the plugin connects to the companion WebSocket server over `ws://localhost:8765`. When you click ▶, the plugin sends the code to the server, which spawns a shell process and streams stdout/stderr back chunk by chunk. The UI re-renders on each chunk.

## Troubleshooting

`pkill node`, or `pkill -9 node` can be used to kill the Node.js server if your Logseq becomes unresponsive. 

## License

MIT
