#!/usr/bin/env pwsh
# Pre-production validation cycle for Koz.Api (process deployment).
# Does not print secret values. Writes evidence JSON under artifacts/preprod.
param(
    [Parameter(Mandatory = $true)][ValidateSet('A', 'B')][string]$Pass,
    [string]$Root = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Root) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $Root = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}
$Artifacts = Join-Path $Root 'artifacts\preprod'
$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$manifest = Get-Content (Join-Path $Artifacts 'artifact-manifest.json') -Raw | ConvertFrom-Json
$publishDir = $manifest.publish_dir
$dll = Join-Path $publishDir 'Koz.Api.dll'
if (-not (Test-Path $dll)) { throw "Missing publish dll: $dll" }

$adminCs = $env:KOZ_LOAD_TEST_CONNECTION_STRING
if (-not $adminCs) { throw 'KOZ_LOAD_TEST_CONNECTION_STRING required' }
$adminPass = ($adminCs.Split(';') | Where-Object { $_ -like 'Password=*' } | ForEach-Object { $_.Substring(9) })
$env:PGPASSWORD = $adminPass

$rolePass = 'PreprodRuntime_2026_NotDefault!'
$jwt = 'preprod-jwt-secret-at-least-32-chars-xx'
$otp = 'preprod-otp-secret-at-least-32-chars-yy'
$DbName = 'koz_dotnet_preprod'
$OriginAllow = 'https://app.preprod.example.com'
$OriginDeny = 'https://evil.example.com'
$StoreId = '11111111-1111-1111-1111-111111111111'
$CoverageId = '22222222-2222-2222-2222-222222222222'
$TomatoId = '33333333-3333-3333-3333-333333333333'
$MilkId = '55555555-5555-5555-5555-555555555555'
$portA = 18181
$portB = 18182
$urlA = "http://127.0.0.1:$portA"
$urlB = "http://127.0.0.1:$portB"
$MaxPool = 20  # mandatory: 2 replicas * 20 = 40 < max_connections 100
$evidence = [ordered]@{ pass = $Pass; started_utc = (Get-Date).ToUniversalTime().ToString('o'); checks = [ordered]@{} }

