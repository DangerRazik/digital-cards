$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/node-runtime.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'backend/.env'))) {
  throw 'Сначала выполните .\setup-local.ps1.'
}
$listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
foreach ($listener in $listeners) {
  if ($listener.Port -in @(3000, 4200, 4201)) {
    throw "Порт $($listener.Port) уже занят. Остановите предыдущий запуск через Ctrl+C и повторите команду."
  }
}
& (Join-Path $PSScriptRoot 'start-db.ps1')
& (Join-Path $PSScriptRoot 'npm-local.ps1') -Project backend run build
Push-Location $PSScriptRoot
try {
  & $nodeExecutable scripts/dev.cjs
}
finally {
  Pop-Location
}
