$ErrorActionPreference = 'Stop'
$fileSystem = New-Object -ComObject Scripting.FileSystemObject
$runtimePath = Join-Path $PSScriptRoot '.local'
# Короткий путь нужен PostgreSQL для работы с кириллицей в имени Windows-профиля.
$runtimeDirectory = $fileSystem.GetFolder($runtimePath).ShortPath
$dbDirectory = Join-Path $runtimeDirectory 'pgdata'
$pgCtl = Join-Path $runtimeDirectory 'postgres/pgsql/bin/pg_ctl.exe'
if (-not (Test-Path -LiteralPath (Join-Path $dbDirectory 'PG_VERSION'))) {
  throw 'Сначала выполните .\setup-local.ps1.'
}
& $pgCtl status -D $dbDirectory *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host 'PostgreSQL уже работает.'
  return
}
$logPath = Join-Path $runtimeDirectory 'postgresql.log'

& $pgCtl start -D $dbDirectory -l $logPath -w -t 30
if ($LASTEXITCODE -ne 0) {
  throw 'PostgreSQL не запущен. Подробности в .local/postgresql.log.'
}