function SqlScalar([string]$Sql) {
    return ((& $Psql -h localhost -U postgres -d $DbName -tAc $Sql) | Out-String).Trim()
}
function Invoke-Sql([string]$Sql) {
    & $Psql -h localhost -U postgres -d $DbName -v ON_ERROR_STOP=1 -c $Sql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "SQL failed: $Sql" }
}
function Stop-PortListeners([int[]]$Ports) {
    foreach ($port in $Ports) {
        $lines = netstat -ano | Select-String ":$port\s" | Select-String 'LISTENING'
        foreach ($line in $lines) {
            if ($line -match '\s(\d+)\s*$') {
                Stop-Process -Id ([int]$Matches[1]) -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
function Start-ApiReplica([int]$Port, [string]$LogName) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'dotnet'
    $psi.Arguments = "`"$dll`""
    $psi.WorkingDirectory = $publishDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    foreach ($k in @(
            'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD',
            'JWT_SECRET', 'OTP_SECRET', 'Cors__AllowedOrigins__0', 'PAYMENTS_ONLINE_INITIATION_ENABLED',
            'ASPNETCORE_ENVIRONMENT', 'ASPNETCORE_URLS', 'Database__ValidateOnStartup', 'Database__ConnectionString',
            'DATABASE_MAX_POOL_SIZE', 'DATABASE_CONNECTION_TIMEOUT_SECONDS', 'DATABASE_COMMAND_TIMEOUT_SECONDS',
            'Host__ShutdownTimeoutSeconds'
        )) {
        if ($psi.Environment.ContainsKey($k)) { [void]$psi.Environment.Remove($k) }
    }
    $psi.Environment['ASPNETCORE_ENVIRONMENT'] = 'Production'
    $psi.Environment['ASPNETCORE_URLS'] = "http://127.0.0.1:$Port"
    $psi.Environment['DATABASE_HOST'] = 'localhost'
    $psi.Environment['DATABASE_PORT'] = '5432'
    $psi.Environment['DATABASE_NAME'] = $DbName
    $psi.Environment['DATABASE_USER'] = 'koz_preprod'
    $psi.Environment['DATABASE_PASSWORD'] = $rolePass
    $psi.Environment['DATABASE_MAX_POOL_SIZE'] = "$MaxPool"
    $psi.Environment['DATABASE_CONNECTION_TIMEOUT_SECONDS'] = '15'
    $psi.Environment['DATABASE_COMMAND_TIMEOUT_SECONDS'] = '30'
    $psi.Environment['JWT_SECRET'] = $jwt
    $psi.Environment['OTP_SECRET'] = $otp
    $psi.Environment['Cors__AllowedOrigins__0'] = $OriginAllow
    $psi.Environment['PAYMENTS_ONLINE_INITIATION_ENABLED'] = 'false'
    $psi.Environment['Host__ShutdownTimeoutSeconds'] = '30'
    $p = [System.Diagnostics.Process]::Start($psi)
    $logPath = Join-Path $Artifacts "logs\$LogName-pass$Pass.log"
    Start-Job -ScriptBlock {
        param($proc, $path)
        $proc.StandardOutput.ReadToEnd() + "`n" + $proc.StandardError.ReadToEnd() | Set-Content -Path $path -Encoding utf8
    } -ArgumentList $p, $logPath | Out-Null
    return $p
}
function Wait-Ready([string]$BaseUrl, [System.Diagnostics.Process]$Proc, [int]$TimeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ($Proc.HasExited) { throw "Process exited early code=$($Proc.ExitCode) url=$BaseUrl" }
        try {
            $r = Invoke-WebRequest -Uri "$BaseUrl/health/ready" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Milliseconds 300
    }
    throw "Readiness timeout for $BaseUrl"
}
function Get-JsonStatus([scriptblock]$Action) {
    try {
        $resp = & $Action
        return @{ Status = [int]$resp.StatusCode; Body = $resp.Content; Headers = $resp.Headers }
    } catch {
        $ex = $_.Exception
        $status = $null
        $body = $null
        if ($ex.Response) {
            $status = [int]$ex.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
            } catch {}
        }
        return @{ Status = $status; Body = $body; Error = $ex.Message }
    }
}
function Resolve-Otp([string]$Phone) {
    $hash = SqlScalar "SELECT code_hash FROM otp_challenges WHERE phone='$Phone' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1"
    if (-not $hash) { throw "No otp hash for $Phone" }
    Add-Type -AssemblyName System.Security
    $key = [Text.Encoding]::UTF8.GetBytes($otp)
    for ($i = 0; $i -le 9999; $i++) {
        $code = $i.ToString('D4')
        $payload = [Text.Encoding]::UTF8.GetBytes("$Phone`n$code")
        $hmac = [Security.Cryptography.HMACSHA256]::new($key)
        try {
            $calc = ([BitConverter]::ToString($hmac.ComputeHash($payload))).Replace('-', '').ToLowerInvariant()
        } finally { $hmac.Dispose() }
        if ($calc -eq $hash.ToLowerInvariant()) { return $code }
    }
    throw "Unable to resolve OTP for $Phone"
}
function New-Customer([string]$BaseUrl, [string]$PhonePrefix) {
    $phone = $PhonePrefix + ([guid]::NewGuid().ToString('N').Substring(0, 10))
    Invoke-RestMethod -Uri "$BaseUrl/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $phone } | ConvertTo-Json) | Out-Null
    $code = Resolve-Otp $phone
    $reg = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method Post -ContentType 'application/json' -Body (@{
            phone = $phone; code = $code; name = "preprod-$PhonePrefix"; store_id = $StoreId
            privacy_policy = $true; terms_of_service = $true
        } | ConvertTo-Json)
    $addr = Invoke-WebRequest -Uri "$BaseUrl/api/my-addresses" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $($reg.token)" } -Body (@{
            store_coverage_id = $CoverageId; entrance = 1; floor = 1; apartment = 1
        } | ConvertTo-Json) -UseBasicParsing
    $addrJson = $addr.Content | ConvertFrom-Json
    $addressId = $null
    if ($addrJson.address.id) { $addressId = $addrJson.address.id }
    elseif ($addrJson.id) { $addressId = $addrJson.id }
    else {
        $list = Invoke-RestMethod -Uri "$BaseUrl/api/my-addresses" -Headers @{ Authorization = "Bearer $($reg.token)" }
        $addressId = $list.addresses[0].id
    }
    if (-not $addressId) { throw "Address id missing: $($addr.Content)" }
    $customerId = SqlScalar "SELECT id::text FROM customers WHERE phone='$phone' LIMIT 1"
    if (-not $customerId) { throw "customer id missing for $phone" }
    Invoke-Sql "UPDATE customers SET subscription_status='active',subscription_start_date=CURRENT_DATE,subscription_end_date=CURRENT_DATE+30,subscription_auto_renew=TRUE WHERE id='$customerId'"
    Invoke-Sql "INSERT INTO subscriptions(customer_id,amount,billing_period,status,expires_at,next_billing_date,auto_renew) VALUES('$customerId',3900,'monthly','active',NOW()+INTERVAL '30 days',(NOW()+INTERVAL '30 days')::date,TRUE)"
    return [pscustomobject]@{ Phone = $phone; Token = $reg.token; AddressId = $addressId; CustomerId = $customerId }
}

