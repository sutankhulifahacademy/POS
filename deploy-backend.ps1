# Quick backend deploy: copy file ke container + restart
# Usage: powershell -ExecutionPolicy Bypass -File deploy-backend.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"

Write-Host "[1/2] Copying backend files to rdi-backend..." -ForegroundColor Cyan
# Copy semua file .py di root backend
Get-ChildItem "$backend\*.py" | ForEach-Object {
    docker cp $_.FullName "rdi-backend:/app/$($_.Name)"
}
# Copy folder models & routes
docker cp "$backend\models" "rdi-backend:/app/models_tmp"
docker exec rdi-frontend sh -c "true" 2>$null  # noop just to ensure docker works
docker exec rdi-backend sh -c "rm -rf /app/models && mv /app/models_tmp /app/models"
docker cp "$backend\routes" "rdi-backend:/app/routes_tmp"
docker exec rdi-backend sh -c "rm -rf /app/routes && mv /app/routes_tmp /app/routes"

Write-Host "[2/2] Restarting rdi-backend..." -ForegroundColor Cyan
docker restart rdi-backend
Start-Sleep -Seconds 5

$status = docker ps --filter "name=rdi-backend" --format "{{.Status}}"
Write-Host "Backend status: $status" -ForegroundColor Green
Write-Host "Done! Backend deployed." -ForegroundColor Green
