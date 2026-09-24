$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$files = [System.Collections.Generic.List[string]]::new()

# Include only application sources and deployment templates, never the whole project.
foreach ($folder in @('backend/src', 'backend/database', 'admin-web/src', 'public-web/src', 'deploy')) {
  $source = Join-Path $projectRoot $folder
  foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse) {
    if ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Symbolic links are not allowed in the server package: $($file.Name)"
    }
    if ($file.Extension -in @('.ts', '.html', '.css', '.json', '.sql', '.cjs', '.sh', '.conf', '.service', '.timer', '.txt')) {
      $files.Add($file.FullName)
    }
  }
}

foreach ($project in @('backend', 'admin-web', 'public-web')) {
  foreach ($name in @('package.json', 'package-lock.json', 'tsconfig.json')) {
    $files.Add((Join-Path $projectRoot "$project/$name"))
  }
}

foreach ($project in @('admin-web', 'public-web')) {
  foreach ($name in @('angular.json', 'tsconfig.app.json', 'proxy.conf.json')) {
    $files.Add((Join-Path $projectRoot "$project/$name"))
  }
  foreach ($icon in @('telegram.svg', 'whatsapp.svg', 'max.svg')) {
    $files.Add((Join-Path $projectRoot "$project/public/assets/$icon"))
  }
}
$files.Add((Join-Path $projectRoot 'public-web/public/favicon.svg'))

$outputDirectory = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$archivePath = Join-Path $outputDirectory "digital-cards-server-$suffix.zip"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relativePath = $file.Substring($projectRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $file, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}
finally {
  $archive.Dispose()
}
Write-Host "Server source package: $archivePath"
Write-Host 'No builds executed. Local credentials, database, uploads and Windows startup scripts excluded.'