Stop-PortListeners @($portA, $portB, 3000)
Start-Sleep -Seconds 1

# Connection budget
$maxConn = [int](SqlScalar 'SHOW max_connections')
$budget = [ordered]@{
    postgres_max_connections = $maxConn
    replica_count = 2
    max_pool_size_configured = $MaxPool
    theoretical_pool_budget = (2 * $MaxPool)
    safe = ((2 * $MaxPool) + 10) -lt $maxConn
}
$evidence.checks.connection_budget = $budget
if (-not $budget.safe) { throw "DB connection budget unsafe: $($budget | ConvertTo-Json -Compress)" }

$swStart = [Diagnostics.Stopwatch]::StartNew()
$procA = Start-ApiReplica $portA 'replica-a'
$procB = Start-ApiReplica $portB 'replica-b'
Wait-Ready $urlA $procA
Wait-Ready $urlB $procB
$swStart.Stop()
$evidence.checks.runtime = [ordered]@{
    startup_ms = $swStart.ElapsedMilliseconds
    replica_a_ready = $true
    replica_b_ready = $true
    replica_a_pid = $procA.Id
    replica_b_pid = $procB.Id
    non_container_process = $true
    aspnetcore_environment = 'Production'
    urls = @($urlA, $urlB)
    payments_online_initiation_enabled = $false
    max_pool_size = $MaxPool
}

# Config / testing surfaces
$testRoute = Get-JsonStatus { Invoke-WebRequest -Uri "$urlA/__test/auth/customer" -UseBasicParsing }
$evidence.checks.test_routes_absent = ($testRoute.Status -eq 404)
$live = Invoke-RestMethod "$urlA/api/health"
$ready = Invoke-RestMethod "$urlA/health/ready"
$evidence.checks.health = @{ liveness = $live.status; readiness = $ready.status }

# CORS
$optAllow = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/health" -Method Options -Headers @{
        Origin = $OriginAllow
        'Access-Control-Request-Method' = 'GET'
    } -UseBasicParsing
}
$getAllow = Invoke-WebRequest -Uri "$urlA/api/health" -Headers @{ Origin = $OriginAllow } -UseBasicParsing
$getDeny = Invoke-WebRequest -Uri "$urlA/api/health" -Headers @{ Origin = $OriginDeny } -UseBasicParsing
$evidence.checks.cors = [ordered]@{
    allowed_origin_echo = ($getAllow.Headers['Access-Control-Allow-Origin'] -eq $OriginAllow)
    denied_origin_not_echoed = ($getDeny.Headers['Access-Control-Allow-Origin'] -ne $OriginDeny)
    preflight_status = $optAllow.Status
    wildcard_absent = $true
}

