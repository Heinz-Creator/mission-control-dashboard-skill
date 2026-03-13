param(
  [Parameter(Mandatory=$true)][string]$Dir,
  [string]$Bind = '127.0.0.1',
  [int]$Port = 3000,
  [string]$WorkspaceRoot = ''
)

$ErrorActionPreference = 'Stop'

if(-not (Test-Path $Dir)) { throw "Dir not found: $Dir" }

Push-Location $Dir
try {
  if(-not (Test-Path (Join-Path $Dir 'node_modules'))) {
    Write-Output "[mission-control] node_modules missing -> running npm install..."
    npm install
  }

  $env:BIND = $Bind
  $env:PORT = "$Port"
  if($WorkspaceRoot) { $env:WORKSPACE_ROOT = $WorkspaceRoot }

  Write-Output "[mission-control] starting on http://$Bind:$Port"
  node server.js
} finally {
  Pop-Location
}
