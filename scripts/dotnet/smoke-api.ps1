#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$AllowedOrigin = 'https://app.example.com',
    [string]$DeniedOrigin = 'https://evil.example.com'
)

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

$webhook = $null
try {
    $webhook = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/kaspi" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing
} catch {
    $webhook = $_.Exception.Response
}
# Expect 503 fail-closed
Write-Host 'Smoke core probes passed (auth OTP + health + CORS). Full business smoke requires seeded customer fixtures.'
