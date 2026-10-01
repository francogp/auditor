param(
    [switch]$DeclaredVersions = $false,
    [switch]$Locked = $false,
    [switch]$Pinned = $false,
    [switch]$UpdateVersion = $false,
    [switch]$PruneOtherVersions = $false,
    [switch]$SetDefault = $false
)

# Script Canónico de Inicialización y Preparación de Entorno para Windows (PowerShell)
# Proporcionado por @francogp/auditor - Cero Hardcoding, Aislamiento Multi-Proyecto y Soporte de Plugins

$ErrorActionPreference = "Stop"

# Por defecto: actualiza automáticamente a la última versión estable (Node.js Current + npm@latest)
# -DeclaredVersions / -Locked / -Pinned: restringe la instalación estrictamente a lo declarado en el commit (.nvmrc / package.json)
$updateToLatest = -not ($DeclaredVersions -or $Locked -or $Pinned)
if ($UpdateVersion) {
    $updateToLatest = $true
}

# Forzar codificación UTF-8 en consola de Windows
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

# Función para recargar todas las variables de entorno de Machine y User en la sesión actual
function Refresh-ProcessEnvironment {
    foreach ($level in "Machine", "User") {
        [System.Environment]::GetEnvironmentVariables($level).GetEnumerator() | ForEach-Object {
            if ($_.Key -ne "Path") {
                [System.Environment]::SetEnvironmentVariable($_.Key, $_.Value, "Process")
            }
        }
    }

    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $combinedPath = "$machinePath;$userPath"
    $cleanPath = ($combinedPath -split ';' | Where-Object { [string]::IsNullOrWhiteSpace($_) -eq $false } | Select-Object -Unique) -join ';'
    [System.Environment]::SetEnvironmentVariable("Path", $cleanPath, "Process")
    $env:Path = $cleanPath
}

Refresh-ProcessEnvironment

# 1. Determinar versión de Node.js y nombre de proyecto
$pkgPath = Join-Path $PSScriptRoot "package.json"
$nvmrcPath = Join-Path $PSScriptRoot ".nvmrc"

if (-not (Test-Path $pkgPath)) {
    Write-Host "[ERROR] No se encontró package.json en $pkgPath" -ForegroundColor Red
    exit 1
}

$pkgContent = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
$projectName = if ($pkgContent.name) { $pkgContent.name } else { (Split-Path $PSScriptRoot -Leaf) }

$targetNodeVer = ""