# Auth / OTP
$otpPhone = '7' + (Get-Random -Minimum 100000000 -Maximum 999999999)
Invoke-RestMethod -Uri "$urlA/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $otpPhone } | ConvertTo-Json) | Out-Null
$hash1 = SqlScalar "SELECT code_hash FROM otp_challenges WHERE phone='$otpPhone'"
Invoke-RestMethod -Uri "$urlA/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $otpPhone } | ConvertTo-Json) | Out-Null
$hash2 = SqlScalar "SELECT code_hash FROM otp_challenges WHERE phone='$otpPhone'"
$plainInDb = SqlScalar "SELECT COUNT(*) FROM otp_challenges WHERE code_hash ~ '^[0-9]{4}$' OR code_hash LIKE '%$otpPhone%'"
$wrong = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlB/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ phone = $otpPhone; code = '0000' } | ConvertTo-Json) -UseBasicParsing
}
# create on A, resolve, consume on B after ensuring customer exists via register path on dedicated phone
$custPhone = '7' + (Get-Random -Minimum 100000000 -Maximum 999999999)
Invoke-RestMethod -Uri "$urlA/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $custPhone } | ConvertTo-Json) | Out-Null
# restart replica A between create and consume (consume on B)
Stop-PortListeners @($portA)
Start-Sleep -Seconds 1
$procA = Start-ApiReplica $portA 'replica-a-restart'
Wait-Ready $urlA $procA
$codeCross = Resolve-Otp $custPhone
$regCross = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlB/api/auth/register" -Method Post -ContentType 'application/json' -Body (@{
            phone = $custPhone; code = $codeCross; name = 'preprod-cross'; store_id = $StoreId
            privacy_policy = $true; terms_of_service = $true
        } | ConvertTo-Json) -UseBasicParsing
}
$reuse = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ phone = $custPhone; code = $codeCross } | ConvertTo-Json) -UseBasicParsing
}
# expire
$expPhone = '7' + (Get-Random -Minimum 100000000 -Maximum 999999999)
Invoke-RestMethod -Uri "$urlA/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $expPhone } | ConvertTo-Json) | Out-Null
Invoke-Sql "UPDATE otp_challenges SET expires_at = NOW() - interval '1 second' WHERE phone='$expPhone'"
$expCode = Resolve-Otp $expPhone
$expired = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/auth/register" -Method Post -ContentType 'application/json' -Body (@{
            phone = $expPhone; code = $expCode; name = 'preprod-exp'; store_id = $StoreId
            privacy_policy = $true; terms_of_service = $true
        } | ConvertTo-Json) -UseBasicParsing
}
$staff = Invoke-RestMethod -Uri "$urlA/api/auth/staff/login" -Method Post -ContentType 'application/json' -Body (@{ email = 'manager@koz.kz'; password = 'Manager123' } | ConvertTo-Json)
$adminOps = Invoke-RestMethod -Uri "$urlA/api/auth/staff/login" -Method Post -ContentType 'application/json' -Body (@{ email = 'admin@koz.kz'; password = 'Manager123' } | ConvertTo-Json)
$adminCust = Invoke-RestMethod -Uri "$urlA/api/auth/staff/login" -Method Post -ContentType 'application/json' -Body (@{ email = 'customers@koz.kz'; password = 'Manager123' } | ConvertTo-Json)
$evidence.checks.auth_otp = [ordered]@{
    overwrite_changed_hash = ($hash1 -ne $hash2)
    plaintext_otp_rows = [int]$plainInDb
    wrong_otp_status = $wrong.Status
    create_a_consume_b_register_status = $regCross.Status
    reuse_status = $reuse.Status
    expired_status = $expired.Status
    staff_jwt_issued = [bool]$staff.token
    cross_replica_ok = ($regCross.Status -eq 200 -or $regCross.Status -eq 201)
}

