# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$certDir = "certs"
$keyFile = Join-Path $certDir "localhost-key.pem"
$certFile = Join-Path $certDir "localhost.pem"

Write-Host "[Plugin 02] Verifying local development SSL certificates..." -ForegroundColor Cyan

if ((Test-Path $keyFile) -and (Test-Path $certFile)) {
    Write-Host "  [OK] Local SSL certificates already exist in $certDir/." -ForegroundColor Green
    exit 0
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (Get-Command mkcert -ErrorAction SilentlyContinue) {
    Write-Host "  [GEN] Generating certificates with mkcert..." -ForegroundColor Yellow
    mkcert -install
    mkcert -key-file $keyFile -cert-file $certFile localhost 127.0.0.1 ::1
    Write-Host "  [OK] Certificates successfully generated." -ForegroundColor Green
} else {
    Write-Warning "[WARN] mkcert not found. Skipping automatic SSL generation."
    Write-Host "     For local HTTPS, install mkcert: choco install mkcert" -ForegroundColor Gray
}
