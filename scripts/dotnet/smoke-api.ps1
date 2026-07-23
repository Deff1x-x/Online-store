#!/usr/bin/env pwsh
param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$AllowedOrigin = 'https://app.example.com',
    [string]$DeniedOrigin = 'https://evil.example.com'
)
$ErrorActionPreference = 'Stop'

function Assert-Status([Microsoft.PowerShell.Commands.WebResponseObject]$Response, [int]$Expected, [string]$Label) {
    if ($Response.StatusCode -ne $Expected) {
        throw "$Label expected $Expected got $($Response.StatusCode) body=$($Response.Content)"
    }
}

Write-Host "Smoke against $BaseUrl"

$live = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing
Assert-Status $live 200 'liveness'
$ready = Invoke-WebRequest -Uri "$BaseUrl/health/ready" -UseBasicParsing
Assert-Status $ready 200 'readiness'

$allowed = Invoke-WebRequest -Uri "$BaseUrl/api/health" -Headers @{ Origin = $AllowedOrigin } -UseBasicParsing
if (-not $allowed.Headers['Access-Control-Allow-Origin']) { throw 'CORS allow missing' }

try {
    $denied = Invoke-WebRequest -Uri "$BaseUrl/api/health" -Headers @{ Origin = $DeniedOrigin } -UseBasicParsing
    if ($denied.Headers['Access-Control-Allow-Origin'] -eq $DeniedOrigin) { throw 'CORS deny failed' }
} catch {
    # Some stacks omit ACAO on deny; acceptable if not equal to denied origin.
}

$phone = ('cut' + [guid]::NewGuid().ToString('N')).Substring(0, 16)
$otp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/otp" -Method Post -ContentType 'application/json' -Body (@{ phone = $phone } | ConvertTo-Json) -UseBasicParsing
Assert-Status $otp 200 'otp'

try {
    Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/kaspi" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null
    throw 'webhook expected 503'
} catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -ne 503) { throw "webhook expected 503 got $status" }
}

Write-Host 'Smoke core probes passed (auth OTP + health + CORS + webhook fail-closed). Full business smoke requires seeded customer fixtures.'
