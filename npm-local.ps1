param(
  [ValidateSet('public-web', 'admin-web', 'backend')]
  [string]$Project = 'public-web',
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NpmArguments = @('ci')
)

$ErrorActionPreference = 'Stop'
$selectedProject = Join-Path $PSScriptRoot $Project
if ($NpmArguments.Count -gt 0 -and $NpmArguments[0] -in @('ci', 'install')) {
  $lockedProcess = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'esbuild.exe' -and $_.ExecutablePath -like "$selectedProject\node_modules\*"
  }
  if ($lockedProcess) {
    throw 'Сначала остановите предпросмотр через Ctrl+C. Его esbuild.exe блокирует переустановку.'
  }
}
$localNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $localNode)) {
  $localNode = (Get-Command node -ErrorAction Stop).Source
}
$nodeMajor = [int]((& $localNode --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
  throw 'Для локального запуска нужен Node.js 24 LTS.'
}

# npm.cmd рядом с системным Node может принудительно использовать Node 18.
# Поэтому запускаем сам npm-cli.js явно выбранным Node 24.
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path $npmCommand) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) {
  throw 'Не найден npm-cli.js рядом с npm.cmd.'
}

$previousPath = $env:Path
Push-Location (Join-Path $PSScriptRoot $Project)
try {
  $env:Path = (Split-Path $localNode) + ';' + $previousPath
  Write-Host "Node $(& $localNode --version)"
  & $localNode $npmCli @NpmArguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm завершился с кодом $LASTEXITCODE. Если запущен предпросмотр, остановите его через Ctrl+C перед установкой."
  }
}
finally {
  $env:Path = $previousPath
  Pop-Location
}