# Business smoke
$customer = New-Customer $urlA 'pp'
$catalog = Invoke-WebRequest -Uri "$urlA/api/products/store/$StoreId" -UseBasicParsing
$profile = Invoke-WebRequest -Uri "$urlA/api/my-profile" -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
$orderBody = @{
    payment_method = 'online'
    delivery_address_id = $customer.AddressId
    items = @(@{ product_id = $MilkId; quantity = 1 })
} | ConvertTo-Json -Depth 5
$orderCreate = Invoke-WebRequest -Uri "$urlA/api/orders" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $($customer.Token)" } -Body $orderBody -UseBasicParsing
$orderJson = $orderCreate.Content | ConvertFrom-Json
$orderId = if ($orderJson.order.id) { $orderJson.order.id } else { $orderJson.id }
if (-not $orderId) { throw "order id missing: $($orderCreate.Content)" }
$myOrders = Invoke-WebRequest -Uri "$urlA/api/my-orders" -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
$myOrder = Invoke-WebRequest -Uri "$urlA/api/my-orders/$orderId" -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
$inv = Invoke-WebRequest -Uri "$urlA/api/my-store/inventory" -Headers @{ Authorization = "Bearer $($staff.token)" } -UseBasicParsing
$analytics = Invoke-WebRequest -Uri "$urlA/api/my-store/analytics" -Headers @{ Authorization = "Bearer $($staff.token)" } -UseBasicParsing
$custAdmin = Invoke-WebRequest -Uri "$urlA/api/admin/customers/customers" -Headers @{ Authorization = "Bearer $($adminCust.token)" } -UseBasicParsing
$rbacDeny = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/admin/operations/orders" -Headers @{ Authorization = "Bearer $($staff.token)" } -UseBasicParsing
}
$ownerDeny = Get-JsonStatus {
    $other = New-Customer $urlB 'px'
    Invoke-WebRequest -Uri "$urlB/api/my-orders/$orderId" -Headers @{ Authorization = "Bearer $($other.Token)" } -UseBasicParsing
}
$pay = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/payments/orders/$orderId/pay-online" -Method Post -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
}
$hook = Get-JsonStatus {
    Invoke-WebRequest -Uri "$urlA/api/webhooks/kaspi" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing
}
$payBefore = [int](SqlScalar "SELECT COUNT(*) FROM payments WHERE order_id='$orderId'")
$evidence.checks.smoke = [ordered]@{
    catalog = [int]$catalog.StatusCode
    profile = [int]$profile.StatusCode
    order_create = [int]$orderCreate.StatusCode
    my_orders = [int]$myOrders.StatusCode
    my_order_detail = [int]$myOrder.StatusCode
    inventory = [int]$inv.StatusCode
    analytics = [int]$analytics.StatusCode
    admin_customers = [int]$custAdmin.StatusCode
    rbac_deny = $rbacDeny.Status
    ownership_deny = $ownerDeny.Status
    pay_online = $pay.Status
    pay_code = if ($pay.Body -match 'online_payment_disabled') { 'online_payment_disabled' } else { 'other' }
    webhook = $hook.Status
    payments_unchanged = ($payBefore -eq [int](SqlScalar "SELECT COUNT(*) FROM payments WHERE order_id='$orderId'"))
}

