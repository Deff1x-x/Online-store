#!/usr/bin/env pwsh
param(
    [string]$OutDir
)
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location (Join-Path $Root 'backend-dotnet')
if (-not $OutDir) { $OutDir = Join-Path $Root 'artifacts/dotnet-publish' }
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Path $OutDir | Out-Null
dotnet restore Koz.sln
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dotnet build Koz.sln -c Release -warnaserror --no-restore
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dotnet publish src/Koz.Api/Koz.Api.csproj -c Release -o $OutDir --no-build /p:UseAppHost=false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Published to $OutDir"
