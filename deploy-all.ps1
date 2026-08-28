# Deploy backend + frontend sekaligus (cepat)
# Usage: powershell -ExecutionPolicy Bypass -File deploy-all.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== DEPLOY BACKEND ===" -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File "$root\deploy-backend.ps1"

Write-Host ""
Write-Host "=== DEPLOY FRONTEND ===" -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File "$root\deploy-frontend.ps1"

Write-Host ""
Write-Host "=== ALL DEPLOYED ===" -ForegroundColor Green