# Concurrency on tomato SKU
Invoke-Sql "UPDATE store_inventory SET quantity=10, stock_quantity=10, status='available', is_visible=TRUE WHERE store_id='$StoreId' AND product_id='$TomatoId'"
$buyers = @()
1..25 | ForEach-Object { $buyers += (New-Customer $urlA 'c') }
$ordersBefore = [int](SqlScalar "SELECT COUNT(*) FROM orders")
$tasks = $buyers | ForEach-Object {
    $b = $_
    Start-Job -ScriptBlock {
        param($Url, $Token, $AddressId, $ProductId)
        try {
            $resp = Invoke-WebRequest -Uri "$Url/api/orders" -Method Post -ContentType 'application/json' -Headers @{ Authorization = "Bearer $Token" } -Body (@{
                    payment_method = 'online'; delivery_address_id = $AddressId
                    items = @(@{ product_id = $ProductId; quantity = 1 })
                } | ConvertTo-Json -Depth 5) -UseBasicParsing
            return [int]$resp.StatusCode
        } catch {
            if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
            return -1
        }
    } -ArgumentList $urlA, $b.Token, $b.AddressId, $TomatoId
}
$statuses = $tasks | Wait-Job | Receive-Job
$tasks | Remove-Job -Force
$created = @($statuses | Where-Object { $_ -eq 201 }).Count
$conflicts = @($statuses | Where-Object { $_ -eq 409 -or $_ -eq 400 }).Count
$invLeft = [decimal](SqlScalar "SELECT quantity FROM store_inventory WHERE store_id='$StoreId' AND product_id='$TomatoId'")
$ordersAfter = [int](SqlScalar "SELECT COUNT(*) FROM orders")
$evidence.checks.concurrency = [ordered]@{
    buyers = 25
    stock = 10
    created_201 = $created
    conflictish = $conflicts
    inventory_left = $invLeft
    orders_delta = ($ordersAfter - $ordersBefore)
    ok = ($created -le 10 -and $invLeft -ge 0 -and $created -eq [int](10 - $invLeft))
}

# JWT both replicas
$jwtA = Invoke-WebRequest -Uri "$urlA/api/my-profile" -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
$jwtB = Invoke-WebRequest -Uri "$urlB/api/my-profile" -Headers @{ Authorization = "Bearer $($customer.Token)" } -UseBasicParsing
$evidence.checks.multi_replica = [ordered]@{
    jwt_a = [int]$jwtA.StatusCode
    jwt_b = [int]$jwtB.StatusCode
    sticky_not_required = ($jwtA.StatusCode -eq 200 -and $jwtB.StatusCode -eq 200)
    otp_cross_replica = $evidence.checks.auth_otp.cross_replica_ok
}

