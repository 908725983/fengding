$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:npm_config_cache = Join-Path $repoRoot '.npm-cache'

Push-Location $repoRoot
try {
  New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null
  $needsInstall = -not (Test-Path (Join-Path $repoRoot 'node_modules'))
  if (-not $needsInstall) {
    npm ls --depth=0 --silent *> $null
    $needsInstall = $LASTEXITCODE -ne 0
  }

  if ($needsInstall) {
    if (Test-Path (Join-Path $repoRoot 'package-lock.json')) {
      npm ci
    } else {
      npm install
    }
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
  }

  npm run verify
  if ($LASTEXITCODE -ne 0) { throw '基线验证失败' }
} finally {
  Pop-Location
}