if ($updateToLatest) {
    Write-Host "[NODE] Consultando la última versión Current estable de Node.js en nodejs.org..." -ForegroundColor Cyan
    try {
        $nodeDist = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 10 -ErrorAction Stop
        foreach ($item in $nodeDist) {
            if ($item.version -match '^v?(\d+\.\d+\.\d+)$') {
                $targetNodeVer = $Matches[1]
                break
            }
        }
        if ($targetNodeVer) {
            $expectedNodeEngine = ">=$targetNodeVer"
            $pkgRaw = Get-Content -Raw -Path $pkgPath
            $pkgUpdated = $pkgRaw -replace '("node":\s*")[^"]*(")', "`$1$expectedNodeEngine`$2"
            [System.IO.File]::WriteAllText($pkgPath, $pkgUpdated, (New-Object System.Text.UTF8Encoding $false))
            [System.IO.File]::WriteAllText($nvmrcPath, $targetNodeVer, (New-Object System.Text.UTF8Encoding $false))
            Write-Host "[CONFIG] Sincronizado package.json y .nvmrc con v$targetNodeVer" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] No se pudo consultar la API de nodejs.org: $_. Usando definición local..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[NODE] Modo versiones declaradas activo (-DeclaredVersions). Preservando versión exacta de .nvmrc..." -ForegroundColor Cyan
}

# Si no hubo consulta o falló: leer .nvmrc
if (-not $targetNodeVer -and (Test-Path $nvmrcPath)) {
    $rawNvmrc = (Get-Content -Raw -Path $nvmrcPath).Trim() -replace '^v', ''
    if ($rawNvmrc) {
        $targetNodeVer = $rawNvmrc
    }
}

# Fallback a package.json
if (-not $targetNodeVer -and $pkgContent.engines -and $pkgContent.engines.node) {
    $targetNodeVer = $pkgContent.engines.node -replace '[^0-9.]', ''
}

if (-not $targetNodeVer) {
    Write-Host "[ERROR] No se pudo determinar la versión de Node.js a instalar." -ForegroundColor Red
    exit 1
}

# Invariante Dinámico: Si el proyecto host usa @francogp/auditor, validar que no sea inferior
$auditorPkgPath = Join-Path $PSScriptRoot "node_modules/@francogp/auditor/package.json"
if (Test-Path $auditorPkgPath) {
    try {
        $auditorPkg = Get-Content -Raw -Path $auditorPkgPath | ConvertFrom-Json
        if ($auditorPkg.engines -and $auditorPkg.engines.node) {
            $auditorNodeMin = $auditorPkg.engines.node -replace '[^0-9.]', ''
            $targetSemver = [System.Version]$targetNodeVer
            $auditorSemver = [System.Version]$auditorNodeMin
            if ($targetSemver -lt $auditorSemver) {
                Write-Host "[ERROR] La versión objetivo v$targetNodeVer es INFERIOR al mínimo exigido por @francogp/auditor (v$auditorNodeMin)." -ForegroundColor Red
                exit 1
            }
        }
    } catch {}
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " [SETUP] PREPARACIÓN DE ENTORNO NODE (v$targetNodeVer) [$projectName]" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 2. Detectar NVM para Windows y asegurar rutas
$nvmPossiblePaths = @(
    $env:NVM_HOME,
    "$env:LOCALAPPDATA\nvm",
    "$env:APPDATA\nvm",
    "C:\Program Files\nvm"
)
$nvmRoot = ""
foreach ($nvmDir in $nvmPossiblePaths) {
    if ($nvmDir -and (Test-Path -Path (Join-Path $nvmDir "nvm.exe"))) {
        $nvmRoot = $nvmDir
        if (-not $env:NVM_HOME) { $env:NVM_HOME = $nvmDir }
        if ($env:Path -notlike "*$nvmDir*") { $env:Path = "$nvmDir;" + $env:Path }
        break
    }
}

if (-not $nvmRoot) {
    if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "[NVM] NVM para Windows no detectado. Intentando instalar via winget..." -ForegroundColor Yellow
        try {
            winget install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements
            Refresh-ProcessEnvironment
        } catch {
            Write-Host "  [WARN] No se pudo instalar NVM via winget: $_" -ForegroundColor Yellow
        }
    }
}

if (-not $nvmRoot) {
    $nvmRoot = "$env:LOCALAPPDATA\nvm"
    if (-not (Test-Path $nvmRoot)) {
        New-Item -ItemType Directory -Path $nvmRoot -Force | Out-Null
    }
}

# 3. Asegurar el directorio receptor del Symlink/Junction de Node
$nodeSymlinkPath = if ($env:NVM_SYMLINK) { $env:NVM_SYMLINK } else { "C:\nvm4w\nodejs" }
$parentSymlinkDir = Split-Path -Parent $nodeSymlinkPath
if ($parentSymlinkDir -and -not (Test-Path -Path $parentSymlinkDir)) {
    try {
        New-Item -ItemType Directory -Path $parentSymlinkDir -Force | Out-Null
    } catch {
        $nodeSymlinkPath = "$env:LOCALAPPDATA\nodejs"
        $parentSymlinkDir = Split-Path -Parent $nodeSymlinkPath
        New-Item -ItemType Directory -Path $parentSymlinkDir -Force | Out-Null
    }
}

# 4. Instalar Node.js objetivo si no existe
$targetNodeDir = Join-Path $nvmRoot "v$targetNodeVer"
$nodeExePath = Join-Path $targetNodeDir "node.exe"

if (-not (Test-Path $nodeExePath)) {
    Write-Host ""
    Write-Host "[NODE] Instalando Node.js v$targetNodeVer..." -ForegroundColor Cyan
    $installedViaNvm = $false
    if (Get-Command nvm -ErrorAction SilentlyContinue) {
        try {
            nvm install $targetNodeVer
            if (Test-Path $nodeExePath) {
                $installedViaNvm = $true
            }
        } catch {}
    }

    if (-not $installedViaNvm -and -not (Test-Path $nodeExePath)) {
        Write-Host "  [DOWNLOAD] Descargando binarios oficiales de Node.js v$targetNodeVer..." -ForegroundColor Cyan
        $zipUrl = "https://nodejs.org/dist/v$targetNodeVer/node-v$targetNodeVer-win-x64.zip"
        $tempZip = Join-Path $env:TEMP "node-v$targetNodeVer-win-x64.zip"
        $tempExtractDir = Join-Path $env:TEMP "node-v$targetNodeVer-extract"

        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
            Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing -TimeoutSec 120
            
            if (Test-Path $tempExtractDir) {
                Remove-Item -Path $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
            }
            Expand-Archive -Path $tempZip -DestinationPath $tempExtractDir -Force

            $extractedSubdir = Join-Path $tempExtractDir "node-v$targetNodeVer-win-x64"
            if (-not (Test-Path $targetNodeDir)) {
                New-Item -ItemType Directory -Path $targetNodeDir -Force | Out-Null
            }
            Copy-Item -Path "$extractedSubdir\*" -Destination $targetNodeDir -Recurse -Force
            Remove-Item -Path $tempZip, $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Node.js v$targetNodeVer extraído correctamente en $targetNodeDir" -ForegroundColor Green
        } catch {
            Write-Host "  [ERROR] Falló la descarga y extracción de Node.js: $_" -ForegroundColor Red
            exit 1
        }
    }
}

