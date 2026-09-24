$ErrorActionPreference = 'Stop'
$pgExecutable = Join-Path $PSScriptRoot '.local/postgres/pgsql/bin/postgres.exe'
if (-not (Test-Path -LiteralPath $pgExecutable)) {
  $ProgressPreference = 'SilentlyContinue'
  New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot '.local') -Force | Out-Null
  $archivePath = Join-Path $PSScriptRoot '.local/postgresql.zip'
  Write-Host 'Загрузка PostgreSQL 17.11 для Windows с сайта EDB...'
  $archiveUrl = 'https://get.enterprisedb.com/postgresql/postgresql-17.11-4-windows-x64-binaries.zip'
  $destinationPath = Join-Path $PSScriptRoot '.local/postgres'

  Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -TimeoutSec 600
  Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationPath -Force
}
& (Join-Path $PSScriptRoot 'npm-local.ps1') -Project public-web ci --no-fund --no-audit
& (Join-Path $PSScriptRoot 'npm-local.ps1') -Project backend ci --no-fund --no-audit
& (Join-Path $PSScriptRoot 'npm-local.ps1') -Project admin-web ci --no-fund --no-audit
& (Join-Path $PSScriptRoot 'scripts/init-database.ps1')
& (Join-Path $PSScriptRoot 'npm-local.ps1') -Project backend run db:setup
Write-Host 'Готово. Для запуска выполните .\start-local.ps1'
