# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$certDir = "certs"
$keyFile = Join-Path $certDir "localhost-key.pem"
$certFile = Join-Path $certDir "localhost.pem"

Write-Host "🔐 [Plugin 02] Verificando certificados SSL locales para desarrollo..." -ForegroundColor Cyan

if ((Test-Path $keyFile) -and (Test-Path $certFile)) {
    Write-Host "  ✅ Certificados SSL locales ya existen en $certDir/." -ForegroundColor Green
    exit 0
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (Get-Command mkcert -ErrorAction SilentlyContinue) {
    Write-Host "  🔑 Generando certificados con mkcert..." -ForegroundColor Yellow
    mkcert -install
    mkcert -key-file $keyFile -cert-file $certFile localhost 127.0.0.1 ::1
    Write-Host "  ✅ Certificados generados correctamente." -ForegroundColor Green
} else {
    Write-Warning "mkcert no encontrado. Omitiendo generación automática de SSL."
    Write-Host "     Para HTTPS local, instala mkcert: choco install mkcert" -ForegroundColor Gray
}
