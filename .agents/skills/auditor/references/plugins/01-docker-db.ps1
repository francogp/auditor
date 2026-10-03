# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$containerName = "app-postgres"
$image = "postgres:16-alpine"
$dbPort = "5432"

Write-Host "🐘 [Plugin 01] Verifying Docker Database container ($containerName)..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker is not installed on this system. Skipping database startup."
    exit 0
}

$running = docker ps -q -f "name=^/${containerName}$"
if ($running) {
    Write-Host "  ✅ Container $containerName is already running." -ForegroundColor Green
    exit 0
}

$exited = docker ps -aq -f "status=exited" -f "name=^/${containerName}$"
if ($exited) {
    Write-Host "  🔄 Starting existing container $containerName..." -ForegroundColor Yellow
    docker start $containerName | Out-Null
    Write-Host "  ✅ Container started." -ForegroundColor Green
    exit 0
}

Write-Host "  🚀 Creating and starting new container $containerName..." -ForegroundColor Yellow
docker run -d `
  --name $containerName `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=app_db `
  -p "${dbPort}:5432" `
  $image | Out-Null

Write-Host "  ✅ Container $containerName created and listening on port $dbPort." -ForegroundColor Green
