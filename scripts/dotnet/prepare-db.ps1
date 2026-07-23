#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)][string]$ConnectionString,
    [ValidateSet('schema', 'migrate')][string]$Mode = 'schema'
)
$ErrorActionPreference = 'Stop'

function Get-CsValue([string]$cs, [string]$key) {
    foreach ($part in $cs.Split(';')) {
        $kv = $part.Split('=', 2)
        if ($kv.Count -eq 2 -and $kv[0].Trim().Equals($key, [StringComparison]::OrdinalIgnoreCase)) {
            return $kv[1].Trim()
        }
    }
    return $null
}

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Psql = $env:PSQL_EXE
if (-not $Psql) {
    $candidate = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
    if (Test-Path $candidate) { $Psql = $candidate } else { $Psql = 'psql' }
}

$hostName = Get-CsValue $ConnectionString 'Host'
if (-not $hostName) { $hostName = Get-CsValue $ConnectionString 'Server' }
$port = Get-CsValue $ConnectionString 'Port'; if (-not $port) { $port = '5432' }
$user = Get-CsValue $ConnectionString 'Username'
if (-not $user) { $user = Get-CsValue $ConnectionString 'User ID' }
$db = Get-CsValue $ConnectionString 'Database'
$password = Get-CsValue $ConnectionString 'Password'
if (-not $hostName -or -not $user -or -not $db) { throw 'ConnectionString must include Host, Username, and Database.' }
if ($password) { $env:PGPASSWORD = $password }

function Invoke-Psql([string]$Database, [string]$SqlFile) {
    & $Psql -h $hostName -p $port -U $user -d $Database -v ON_ERROR_STOP=1 -f $SqlFile
    if ($LASTEXITCODE -ne 0) { throw "psql failed for $SqlFile on $Database" }
}

& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid <> pg_backend_pid();" | Out-Null
& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS `"$db`";"
if ($LASTEXITCODE -ne 0) { throw 'DROP DATABASE failed' }
& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$db`" OWNER `"$user`";"
if ($LASTEXITCODE -ne 0) { throw 'CREATE DATABASE failed' }

Invoke-Psql $db (Join-Path $Root 'database\schema.sql')
Get-ChildItem (Join-Path $Root 'database\migrations\*.sql') | Sort-Object Name | ForEach-Object {
    Write-Host "Applying $($_.Name) (mode=$Mode)"
    Invoke-Psql $db $_.FullName
}

$seed = Join-Path $Root 'database\seed.sql'
if (Test-Path $seed) {
    Write-Host 'Applying seed.sql'
    Invoke-Psql $db $seed
}

Write-Host "Database $db ready via mode=$Mode"
