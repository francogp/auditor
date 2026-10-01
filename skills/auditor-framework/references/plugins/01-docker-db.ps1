# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$containerName = "facturacion-postgres"
$image = "postgres:16-alpine"
$dbPort = "5432"

Write-Host "🐘 [Plugin 01] Verificando contenedor Docker de Base de Datos ($containerName)..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker no está instalado en este sistema. Omitiendo arranque de DB."
    exit 0
}

$running = docker ps -q -f "name=^/${containerName}$"
if ($running) {
    Write-Host "  ✅ Contenedor $containerName ya está en ejecución." -ForegroundColor Green
    exit 0
}

$exited = docker ps -aq -f "status=exited" -f "name=^/${containerName}$"
if ($exited) {
    Write-Host "  🔄 Iniciando contenedor existente $containerName..." -ForegroundColor Yellow
    docker start $containerName | Out-Null
    Write-Host "  ✅ Contenedor iniciado." -ForegroundColor Green
    exit 0
}

Write-Host "  🚀 Creando y arrancando nuevo contenedor $containerName..." -ForegroundColor Yellow
docker run -d `
  --name $containerName `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=facturacion `
  -p "${dbPort}:5432" `
  $image | Out-Null

Write-Host "  ✅ Contenedor $containerName creado y escuchando en puerto $dbPort." -ForegroundColor Green
