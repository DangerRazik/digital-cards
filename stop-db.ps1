$ErrorActionPreference = 'Stop'
$fileSystem = New-Object -ComObject Scripting.FileSystemObject
$runtimePath = Join-Path $PSScriptRoot '.local'
$runtimeDirectory = $fileSystem.GetFolder($runtimePath).ShortPath
$dbDirectory = Join-Path $runtimeDirectory 'pgdata'
$pgCtl = Join-Path $runtimeDirectory 'postgres/pgsql/bin/pg_ctl.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) {
  return
}
& $pgCtl status -D $dbDirectory *> $null
if ($LASTEXITCODE -eq 0) {
  & $pgCtl stop -D $dbDirectory -m fast -w -t 30
  if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось остановить PostgreSQL проекта.'
  }
} else {
  Write-Host 'PostgreSQL проекта уже остановлен.'
}
