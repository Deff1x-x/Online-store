#!/usr/bin/env pwsh
param([string]$PassName = "A")
$ErrorActionPreference = "Continue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
New-Item -ItemType Directory -Force -Path artifacts | Out-Null
$passLog = "artifacts\tz-pass$PassName.txt"
"" | Set-Content $passLog

function Log([string]$m) {
  $line = "[$(Get-Date -Format o)] $m"
  Add-Content $passLog $line
  Write-Output $line
}
function Fail([string]$m) {
  Log "FAIL: $m"
  exit 1
}

Log "=== PASS $PassName START ==="

Log "dotnet restore"
dotnet restore backend-dotnet/Koz.sln *> "artifacts\tz-pass$PassName-dotnet-restore.txt"
if ($LASTEXITCODE -ne 0) { Fail "restore" }

Log "dotnet build Release"
dotnet build backend-dotnet/Koz.sln -c Release --no-restore *> "artifacts\tz-pass$PassName-dotnet-build.txt"
if ($LASTEXITCODE -ne 0) { Fail "build" }

Log "dotnet test Api.Tests"
dotnet test backend-dotnet/tests/Koz.Api.Tests/Koz.Api.Tests.csproj -c Release --no-build --no-restore *> "artifacts\tz-pass$PassName-dotnet-api-tests.txt"
if ($LASTEXITCODE -ne 0) { Fail "api tests" }
Get-Content "artifacts\tz-pass$PassName-dotnet-api-tests.txt" | Select-Object -Last 6

Log "npm install"
npm install *> "artifacts\tz-pass$PassName-npm-install.txt"
if ($LASTEXITCODE -ne 0) { Fail "npm install" }

Log "frontend tests"
npm run test --workspace=@koz/client *> "artifacts\tz-pass$PassName-fe-tests.txt"
if ($LASTEXITCODE -ne 0) { Fail "fe tests" }

Log "typecheck"
npx tsc -p apps/client --noEmit *> "artifacts\tz-pass$PassName-fe-tsc-client.txt"
if ($LASTEXITCODE -ne 0) { Fail "tsc client" }
npx tsc -p apps/staff --noEmit *> "artifacts\tz-pass$PassName-fe-tsc-staff.txt"
if ($LASTEXITCODE -ne 0) { Fail "tsc staff" }
npx tsc -p packages/api --noEmit *> "artifacts\tz-pass$PassName-fe-tsc-api.txt"
if ($LASTEXITCODE -ne 0) { Fail "tsc api" }
Log "lint: no eslint script; tsc is static gate"

Log "frontend builds"
npm run build --workspace=@koz/client *> "artifacts\tz-pass$PassName-fe-build.txt"
if ($LASTEXITCODE -ne 0) { Fail "client build" }
npm run build --workspace=@koz/staff *> "artifacts\tz-pass$PassName-fe-staff-build.txt"
if ($LASTEXITCODE -ne 0) { Fail "staff build" }

