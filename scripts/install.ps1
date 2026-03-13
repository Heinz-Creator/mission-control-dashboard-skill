param(
  [Parameter(Mandatory=$true)][string]$TargetDir
)

$ErrorActionPreference = 'Stop'

$srcRoot = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $srcRoot 'assets'

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir 'public') | Out-Null

Copy-Item -Recurse -Force (Join-Path $assets 'public\*') (Join-Path $TargetDir 'public')
Copy-Item -Force (Join-Path $assets 'server.template.js') (Join-Path $TargetDir 'server.js')

# minimal package.json
$pkg = @{
  name = 'mission-control'
  private = $true
  version = '0.0.0'
  type = 'commonjs'
  scripts = @{ start = 'node server.js' }
  dependencies = @{
    express = '^4.19.2'
    express_rate_limit = '^7.5.0'
    multer = '^1.4.5-lts.1'
    dotenv = '^16.4.5'
  }
}

# express-rate-limit package name has a dash; write correct JSON string manually
$pkgJson = @'
{
  "name": "mission-control",
  "private": true,
  "version": "0.0.0",
  "type": "commonjs",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "express": "^4.19.2",
    "express-rate-limit": "^7.5.0",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.4.5"
  }
}
'@

Set-Content -Path (Join-Path $TargetDir 'package.json') -Value $pkgJson -Encoding utf8

Write-Output "[mission-control] installed to $TargetDir"
Write-Output "Next: cd $TargetDir; npm install; npm run start"
