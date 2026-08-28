# Quick frontend deploy: build lokal + copy ke container nginx
# Usage: powershell -ExecutionPolicy Bypass -File deploy-frontend.ps1
param(
    [string]$BackendUrl = "http://localhost:8001"
)

$ErrorActionPreference = "Stop"
$frontendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $frontendDir "frontend"

Write-Host "[1/3] Building frontend locally..." -ForegroundColor Cyan
Push-Location $frontendDir
try {
    $env:REACT_APP_BACKEND_URL = $BackendUrl
    $ErrorActionPreference = "Continue"
    & "C:\Program Files\nodejs\node.exe" "node_modules\@craco\craco\dist\bin\craco.js" build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }
    $ErrorActionPreference = "Stop"
}
finally { Pop-Location }

Write-Host "[2/3] Copying build to rdi-frontend container..." -ForegroundColor Cyan
docker exec rdi-frontend sh -c "rm -rf /usr/share/nginx/html/*"
docker cp "$frontendDir\build\." rdi-frontend:/usr/share/nginx/html/

Write-Host "[3/3] Reloading nginx..." -ForegroundColor Cyan
docker exec rdi-frontend nginx -s reload

Write-Host "Done! Frontend deployed." -ForegroundColor Green
