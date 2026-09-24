$ErrorActionPreference = 'Stop'
$nodeExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
}
$nodeVersion = & $nodeExecutable --version
$nodeMajorVersion = [int]($nodeVersion.TrimStart('v').Split('.')[0])

if ($nodeMajorVersion -lt 24) {
  throw 'Нужен Node.js 24 LTS.'
}