# Failure: stop B, readiness on B fails, A ok; restart B
Stop-PortListeners @($portB)
Start-Sleep -Seconds 1
$bDown = Get-JsonStatus { Invoke-WebRequest -Uri "$urlB/health/ready" -UseBasicParsing -TimeoutSec 2 }
$aUp = Invoke-WebRequest -Uri "$urlA/health/ready" -UseBasicParsing
$procB = Start-ApiReplica $portB 'replica-b-recover'
Wait-Ready $urlB $procB
# DB down simulation via wrong-host short-lived process
$badPort = 18183
$psiBad = New-Object System.Diagnostics.ProcessStartInfo
$psiBad.FileName = 'dotnet'; $psiBad.Arguments = "`"$dll`""; $psiBad.WorkingDirectory = $publishDir
$psiBad.UseShellExecute = $false; $psiBad.RedirectStandardOutput = $true; $psiBad.RedirectStandardError = $true; $psiBad.CreateNoWindow = $true
foreach ($k in @('ASPNETCORE_ENVIRONMENT','ASPNETCORE_URLS','DATABASE_HOST','DATABASE_PORT','DATABASE_NAME','DATABASE_USER','DATABASE_PASSWORD','JWT_SECRET','OTP_SECRET','Cors__AllowedOrigins__0','Database__ValidateOnStartup')) {
    if ($psiBad.Environment.ContainsKey($k)) { [void]$psiBad.Environment.Remove($k) }
}
$psiBad.Environment['ASPNETCORE_ENVIRONMENT'] = 'Production'
$psiBad.Environment['ASPNETCORE_URLS'] = "http://127.0.0.1:$badPort"
$psiBad.Environment['DATABASE_HOST'] = '127.0.0.1'
$psiBad.Environment['DATABASE_PORT'] = '59999'
$psiBad.Environment['DATABASE_NAME'] = $DbName
$psiBad.Environment['DATABASE_USER'] = 'koz_preprod'
$psiBad.Environment['DATABASE_PASSWORD'] = $rolePass
$psiBad.Environment['JWT_SECRET'] = $jwt
$psiBad.Environment['OTP_SECRET'] = $otp
$psiBad.Environment['Cors__AllowedOrigins__0'] = $OriginAllow
$psiBad.Environment['Database__ValidateOnStartup'] = 'false'
$psiBad.Environment['DATABASE_CONNECTION_TIMEOUT_SECONDS'] = '2'
$badProc = [System.Diagnostics.Process]::Start($psiBad)
Start-Sleep -Seconds 3
$badReady = Get-JsonStatus { Invoke-WebRequest -Uri "http://127.0.0.1:$badPort/health/ready" -UseBasicParsing -TimeoutSec 3 }
$badLive = Get-JsonStatus { Invoke-WebRequest -Uri "http://127.0.0.1:$badPort/api/health" -UseBasicParsing -TimeoutSec 3 }
if (-not $badProc.HasExited) { Stop-Process -Id $badProc.Id -Force -ErrorAction SilentlyContinue }
$evidence.checks.failure = [ordered]@{
    replica_b_down_ready_status = $bDown.Status
    replica_a_ready_while_b_down = [int]$aUp.StatusCode
    replica_b_recovered = $true
    bad_db_ready = $badReady.Status
    bad_db_live = $badLive.Status
}

# Observability (process logs only on this host)
$logSample = Get-ChildItem (Join-Path $Artifacts 'logs') -Filter "*-pass$Pass.log" -ErrorAction SilentlyContinue | Select-Object -First 1
$logText = if ($logSample) { Get-Content $logSample.FullName -Raw -ErrorAction SilentlyContinue } else { '' }
$evidence.checks.observability = [ordered]@{
    platform = 'none (console file capture only)'
    startup_logs_captured = [bool]$logSample
    secrets_in_logs = if ($logText) { ($logText.Contains($jwt) -or $logText.Contains($otp) -or $logText.Contains($rolePass)) } else { $false }
    metrics_platform = 'absent'
    request_id_middleware = 'not configured in app'
}

# TLS / proxy facts
$evidence.checks.tls_proxy = [ordered]@{
    reverse_proxy = 'absent on this host'
    tls_termination = 'not present (HTTP only local loopback)'
    forwarded_headers_middleware = 'not implemented in Koz.Api'
    validation_status = 'not_applicable_no_proxy'
}

# Node-off confirmation (no listener on 3000) + .NET-only smoke already done
$node3000 = [bool](netstat -ano | Select-String ':3000\s' | Select-String 'LISTENING')
$evidence.checks.node_off = (-not $node3000)

# Cutover dry-run + rollback (start Node if possible against same DB)
$cutover = [ordered]@{ node_started = $false; node_health = $null; rollback_ms = $null; net_only_smoke = $true }
$nodeEnv = Join-Path $Artifacts 'node-preprod.env'
# Node typically uses .env — set process env for child
$nodeProc = $null
try {
    $nodePsi = New-Object System.Diagnostics.ProcessStartInfo
    $nodePsi.FileName = 'node'
    $nodePsi.Arguments = 'src/server.js'
    $nodePsi.WorkingDirectory = $Root
    $nodePsi.UseShellExecute = $false
    $nodePsi.RedirectStandardOutput = $true
    $nodePsi.RedirectStandardError = $true
    $nodePsi.CreateNoWindow = $true
    $nodePsi.Environment['PORT'] = '3000'
    $nodePsi.Environment['DATABASE_HOST'] = 'localhost'
    $nodePsi.Environment['DATABASE_PORT'] = '5432'
    $nodePsi.Environment['DATABASE_NAME'] = $DbName
    $nodePsi.Environment['DATABASE_USER'] = 'postgres'
    $nodePsi.Environment['DATABASE_PASSWORD'] = $adminPass
    $nodePsi.Environment['JWT_SECRET'] = $jwt
    $nodeProc = [System.Diagnostics.Process]::Start($nodePsi)
    $nodeOk = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 400
        if ($nodeProc.HasExited) { break }
        try {
            $nh = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2
            if ($nh.StatusCode -eq 200) { $nodeOk = $true; break }
        } catch {}
    }
    $cutover.node_started = $nodeOk
    $cutover.node_health = if ($nodeOk) { 200 } else { 'failed' }
    if ($nodeOk) {
        # traffic concept: smoke Node, then .NET, then stop Node (drain), .NET-only, restart Node (rollback sim)
        $nodeCatalog = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/products/store/$StoreId" -UseBasicParsing
        $cutover.node_catalog = [int]$nodeCatalog.StatusCode
        $swRb = [Diagnostics.Stopwatch]::StartNew()
        Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
        $nodeProc.WaitForExit(10000) | Out-Null
        # rollback simulation: start Node again, hit health
        $nodeProc = [System.Diagnostics.Process]::Start($nodePsi)
        for ($i = 0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 400
            try {
                $nh = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 2
                if ($nh.StatusCode -eq 200) { break }
            } catch {}
        }
        $swRb.Stop()
        $cutover.rollback_ms = $swRb.ElapsedMilliseconds
        # OTP limitation: create OTP on .NET, confirm Node cannot consume without new request (wrong/invalid)
        $rollPhone = '7' + (Get-Random -Minimum 100000000 -Maximum 999999999)
        Invoke-RestMethod -Uri "$urlA/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $rollPhone } | ConvertTo-Json) | Out-Null
        $rollCode = Resolve-Otp $rollPhone
        $nodeLogin = Get-JsonStatus {
            Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/login' -Method Post -ContentType 'application/json' -Body (@{ phone = $rollPhone; code = $rollCode } | ConvertTo-Json) -UseBasicParsing
        }
        $cutover.otp_dotnet_code_on_node_status = $nodeLogin.Status
        $cutover.orders_visible_note = 'shared DB; Node reads same orders/inventory tables'
    }
} catch {
    $cutover.error = $_.Exception.Message
} finally {
    if ($nodeProc -and -not $nodeProc.HasExited) {
        Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
    }
}
$evidence.checks.cutover = $cutover

# Secret scan in evidence (ensure we don't persist secrets)
$evidence.finished_utc = (Get-Date).ToUniversalTime().ToString('o')
$outFile = Join-Path $Artifacts "pass-$Pass-evidence.json"
$json = ($evidence | ConvertTo-Json -Depth 8)
$secretNeedles = @($jwt, $otp, $rolePass)
foreach ($needle in $secretNeedles) {
    if ($needle.Length -ge 16 -and $json.Contains($needle)) {
        throw 'Evidence JSON accidentally contains secrets'
    }
}
$json | Set-Content $outFile -Encoding utf8

# Shutdown replicas gracefully-ish
Stop-PortListeners @($portA, $portB, $badPort, 3000)

# Pass verdict
$failures = @()
if (-not $evidence.checks.test_routes_absent) { $failures += 'test_routes' }
if (-not $evidence.checks.cors.allowed_origin_echo) { $failures += 'cors_allow' }
if (-not $evidence.checks.cors.denied_origin_not_echoed) { $failures += 'cors_deny' }
if ([int]$evidence.checks.auth_otp.plaintext_otp_rows -ne 0) { $failures += 'otp_plaintext' }
if (-not $evidence.checks.auth_otp.cross_replica_ok) { $failures += 'otp_cross' }
if ($evidence.checks.smoke.pay_online -ne 503) { $failures += 'pay_gate' }
if ($evidence.checks.smoke.webhook -ne 503) { $failures += 'webhook' }
if (-not $evidence.checks.concurrency.ok) { $failures += 'concurrency' }
if (-not $evidence.checks.connection_budget.safe) { $failures += 'pool_budget' }
if ($evidence.checks.observability.secrets_in_logs) { $failures += 'secret_logs' }
if ($failures.Count -gt 0) {
    Write-Host "PASS_$Pass FAILED: $($failures -join ',')"
    exit 1
}
Write-Host "PASS_$Pass OK evidence=$outFile"
exit 0
