#!/usr/bin/env pwsh
# Reproducible CI/local validation for cutover rehearsal. No secrets committed.
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

dotnet restore backend-dotnet/Koz.sln
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dotnet build backend-dotnet/Koz.sln -c Release -warnaserror --no-restore
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dotnet test backend-dotnet/Koz.sln -c Release --no-build --no-restore
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot 'publish-api.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'validate-release: restore/build/test/publish OK'