# 5. Activar Node.js (con fallback nativo Junction)
Write-Host ""
Write-Host "[NODE] Activando Node.js v$targetNodeVer..." -ForegroundColor Cyan
$activated = $false

if (Test-Path $targetNodeDir) {
    try {
        if (Test-Path $nodeSymlinkPath) {
            Remove-Item -Path $nodeSymlinkPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Junction -Path $nodeSymlinkPath -Target $targetNodeDir -Force | Out-Null
        if (Test-Path (Join-Path $nodeSymlinkPath "node.exe")) {
            $activated = $true
        }
    } catch {
        $nodeSymlinkPath = "$env:LOCALAPPDATA\nodejs"
        if (Test-Path $nodeSymlinkPath) {
            Remove-Item -Path $nodeSymlinkPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Junction -Path $nodeSymlinkPath -Target $targetNodeDir -Force | Out-Null
        if (Test-Path (Join-Path $nodeSymlinkPath "node.exe")) {
            $activated = $true
        }
    }
}

if (-not $activated -and (Get-Command nvm -ErrorAction SilentlyContinue)) {
    try {
        nvm use $targetNodeVer 2>$null
        if (Test-Path (Join-Path $nodeSymlinkPath "node.exe")) {
            $activated = $true
        }
    } catch {}
}

# 6. Limpieza de versiones obsoletas (ESTRICTAMENTE OPT-IN con -PruneOtherVersions)
if ($PruneOtherVersions) {
    Write-Host ""
    Write-Host "[CLEANUP] Limpiando versiones obsoletas de Node.js (-PruneOtherVersions activado)..." -ForegroundColor Cyan
    try {
        Get-ChildItem -Path $nvmRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^v\d+\.\d+\.\d+$' -and $_.Name -ne "v$targetNodeVer" } | ForEach-Object {
            $verName = $_.Name
            Write-Host "  [-] Eliminando versión: $verName..." -ForegroundColor Yellow
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            if (Test-Path $_.FullName -and (Get-Command nvm -ErrorAction SilentlyContinue)) {
                nvm uninstall ($verName -replace '^v','') 2>$null | Out-Null
            }
        }
    } catch {}
} else {
    Write-Host ""
    Write-Host "[INFO] Preservando todas las demás versiones de Node.js instaladas para convivencia multi-proyecto." -ForegroundColor Cyan
}

# Asegurar que el symlink activo de Node y Roaming npm estén en el PATH de la sesión actual
$npmRoamingPath = "$env:APPDATA\npm"
if ($env:Path -notlike "*$nodeSymlinkPath*") {
    $env:Path = "$nodeSymlinkPath;" + $env:Path
}
if ($env:Path -notlike "*$npmRoamingPath*") {
    $env:Path = "$npmRoamingPath;" + $env:Path
}

# 7. Actualizar npm a la última versión
Write-Host ""
if ($updateToLatest) {
    Write-Host "[NPM] Actualizando npm a la última versión global (npm@latest)..." -ForegroundColor Cyan
    try {
        npm install -g npm@latest
    } catch {
        Write-Host "  [WARN] Advertencia al actualizar npm global: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[NPM] Preservando versión activa de npm ($((npm -v)))." -ForegroundColor Gray
}

# 8. Verificación de configuración NPM aislada al proyecto
Write-Host ""
Write-Host "[CONFIG] Verificando políticas de NPM (.npmrc local del proyecto)..." -ForegroundColor Cyan
$projectNpmrc = Join-Path $PSScriptRoot ".npmrc"
if (-not (Test-Path $projectNpmrc)) {
    $npmrcContent = @"
# $projectName - Local Project NPM Configuration
ignore-scripts=true
registry=https://registry.npmjs.org/
audit-level=high
"@
    [System.IO.File]::WriteAllText($projectNpmrc, $npmrcContent, (New-Object System.Text.UTF8Encoding $false))
    Write-Host " [CONFIG] Archivo .npmrc local inicializado correctamente." -ForegroundColor Green
} else {
    Write-Host " [CONFIG] Archivo .npmrc local detectado y activo." -ForegroundColor Green
}

# 9. Instalar dependencias limpias del proyecto
Write-Host ""
Write-Host "[DEPENDENCIES] Instalando dependencias del proyecto con npm ci..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
npm ci

# 10. Desbloquear binarios nativos descargados por npm en Windows
Write-Host ""
Write-Host "[SECURITY] Desbloqueando binarios nativos de node_modules..." -ForegroundColor Cyan
$nodeModulesDir = Join-Path $PSScriptRoot "node_modules"
if (Test-Path $nodeModulesDir) {
    Get-ChildItem -Path $nodeModulesDir -Include "*.node", "*.dll", "*.exe" -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
}

# 11. Validar y compilar herramientas nativas auxiliares si existe el script
if ($pkgContent.scripts -and $pkgContent.scripts.'validate:tools') {
    Write-Host ""
    Write-Host "[BUILD-TOOLS] Validando herramientas nativas auxiliares..." -ForegroundColor Cyan
    npm run validate:tools
}

# 12. Ejecutar Plugins Específicos del Proyecto (scripts\setup\plugins\*.ps1)
$pluginsDir = Join-Path $PSScriptRoot "scripts\setup\plugins"
if (Test-Path $pluginsDir) {
    Get-ChildItem -Path $pluginsDir -Filter "*.ps1" -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
        Write-Host ""
        Write-Host "[PLUGIN] Ejecutando plugin de setup: $($_.Name)..." -ForegroundColor Cyan
        & $_.FullName
    }
}

# 13. Gancho npm opcional: env:post-setup
if ($pkgContent.scripts -and $pkgContent.scripts.'env:post-setup') {
    Write-Host ""
    Write-Host "[HOOK] Ejecutando gancho post-setup (npm run env:post-setup)..." -ForegroundColor Cyan
    npm run env:post-setup
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " [SUCCESS] ENTORNO Y DEPENDENCIAS PREPARADOS CON ÉXITO!" -ForegroundColor Green
Write-Host " Proyecto: $projectName" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "Versiones activas en esta sesión:"
node -v
npm -v
Write-Host ""
Write-Host "[NOTE] Si tienes terminales del IDE previamente abiertas, recárgalas para heredar el PATH actualizado." -ForegroundColor Cyan
Write-Host "Todo listo para trabajar." -ForegroundColor Yellow
Write-Host ""
