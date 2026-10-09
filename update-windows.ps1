# Dedicated Environment Updater for Windows (@francogp/auditor)
# Updates Node.js to latest Current, updates npm, and synchronizes .nvmrc & package.json.

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "setup-windows.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Host "[ERROR] setup-windows.ps1 not found in $PSScriptRoot" -ForegroundColor Red
    exit 1
}

& $scriptPath -UpdateVersion @args
