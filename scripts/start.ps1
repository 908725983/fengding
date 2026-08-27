$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:npm_config_cache = Join-Path $repoRoot '.npm-cache'

Push-Location $repoRoot
try {
  npm start
} finally {
  Pop-Location
}
