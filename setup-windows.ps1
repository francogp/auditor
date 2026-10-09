param(
    [switch]$DeclaredVersions = $false,
    [switch]$Locked = $false,
    [switch]$Pinned = $false,
    [switch]$UpdateVersion = $false,
    [switch]$PruneOtherVersions = $false,
    [switch]$SetDefault = $false,
    [switch]$ConfigureFallow = $false
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
function Find-NvmInstallation {
    $candidates = @(
        $env:NVM_HOME,
        [System.Environment]::GetEnvironmentVariable("NVM_HOME", "Machine"),
        [System.Environment]::GetEnvironmentVariable("NVM_HOME", "User"),
        "$env:LOCALAPPDATA\nvm",
        "$env:APPDATA\nvm",
        "C:\Program Files\nvm",
        "C:\Program Files (x86)\nvm"
    )
    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path -Path (Join-Path $dir "nvm.exe"))) {
            return $dir
        }
    }
    return ""
}

$nvmRoot = Find-NvmInstallation
if ($nvmRoot) {
    if (-not $env:NVM_HOME) { $env:NVM_HOME = $nvmRoot }
    if ($env:Path -notlike "*$nvmRoot*") { $env:Path = "$nvmRoot;" + $env:Path }
}

if (-not $nvmRoot -and -not (Get-Command nvm -ErrorAction SilentlyContinue)) {
    $wingetCmd = if (Get-Command winget -ErrorAction SilentlyContinue) {
        "winget"
    } elseif (Test-Path "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe") {
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
    } else {
        ""
    }

    if ($wingetCmd) {
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        $wingetArgs = "install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements"

        if ($isAdmin) {
            Write-Host ""
            Write-Host "[NVM] NVM para Windows no detectado. Instalando via winget..." -ForegroundColor Cyan
            try {
                if ($wingetCmd -eq "winget") {
                    winget install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements
                } else {
                    & $wingetCmd install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements
                }
                Refresh-ProcessEnvironment
            } catch {
                Write-Host "  [WARN] No se pudo instalar NVM via winget: $_" -ForegroundColor Yellow
            }
        } else {
            Write-Host ""
            Write-Host "[NVM] NVM para Windows no detectado. Intentando instalar via winget..." -ForegroundColor Yellow
            Write-Host "  [SECURITY] Se requieren permisos de Administrador para instalar NVM for Windows." -ForegroundColor Yellow
            Write-Host "  [SECURITY] Solicitando elevación para instalar NVM via winget..." -ForegroundColor Cyan
            $wingetInstallCmd = if ($wingetCmd -eq "winget") {
                "winget $wingetArgs; exit `$LASTEXITCODE"
            } else {
                "& '$wingetCmd' $wingetArgs; exit `$LASTEXITCODE"
            }
            try {
                $elevProc = Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -Command `"$wingetInstallCmd`"" -PassThru -Wait
                if ($elevProc.ExitCode -eq 0) {
                    Write-Host "  [OK] NVM for Windows instalado con éxito mediante elevación UAC." -ForegroundColor Green
                    Refresh-ProcessEnvironment
                } else {
                    Write-Host "  [WARN] La instalación de NVM mediante elevación finalizó con código $($elevProc.ExitCode)." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  [WARN] Permisos de Administrador omitidos o denegados. NVM for Windows no se pudo instalar automáticamente." -ForegroundColor Yellow
                Write-Host "         Para instalarlo manualmente en una consola con privilegios de Administrador:" -ForegroundColor Gray
                Write-Host "         winget install CoreyButler.NVMforWindows" -ForegroundColor Cyan
            }
        }

        # Re-detectar NVM tras el intento de instalación
        $nvmRoot = Find-NvmInstallation
        if ($nvmRoot) {
            if (-not $env:NVM_HOME) { $env:NVM_HOME = $nvmRoot }
            if ($env:Path -notlike "*$nvmRoot*") { $env:Path = "$nvmRoot;" + $env:Path }
        }
    } else {
        Write-Host ""
        Write-Host "[NVM] NVM para Windows no detectado y winget no está disponible." -ForegroundColor Yellow
    }
}

if (-not $nvmRoot) {
    $nvmRoot = "$env:LOCALAPPDATA\nvm"
    if (-not (Test-Path $nvmRoot)) {
        New-Item -ItemType Directory -Path $nvmRoot -Force | Out-Null
    }
} else {
    # Verificar si el directorio nvmRoot tiene permisos de escritura; de lo contrario, usar fallback de usuario
    try {
        $testFile = Join-Path $nvmRoot ".test-write-$PID"
        [System.IO.File]::WriteAllText($testFile, "test")
        Remove-Item -Path $testFile -Force -ErrorAction SilentlyContinue
    } catch {
        $nvmRoot = "$env:LOCALAPPDATA\nvm"
        if (-not (Test-Path $nvmRoot)) {
            New-Item -ItemType Directory -Path $nvmRoot -Force | Out-Null
        }
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

if (-not $activated -and (Get-Command fnm -ErrorAction SilentlyContinue)) {
    try {
        fnm use $targetNodeVer 2>$null
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

# Asegurar precedencia de la versión objetivo en el PATH del proceso actual (Aislamiento de Sesión)
# Esto garantiza que el proceso actual siempre ejecute la versión exacta de .nvmrc incluso si otro
# proceso en Windows modifica concurrentemente el Junction global ($nodeSymlinkPath).
if ($targetNodeDir -and (Test-Path (Join-Path $targetNodeDir "node.exe"))) {
    if ($env:Path -notlike "*$targetNodeDir*") {
        $env:Path = "$targetNodeDir;" + $env:Path
    }
}

# Asegurar que el symlink activo de Node y Roaming npm estén en el PATH de la sesión actual
$npmRoamingPath = "$env:APPDATA\npm"
if ($env:Path -notlike "*$nodeSymlinkPath*") {
    $env:Path = "$nodeSymlinkPath;" + $env:Path
}
if ($env:Path -notlike "*$npmRoamingPath*") {
    $env:Path = "$npmRoamingPath;" + $env:Path
}

# 7. Actualizar npm a la versión adecuada (en auto-actualización instala npm@latest y sincroniza package.json; en -DeclaredVersions sincroniza con el commit)
Write-Host ""
if ($updateToLatest) {
    Write-Host "[NPM] Actualizando npm a la última versión global (npm@latest)..." -ForegroundColor Cyan
    try {
        npm install -g npm@latest
        $newNpmVer = (npm -v).Trim()
        if ($newNpmVer -and (Test-Path $pkgPath)) {
            $rawPkg = [System.IO.File]::ReadAllText($pkgPath)
            if ($rawPkg -match '("npm":\s*">=)[^"]*(")') {
                $updatedPkg = $rawPkg -replace '("npm":\s*">=)[^"]*(")', "`${1}$newNpmVer`${2}"
                [System.IO.File]::WriteAllText($pkgPath, $updatedPkg)
                Write-Host "  [OK] Versión de npm sincronizada a >=$newNpmVer en package.json" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  [WARN] Advertencia al actualizar npm global: $_" -ForegroundColor Yellow
    }
} else {
    $targetNpmVer = ""
    if (Test-Path $pkgPath) {
        $rawPkg = [System.IO.File]::ReadAllText($pkgPath)
        if ($rawPkg -match '"npm":\s*">=?([0-9.]+)"') {
            $targetNpmVer = $matches[1]
        }
    }
    $currentNpmVer = (npm -v).Trim()
    if ($targetNpmVer -and ($currentNpmVer -ne $targetNpmVer)) {
        Write-Host "[NPM] Sincronizando npm a la versión declarada en el commit (npm@$targetNpmVer)..." -ForegroundColor Cyan
        try {
            npm install -g "npm@$targetNpmVer"
            Write-Host "  [OK] npm instalado en v$targetNpmVer" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Advertencia al instalar npm@${targetNpmVer}: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[NPM] Preservando versión activa de npm ($currentNpmVer)." -ForegroundColor Gray
    }
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

# 11. Inicializar Directorios Básicos del Auditor y del Proyecto
Write-Host ""
Write-Host "[DIRECTORIES] Inicializando directorios básicos del auditor y del proyecto..." -ForegroundColor Cyan

$requiredDirs = @(
    "scratch",
    "scratch\audits",
    "scratch\audits\architecture",
    "scratch\audits\documentation",
    "scratch\audits\domain_data",
    "scratch\audits\persistence",
    ".agents",
    ".agents\skills",
    "dist",
    "scripts\setup\plugins"
)

foreach ($dir in $requiredDirs) {
    $targetPath = Join-Path $PSScriptRoot $dir
    if (-not (Test-Path $targetPath)) {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
        Write-Host "  [+] Creado directorio: $dir" -ForegroundColor Green
    } else {
        Write-Host "  [✓] Directorio detectado: $dir" -ForegroundColor Gray
    }
}

# 11.1 Configuración de Fallow, Modelo de Embeddings de IA y Lista Blanca en Windows
$hasFallow = $ConfigureFallow -or `
    ($pkgContent.dependencies -and $pkgContent.dependencies.fallow) -or `
    ($pkgContent.devDependencies -and $pkgContent.devDependencies.fallow) -or `
    (Test-Path (Join-Path $PSScriptRoot "node_modules\fallow"))

if ($hasFallow) {
    Write-Host ""
    Write-Host "[FALLOW] Configurando Fallow similar-code y lista blanca de seguridad en Windows..." -ForegroundColor Cyan

    # 1. Asegurar directorios de caché de modelos y vectores
    $fallowBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME "AppData\Local" }
    $fallowUserCache = Join-Path $fallowBase "fallow\similar-code"
    $fallowModelsDir = Join-Path $fallowUserCache "models"
    $fallowVectorsDir = Join-Path $fallowUserCache "vectors"

    if (-not (Test-Path $fallowModelsDir)) {
        New-Item -ItemType Directory -Path $fallowModelsDir -Force | Out-Null
    }
    if (-not (Test-Path $fallowVectorsDir)) {
        New-Item -ItemType Directory -Path $fallowVectorsDir -Force | Out-Null
    }
    Write-Host "  [✓] Directorio de caché persistente verificado: $fallowUserCache" -ForegroundColor Gray

    # 2. Desbloquear binarios de Fallow (SmartScreen / Marca de la Web)
    $fallowCliDirs = @(
        (Join-Path $PSScriptRoot "node_modules\@fallow-cli"),
        (Join-Path $PSScriptRoot "node_modules\fallow")
    )
    foreach ($dir in $fallowCliDirs) {
        if (Test-Path $dir) {
            Get-ChildItem -Path $dir -Include "*.exe", "*.dll", "*.node" -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
        }
    }
    Write-Host "  [✓] Binarios de Fallow desbloqueados (Unblock-File)." -ForegroundColor Gray

    # 3. Lista Blanca en Windows Defender Antivirus
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $fallowCliPath = Join-Path $PSScriptRoot "node_modules\@fallow-cli"

    if ($isAdmin) {
        try {
            Add-MpPreference -ExclusionProcess "fallow.exe", "fallow-similar-code.exe" -ErrorAction SilentlyContinue
            Add-MpPreference -ExclusionPath $fallowUserCache, $fallowCliPath -ErrorAction SilentlyContinue
            Write-Host "  [OK] Exclusiones de Windows Defender aplicadas con éxito." -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] No se pudieron registrar exclusiones de Defender: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [SECURITY] Se requieren permisos de Administrador para registrar la lista blanca en Windows Defender." -ForegroundColor Yellow
        Write-Host "  [SECURITY] Solicitando elevación para registrar exclusiones de Defender..." -ForegroundColor Cyan
        $elevateCmd = "Add-MpPreference -ExclusionProcess 'fallow.exe', 'fallow-similar-code.exe' -ErrorAction SilentlyContinue; Add-MpPreference -ExclusionPath '$fallowUserCache', '$fallowCliPath' -ErrorAction SilentlyContinue"
        try {
            $elevProc = Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"$elevateCmd`"" -PassThru -Wait
            if ($elevProc.ExitCode -eq 0) {
                Write-Host "  [OK] Exclusiones de Windows Defender registradas mediante elevación UAC." -ForegroundColor Green
            } else {
                Write-Host "  [WARN] La solicitud de elevación finalizó con código $($elevProc.ExitCode)." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  [WARN] Permisos de Administrador omitidos o denegados. Las exclusiones de Defender no se pudieron registrar automáticamente." -ForegroundColor Yellow
            Write-Host "         Para registrarlas manualmente en una consola con privilegios de Administrador:" -ForegroundColor Gray
            Write-Host "         Add-MpPreference -ExclusionProcess 'fallow.exe', 'fallow-similar-code.exe'" -ForegroundColor Cyan
            Write-Host "         Add-MpPreference -ExclusionPath '$fallowUserCache', '$fallowCliPath'" -ForegroundColor Cyan
        }
    }

    # 4. Inicializar y verificar modelo de IA de similar-code
    $fallowBin = Join-Path $PSScriptRoot "node_modules\fallow\bin\fallow"
    if (Test-Path $fallowBin) {
        Write-Host "  [+] Verificando estado del modelo vectorial de similar-code..." -ForegroundColor Cyan
        try {
            $statusJson = node $fallowBin similar-code status --format json 2>$null | ConvertFrom-Json
            if ($statusJson.model_ready -ne $true) {
                Write-Host "  [+] Descargando e inicializando modelo de embeddings de IA (jina-embeddings-v2-base-code)..." -ForegroundColor Cyan
                node $fallowBin similar-code setup --local --yes
            } else {
                Write-Host "  [✓] Modelo de embeddings de IA para similar-code verificado y listo." -ForegroundColor Green
            }
        } catch {
            Write-Host "  [WARN] No se pudo inicializar similar-code automáticamente: $_" -ForegroundColor Yellow
        }
    }
}

# Verificación de exclusión de scratch/ en .gitignore
$projectGitignore = Join-Path $PSScriptRoot ".gitignore"
if (Test-Path $projectGitignore) {
    $gitignoreContent = [System.IO.File]::ReadAllText($projectGitignore)
    if ($gitignoreContent -notmatch "(?m)^scratch/?\s*$") {
        Write-Host "  [+] Asegurando exclusión de scratch/ en .gitignore..." -ForegroundColor Cyan
        $separator = if ($gitignoreContent.EndsWith("`n")) { "`n" } else { "`n`n" }
        $entry = "${separator}# Scratch & Temporary Audits`nscratch/`n"
        [System.IO.File]::AppendAllText($projectGitignore, $entry, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  [OK] scratch/ agregado a .gitignore" -ForegroundColor Green
    } else {
        Write-Host "  [✓] scratch/ ya está excluido en .gitignore" -ForegroundColor Gray
    }
} else {
    Write-Host "  [+] Creando .gitignore básico con exclusión de scratch/..." -ForegroundColor Cyan
    $newGitignore = "# Dependencies`nnode_modules/`n`n# Scratch & Temporary Audits`nscratch/`n*.log`n"
    [System.IO.File]::WriteAllText($projectGitignore, $newGitignore, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  [OK] .gitignore creado con scratch/" -ForegroundColor Green
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

# 14. Ejecución Automática de Auditor Fix (Reparación y Sincronización Inicial)
$auditorDistEntry = Join-Path $PSScriptRoot "node_modules\@francogp\auditor\dist\cli\audit_full.js"
$auditorSelfEntry = Join-Path $PSScriptRoot "src\cli\audit_full.ts"
$isAuditorSelf = (Test-Path $auditorSelfEntry) -and ($projectName -eq "@francogp/auditor")

if ($isAuditorSelf) {
    Write-Host ""
    Write-Host "[AUDITOR] Ejecutando reparación automática inicial (npm run auditor:fix)..." -ForegroundColor Cyan
    try {
        npm run auditor:fix
    } catch {
        Write-Host "  [WARN] Fallo no fatal en auditor fix inicial: $_" -ForegroundColor Yellow
    }
} elseif (Test-Path $auditorDistEntry) {
    Write-Host ""
    Write-Host "[AUDITOR] Ejecutando sincronización automática de auditor (auditor fix)..." -ForegroundColor Cyan
    try {
        node --permission --allow-fs-read=* --allow-fs-write=* --allow-child-process --allow-addons "$auditorDistEntry" fix
    } catch {
        Write-Host "  [WARN] Fallo no fatal al ejecutar auditor fix: $_" -ForegroundColor Yellow
    }
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