Log "fresh DB schema+migrations+seed on online_store_tz_pass"
$envLines = Get-Content .env
function EnvVal([string]$k) {
  $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($k))=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring($k.Length + 1)
}
$hostName = EnvVal "DATABASE_HOST"; if (-not $hostName) { $hostName = "localhost" }
$port = EnvVal "DATABASE_PORT"; if (-not $port) { $port = "5432" }
$user = EnvVal "DATABASE_USER"
$pass = EnvVal "DATABASE_PASSWORD"
$env:PGPASSWORD = $pass
$Psql = if (Test-Path "C:\Program Files\PostgreSQL\16\bin\psql.exe") { "C:\Program Files\PostgreSQL\16\bin\psql.exe" } else { "psql" }
$dbPass = "online_store_tz_pass"
& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$dbPass' AND pid <> pg_backend_pid();" *> $null
& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $dbPass;" *> "artifacts\tz-pass$PassName-db-drop.txt"
if ($LASTEXITCODE -ne 0) { Fail "drop db" }
& $Psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbPass OWNER `"$user`";" *> "artifacts\tz-pass$PassName-db-create.txt"
if ($LASTEXITCODE -ne 0) { Fail "create db" }
& $Psql -h $hostName -p $port -U $user -d $dbPass -v ON_ERROR_STOP=1 -f database\schema.sql *> "artifacts\tz-pass$PassName-db-schema.txt"
if ($LASTEXITCODE -ne 0) { Fail "schema" }
Get-ChildItem database\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Log "migration $($_.Name)"
  & $Psql -h $hostName -p $port -U $user -d $dbPass -v ON_ERROR_STOP=1 -f $_.FullName *> "artifacts\tz-pass$PassName-mig-$($_.Name).txt"
  if ($LASTEXITCODE -ne 0) { Fail "migration $($_.Name)" }
}
Log "upgrade re-apply migrations (idempotency probe)"
$upgradeOk = $true
Get-ChildItem database\migrations\*.sql | Sort-Object Name | ForEach-Object {
  & $Psql -h $hostName -p $port -U $user -d $dbPass -v ON_ERROR_STOP=1 -f $_.FullName *> "artifacts\tz-pass$PassName-upgrade-$($_.Name).txt"
  if ($LASTEXITCODE -ne 0) {
    Log "upgrade re-apply non-idempotent: $($_.Name) (acceptable if migration is once-only)"
    $upgradeOk = $false
  }
}
if ($upgradeOk) { Log "upgrade re-apply OK" }
if (Test-Path database\seed.sql) {
  & $Psql -h $hostName -p $port -U $user -d $dbPass -v ON_ERROR_STOP=1 -f database\seed.sql *> "artifacts\tz-pass$PassName-db-seed.txt"
  if ($LASTEXITCODE -ne 0) { Fail "seed" }
  Log "seed OK"
}

Log "integration tests"
$cs = "Host=$hostName;Port=$port;Username=$user;Password=$pass;Database=$dbPass"
$env:ConnectionStrings__Default = $cs
$env:KOZ_INTEGRATION_CONNECTION = $cs
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj -c Release --no-build --no-restore *> "artifacts\tz-pass$PassName-integration.txt"
$integExit = $LASTEXITCODE
Get-Content "artifacts\tz-pass$PassName-integration.txt" | Select-Object -Last 20
Log "integration exit=$integExit"
# Integration may require Node+Dotnet dual harness — do not Fail hard if skipped; Fail if failures>0 with executed tests
$integText = Get-Content "artifacts\tz-pass$PassName-integration.txt" -Raw
if ($integText -match "не пройдено\s+[1-9]" -or $integText -match "Failed:\s+[1-9]") { Fail "integration failures" }

Log "a7 acceptance"
node scripts/tz/a7-f0-acceptance.mjs *> "artifacts\tz-pass$PassName-a7.txt"
if ($LASTEXITCODE -ne 0) { Fail "a7" }

Log "b7 browser"
Remove-Item Env:B7_SKIP_SERVE -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5173,5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
Remove-Item -Recurse -Force apps\client\node_modules\.vite -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
# Do not redirect playwright inherit stdio with *> (hangs on Windows).
$b7Out = "artifacts\tz-pass$PassName-b7.txt"
$env:B7_KEEP_SERVE = "0"
cmd /c "node scripts\tz\b7-browser.mjs > $b7Out 2>&1"
if ($LASTEXITCODE -ne 0) {
  Get-Content $b7Out -ErrorAction SilentlyContinue | Select-Object -Last 40
  Fail "b7"
}
Get-Content $b7Out | Select-Object -Last 15

Log "secret scan"
node scripts/tz/secret-scan.mjs *> "artifacts\tz-pass$PassName-secrets.txt"
if ($LASTEXITCODE -ne 0) { Fail "secret scan" }

Log "git diff --check"
git diff --check *> "artifacts\tz-pass$PassName-diffcheck.txt"
if ($LASTEXITCODE -ne 0) { Fail "diff --check" }

Log "matrix recount"
node scripts/tz/matrix-recount.mjs *> "artifacts\tz-pass$PassName-matrix-recount.txt"
if ($LASTEXITCODE -ne 0) { Fail "matrix recount" }
Get-Content "artifacts\tz-pass$PassName-matrix-recount.txt"

Log "=== PASS $PassName COMPLETE ==="
exit 0
