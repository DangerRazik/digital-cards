$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$fileSystem = New-Object -ComObject Scripting.FileSystemObject
$runtimePath = Join-Path $projectRoot '.local'
# Избегаем ошибки UTF-8 в PostgreSQL при кириллице в полном пути.
$runtimeDirectory = $fileSystem.GetFolder($runtimePath).ShortPath
$pgBin = Join-Path $runtimeDirectory 'postgres/pgsql/bin'
$dbDirectory = Join-Path $runtimeDirectory 'pgdata'
$configPath = Join-Path $runtimeDirectory 'db-config.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $configPath)) {
  if (Test-Path -LiteralPath (Join-Path $dbDirectory 'PG_VERSION')) {
    throw 'База существует, но настройки потеряны. Данные не изменены.'
  }
  $adminPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $readerPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $config = @{
    adminPassword = $adminPassword
    readerPassword = $readerPassword
    adminUrl = "postgresql://cards_owner:${adminPassword}@127.0.0.1:54329/digital_cards"
    publicUrl = "postgresql://cards_public:${readerPassword}@127.0.0.1:54329/digital_cards"
  }
  $configJson = $config | ConvertTo-Json
  [IO.File]::WriteAllText($configPath, $configJson, $utf8)
}

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json

if (-not (Test-Path -LiteralPath (Join-Path $dbDirectory 'PG_VERSION'))) {
  $passwordFile = Join-Path $runtimeDirectory 'init-password.txt'
  [IO.File]::WriteAllText($passwordFile, $config.adminPassword, $utf8)
  try {
    $initdbExecutable = Join-Path $pgBin 'initdb.exe'
    $initArguments = @(
      '-D', $dbDirectory
      '-U', 'cards_owner'
      '--encoding=UTF8'
      '--locale=C'
      '--auth=scram-sha-256'
      "--pwfile=$passwordFile"
    )

    & $initdbExecutable @initArguments
    if ($LASTEXITCODE -ne 0) {
      throw 'Ошибка initdb. Данные не удалены.'
    }
  } finally {
    Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue
  }
}
$serverConfigPath = Join-Path $dbDirectory 'postgresql.auto.conf'
$serverConfig = "listen_addresses = '127.0.0.1'`n" +
  "port = 54329`n" +
  "password_encryption = 'scram-sha-256'`n"

[IO.File]::WriteAllText($serverConfigPath, $serverConfig, $utf8)
& (Join-Path $projectRoot 'start-db.ps1')

$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $config.adminPassword
try {
  $psql = Join-Path $pgBin 'psql.exe'
  $connectionArguments = @(
    '-h', '127.0.0.1'
    '-p', '54329'
    '-U', 'cards_owner'
  )
  $databaseQuery = "SELECT 1 FROM pg_database WHERE datname='digital_cards'"

  $databaseExists = & $psql @connectionArguments -d postgres -At -v ON_ERROR_STOP=1 -c $databaseQuery
  if ($LASTEXITCODE -ne 0) {
    throw 'Ошибка подключения к PostgreSQL.'
  }
  if ($databaseExists -ne '1') {
    $createdbExecutable = Join-Path $pgBin 'createdb.exe'

    & $createdbExecutable @connectionArguments digital_cards
    if ($LASTEXITCODE -ne 0) {
      throw 'Не удалось создать базу.'
    }
  }
  $roleQuery = "SELECT 1 FROM pg_roles WHERE rolname='cards_public'"
  $roleExists = & $psql @connectionArguments -d digital_cards -At -c $roleQuery
  if ($LASTEXITCODE -ne 0) {
    throw 'Ошибка проверки роли.'
  }
  if ($roleExists -ne '1') {
    $createRoleSql = "CREATE ROLE cards_public LOGIN PASSWORD '$($config.readerPassword)' " +
      'NOSUPERUSER NOCREATEDB NOCREATEROLE;'

    # Пароль передаётся через stdin, чтобы он не появился в аргументах процесса.
    $createRoleSql | & $psql @connectionArguments -d digital_cards -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
      throw 'Не удалось создать роль чтения.'
    }
  }
  $permissionsSql = @'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE digital_cards FROM PUBLIC;
GRANT CONNECT ON DATABASE digital_cards TO cards_public;
GRANT USAGE ON SCHEMA public TO cards_public;
ALTER ROLE cards_public SET default_transaction_read_only = on;
'@

  $permissionsSql | & $psql @connectionArguments -d digital_cards -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось настроить права.'
  }
} finally {
  $env:PGPASSWORD = $previousPassword
}
$environmentPath = Join-Path $projectRoot 'backend/.env'
$environmentContent = "DATABASE_URL=$($config.publicUrl)`n" +
  "HOST=127.0.0.1`n" +
  "PORT=3000`n"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  [IO.File]::WriteAllText($environmentPath, $environmentContent, $utf8)
}
Write-Host 'PostgreSQL готова. Пароли сохранены локально и исключены из Git.'
