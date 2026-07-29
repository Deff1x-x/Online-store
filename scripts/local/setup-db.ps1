# Create / reset local database: schema + migrations + seed.
# Usage: .\scripts\local\setup-db.ps1
param(
  [string]$HostName = $(if ($env:DATABASE_HOST) { $env:DATABASE_HOST } else { "localhost" }),
  [int]$Port = $(if ($env:DATABASE_PORT) { [int]$env:DATABASE_PORT } else { 5432 }),
  [string]$Database = $(if ($env:DATABASE_NAME) { $env:DATABASE_NAME } else { "online_store" }),
  [string]$User = $(if ($env:DATABASE_USER) { $env:DATABASE_USER } else { "postgres" }),
  [string]$Password = $(if ($env:DATABASE_PASSWORD) { $env:DATABASE_PASSWORD } else { "postgres" })
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$env:PGPASSWORD = $Password

function Find-Psql {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidate = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
  if (Test-Path $candidate) { return $candidate }
  throw "psql not found. Install PostgreSQL 16+ or add psql to PATH."
}

$psql = Find-Psql
$base = @("-h", $HostName, "-p", "$Port", "-U", $User, "-v", "ON_ERROR_STOP=1")

function Invoke-Psql {
  param(
    [Parameter(Mandatory)][string[]]$Arguments
  )

  $stdout = [System.IO.Path]::GetTempFileName()
  $stderr = [System.IO.Path]::GetTempFileName()
  try {
    $argLine = ((@($base) + @($Arguments)) | ForEach-Object {
      if ($_ -match '[\s"]') {
        '"' + $_.Replace('"', '\"') + '"'
      } else {
        $_
      }
    }) -join ' '
    $process = Start-Process -FilePath $psql -ArgumentList $argLine -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (Test-Path $stdout) { Get-Content $stdout }
    if (Test-Path $stderr) { Get-Content $stderr }
    if ($process.ExitCode -ne 0) {
      throw "psql failed with exit code $($process.ExitCode)"
    }
  } finally {
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
  }
}

Write-Host "Recreating database $Database on ${HostName}:$Port ..."
Invoke-Psql @("-d", "postgres", "-c", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$Database' AND pid <> pg_backend_pid();") | Out-Null
Invoke-Psql @("-d", "postgres", "-c", "DROP DATABASE IF EXISTS `"$Database`";")
Invoke-Psql @("-d", "postgres", "-c", "CREATE DATABASE `"$Database`" OWNER `"$User`";")

Write-Host "Applying schema..."
Invoke-Psql @("-d", $Database, "-f", (Join-Path $Root "database/schema.sql"))
Get-ChildItem (Join-Path $Root "database/migrations/*.sql") | Sort-Object Name | ForEach-Object {
  Write-Host "Applying $($_.Name)..."
  Invoke-Psql @("-d", $Database, "-f", $_.FullName)
}
Write-Host "Seeding..."
Invoke-Psql @("-d", $Database, "-f", (Join-Path $Root "database/seed.sql"))
Write-Host "setup_db_ok"
