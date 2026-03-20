# One-time setup: register the executable-code-block server as a Windows Task Scheduler job
# so it starts automatically on login.
#
# Usage (PowerShell, run as current user):
#   cd server; npm install; .\setup.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerJs   = Join-Path $ScriptDir 'server.js'
$NodeBin    = (Get-Command node -ErrorAction SilentlyContinue)?.Source

if (-not $NodeBin) {
    Write-Error 'node not found in PATH. Install Node.js first.'
    exit 1
}

if (-not (Test-Path $ServerJs)) {
    Write-Error "server.js not found at $ServerJs"
    exit 1
}

Write-Host "Node:   $NodeBin"
Write-Host "Server: $ServerJs"
Write-Host ""

$TaskName   = 'LogseqExecutableCodeBlock'
$Action     = New-ScheduledTaskAction -Execute $NodeBin -Argument "`"$ServerJs`""
$Trigger    = New-ScheduledTaskTrigger -AtLogOn
$Settings   = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal  = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# Remove existing task if present
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Logseq Executable Code Block WebSocket Server' | Out-Null

# Start it now
Start-ScheduledTask -TaskName $TaskName

Write-Host "✓ Task registered (Task Scheduler)"
Write-Host "  Name: $TaskName"
Write-Host ""
Write-Host "  To stop:    Stop-ScheduledTask -TaskName $TaskName"
Write-Host "  To remove:  Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
Write-Host ""
Write-Host "The server will now start automatically on login."
Write-Host "Reload Logseq to connect."
