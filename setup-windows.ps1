param(
    [switch]$DeclaredVersions = $false,
    [switch]$Locked = $false,
    [switch]$Pinned = $false,
    [switch]$UpdateVersion = $false,
    [switch]$PruneOtherVersions = $false,
    [switch]$SetDefault = $false,
    [switch]$ConfigureFallow = $false
)

# Canonical Environment Initialization & Setup Script for Windows (PowerShell)
# Provided by @francogp/auditor - Zero Hardcoding, Multi-Project Isolation, and Plugin Support

$ErrorActionPreference = "Stop"

# Default: fixed reproducible installation as declared in commit (.node-version / package.json)
# -UpdateVersion / update-windows.ps1: updates to latest stable version (Node.js Current + npm@latest)
$updateToLatest = [bool]$UpdateVersion

# Force UTF-8 encoding in Windows console
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

# Function to reload Machine and User environment variables in current session
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

# 1. Determine Node.js version and project name
$pkgPath = Join-Path $PSScriptRoot "package.json"
$nodeVersionPath = Join-Path $PSScriptRoot ".node-version"
$nvmrcPath = Join-Path $PSScriptRoot ".nvmrc"

if (-not (Test-Path $pkgPath)) {
    Write-Host "[ERROR] package.json not found in $pkgPath" -ForegroundColor Red
    exit 1
}

$pkgContent = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
$projectName = if ($pkgContent.name) { $pkgContent.name } else { (Split-Path $PSScriptRoot -Leaf) }

# Proactive cleanup of legacy .nvmrc file
if (Test-Path $nvmrcPath) {
    Remove-Item -Path $nvmrcPath -Force -ErrorAction SilentlyContinue
}

$targetNodeVer = ""

if ($updateToLatest) {
    Write-Host "[NODE] Querying latest stable Node.js Current version from nodejs.org..." -ForegroundColor Cyan
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
            [System.IO.File]::WriteAllText($nodeVersionPath, "$targetNodeVer`n", (New-Object System.Text.UTF8Encoding $false))
            Write-Host "[CONFIG] Synchronized package.json and .node-version with v$targetNodeVer" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] Could not query nodejs.org API: $_. Using local definition..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[NODE] Declared versions mode active (-DeclaredVersions). Preserving exact version from .node-version..." -ForegroundColor Cyan
}

# If no remote query or query failed: read .node-version
if (-not $targetNodeVer -and (Test-Path $nodeVersionPath)) {
    $rawNodeVer = (Get-Content -Raw -Path $nodeVersionPath).Trim() -replace '^v', ''
    if ($rawNodeVer) {
        $targetNodeVer = $rawNodeVer
    }
}

# Fallback to package.json
if (-not $targetNodeVer -and $pkgContent.engines -and $pkgContent.engines.node) {
    $targetNodeVer = $pkgContent.engines.node -replace '[^0-9.]', ''
    if ($targetNodeVer) {
        [System.IO.File]::WriteAllText($nodeVersionPath, "$targetNodeVer`n", (New-Object System.Text.UTF8Encoding $false))
    }
}

if (-not $targetNodeVer) {
    Write-Host "[ERROR] Could not determine Node.js version to install." -ForegroundColor Red
    exit 1
}

# Dynamic Invariant: If host project uses @francogp/auditor, validate >= minimum requirement
$auditorPkgPath = Join-Path $PSScriptRoot "node_modules/@francogp/auditor/package.json"
if (Test-Path $auditorPkgPath) {
    try {
        $auditorPkg = Get-Content -Raw -Path $auditorPkgPath | ConvertFrom-Json
        if ($auditorPkg.engines -and $auditorPkg.engines.node) {
            $auditorNodeMin = $auditorPkg.engines.node -replace '[^0-9.]', ''
            $targetSemver = [System.Version]$targetNodeVer
            $auditorSemver = [System.Version]$auditorNodeMin
            if ($targetSemver -lt $auditorSemver) {
                Write-Host "[ERROR] Target version v$targetNodeVer is LOWER than minimum required by @francogp/auditor (v$auditorNodeMin)." -ForegroundColor Red
                exit 1
            }
        }
    } catch {}
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " [SETUP] NODE ENVIRONMENT PREPARATION (v$targetNodeVer) [$projectName]" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 2. Detect NVM for Windows and ensure paths
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
            Write-Host "[NVM] NVM for Windows not detected. Installing via winget..." -ForegroundColor Cyan
            try {
                if ($wingetCmd -eq "winget") {
                    winget install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements
                } else {
                    & $wingetCmd install CoreyButler.NVMforWindows --accept-source-agreements --accept-package-agreements
                }
                Refresh-ProcessEnvironment
            } catch {
                Write-Host "  [WARN] Could not install NVM via winget: $_" -ForegroundColor Yellow
            }
        } else {
            Write-Host ""
            Write-Host "[NVM] NVM for Windows not detected. Attempting installation via winget..." -ForegroundColor Yellow
            Write-Host "  [SECURITY] Administrator privileges required to install NVM for Windows." -ForegroundColor Yellow
            Write-Host "  [SECURITY] Requesting elevation to install NVM via winget..." -ForegroundColor Cyan
            $wingetInstallCmd = if ($wingetCmd -eq "winget") {
                "winget $wingetArgs; exit `$LASTEXITCODE"
            } else {
                "& '$wingetCmd' $wingetArgs; exit `$LASTEXITCODE"
            }
            try {
                $elevProc = Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -Command `"$wingetInstallCmd`"" -PassThru -Wait
                if ($elevProc.ExitCode -eq 0) {
                    Write-Host "  [OK] NVM for Windows installed successfully via UAC elevation." -ForegroundColor Green
                    Refresh-ProcessEnvironment
                } else {
                    Write-Host "  [WARN] NVM installation via elevation finished with exit code $($elevProc.ExitCode)." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  [WARN] Administrator privileges skipped or denied. NVM for Windows could not be installed automatically." -ForegroundColor Yellow
                Write-Host "         To install manually in an elevated Administrator console:" -ForegroundColor Gray
                Write-Host "         winget install CoreyButler.NVMforWindows" -ForegroundColor Cyan
            }
        }

        # Re-detect NVM after installation attempt
        $nvmRoot = Find-NvmInstallation
        if ($nvmRoot) {
            if (-not $env:NVM_HOME) { $env:NVM_HOME = $nvmRoot }
            if ($env:Path -notlike "*$nvmRoot*") { $env:Path = "$nvmRoot;" + $env:Path }
        }
    } else {
        Write-Host ""
        Write-Host "[NVM] NVM for Windows not detected and winget is not available." -ForegroundColor Yellow
    }
}

if (-not $nvmRoot) {
    $nvmRoot = "$env:LOCALAPPDATA\nvm"
    if (-not (Test-Path $nvmRoot)) {
        New-Item -ItemType Directory -Path $nvmRoot -Force | Out-Null
    }
} else {
    # Check if nvmRoot has write permissions; otherwise fallback to user directory
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

# 3. Ensure target directory for Node Symlink/Junction
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

# 4. Install target Node.js if missing
$targetNodeDir = Join-Path $nvmRoot "v$targetNodeVer"
$nodeExePath = Join-Path $targetNodeDir "node.exe"

if (-not (Test-Path $nodeExePath)) {
    Write-Host ""
    Write-Host "[NODE] Installing Node.js v$targetNodeVer..." -ForegroundColor Cyan
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
        Write-Host "  [DOWNLOAD] Downloading official Node.js v$targetNodeVer binaries..." -ForegroundColor Cyan
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
            Write-Host "  [OK] Node.js v$targetNodeVer extracted successfully into $targetNodeDir" -ForegroundColor Green
        } catch {
            Write-Host "  [ERROR] Node.js download and extraction failed: $_" -ForegroundColor Red
            exit 1
        }
    }
}

# 5. Activate Node.js (with native Junction fallback)
Write-Host ""
Write-Host "[NODE] Activating Node.js v$targetNodeVer..." -ForegroundColor Cyan
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

# 6. Obsolete versions cleanup (STRICTLY OPT-IN with -PruneOtherVersions)
if ($PruneOtherVersions) {
    Write-Host ""
    Write-Host "[CLEANUP] Cleaning obsolete Node.js versions (-PruneOtherVersions enabled)..." -ForegroundColor Cyan
    try {
        Get-ChildItem -Path $nvmRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^v\d+\.\d+\.\d+$' -and $_.Name -ne "v$targetNodeVer" } | ForEach-Object {
            $verName = $_.Name
            Write-Host "  [-] Removing version: $verName..." -ForegroundColor Yellow
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            if (Test-Path $_.FullName -and (Get-Command nvm -ErrorAction SilentlyContinue)) {
                nvm uninstall ($verName -replace '^v','') 2>$null | Out-Null
            }
        }
    } catch {}
} else {
    Write-Host ""
    Write-Host "[INFO] Preserving all other Node.js versions installed for multi-project coexistence." -ForegroundColor Cyan
}

# Ensure target version precedence in process PATH (Session Isolation)
if ($targetNodeDir -and (Test-Path (Join-Path $targetNodeDir "node.exe"))) {
    if ($env:Path -notlike "*$targetNodeDir*") {
        $env:Path = "$targetNodeDir;" + $env:Path
    }
}

# Ensure active Node symlink and Roaming npm are in current session PATH
$npmRoamingPath = "$env:APPDATA\npm"
if ($env:Path -notlike "*$nodeSymlinkPath*") {
    $env:Path = "$nodeSymlinkPath;" + $env:Path
}
if ($env:Path -notlike "*$npmRoamingPath*") {
    $env:Path = "$npmRoamingPath;" + $env:Path
}

# 7. Update npm to appropriate version
Write-Host ""
if ($updateToLatest) {
    Write-Host "[NPM] Updating npm to latest global version (npm@latest)..." -ForegroundColor Cyan
    try {
        npm install -g npm@latest
        $newNpmVer = (npm -v).Trim()
        if ($newNpmVer -and (Test-Path $pkgPath)) {
            $rawPkg = [System.IO.File]::ReadAllText($pkgPath)
            $pkgModified = $false
            if ($rawPkg -match '("npm":\s*">=)[^"]*(")') {
                $rawPkg = $rawPkg -replace '("npm":\s*">=)[^"]*(")', "`${1}$newNpmVer`${2}"
                $pkgModified = $true
                Write-Host "  [OK] npm version synchronized to >=$newNpmVer in package.json" -ForegroundColor Green
            }
            if ($rawPkg -match '("packageManager":\s*")[^"]*(")') {
                $rawPkg = $rawPkg -replace '("packageManager":\s*")[^"]*(")', "`${1}npm@$newNpmVer`${2}"
                $pkgModified = $true
                Write-Host "  [OK] packageManager synchronized to npm@$newNpmVer in package.json" -ForegroundColor Green
            } elseif ($rawPkg -match '(?m)^(  "name":\s*"[^"]*"\s*,)') {
                $rawPkg = $rawPkg -replace '(?m)^(  "name":\s*"[^"]*"\s*,)', "`$1`n  `"packageManager`": `"npm@$newNpmVer`","
                $pkgModified = $true
                Write-Host "  [OK] packageManager injected as npm@$newNpmVer in package.json" -ForegroundColor Green
            } elseif ($rawPkg -match '(?m)^(  "name":\s*"[^"]*")') {
                $rawPkg = $rawPkg -replace '(?m)^(  "name":\s*"[^"]*")', "`$1,`n  `"packageManager`": `"npm@$newNpmVer`""
                $pkgModified = $true
                Write-Host "  [OK] packageManager injected as npm@$newNpmVer in package.json" -ForegroundColor Green
            }
            if ($pkgModified) {
                [System.IO.File]::WriteAllText($pkgPath, $rawPkg)
            }
        }
    } catch {
        Write-Host "  [WARN] Warning updating global npm: $_" -ForegroundColor Yellow
    }
} else {
    $targetNpmVer = ""
    if (Test-Path $pkgPath) {
        $rawPkg = [System.IO.File]::ReadAllText($pkgPath)
        if ($rawPkg -match '"npm":\s*">=?([0-9.]+)"') {
            $targetNpmVer = $matches[1]
        } elseif ($rawPkg -match '"packageManager":\s*"npm@([0-9.]+)"') {
            $targetNpmVer = $matches[1]
        }
    }
    $currentNpmVer = (npm -v).Trim()
    if ($targetNpmVer -and ($currentNpmVer -ne $targetNpmVer)) {
        Write-Host "[NPM] Synchronizing npm to version declared in commit (npm@$targetNpmVer)..." -ForegroundColor Cyan
        try {
            npm install -g "npm@$targetNpmVer"
            Write-Host "  [OK] npm installed at v$targetNpmVer" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Warning installing npm@${targetNpmVer}: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[NPM] Preserving active npm version ($currentNpmVer)." -ForegroundColor Gray
    }
}

# 8. Verify project-isolated NPM configuration
Write-Host ""
Write-Host "[CONFIG] Verifying NPM policies (local project .npmrc)..." -ForegroundColor Cyan
$projectNpmrc = Join-Path $PSScriptRoot ".npmrc"
if (-not (Test-Path $projectNpmrc)) {
    $npmrcContent = @"
# $projectName - Local Project NPM Configuration
ignore-scripts=true
registry=https://registry.npmjs.org/
audit-level=high
"@
    [System.IO.File]::WriteAllText($projectNpmrc, $npmrcContent, (New-Object System.Text.UTF8Encoding $false))
    Write-Host " [CONFIG] Local .npmrc file initialized successfully." -ForegroundColor Green
} else {
    Write-Host " [CONFIG] Local .npmrc file detected and active." -ForegroundColor Green
}

# 9. Clean installation of project dependencies
Write-Host ""
Set-Location $PSScriptRoot

$installSuccess = $false

if (Get-Command vp -ErrorAction SilentlyContinue) {
    Write-Host "[DEPENDENCIES] Installing project dependencies with Vite+ (vp install)..." -ForegroundColor Cyan
    & vp install
    if ($LASTEXITCODE -eq 0) {
        $installSuccess = $true
    } else {
        Write-Host "  [WARN] 'vp install' failed (code $LASTEXITCODE). Retrying with npm ci..." -ForegroundColor Yellow
    }
}

if (-not $installSuccess) {
    Write-Host "[DEPENDENCIES] Installing clean dependencies with npm ci..." -ForegroundColor Cyan
    & npm ci
    if ($LASTEXITCODE -eq 0) {
        $installSuccess = $true
    } else {
        Write-Host "  [WARN] 'npm ci' failed with code $LASTEXITCODE (possible lockfile desynchronization or remote dependencies)." -ForegroundColor Yellow
        Write-Host "  [RECOVERY] Attempting recovery with 'npm install' to synchronize dependencies..." -ForegroundColor Cyan
        & npm install
        if ($LASTEXITCODE -eq 0) {
            $installSuccess = $true
            Write-Host "  [OK] Dependencies installed and synchronized successfully via npm install." -ForegroundColor Green
            Write-Host "  [WARN] package-lock.json was desynchronized with package.json and was updated by npm install. Review and commit alongside package.json." -ForegroundColor Yellow
        }
    }
}

if (-not $installSuccess) {
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Red
    Write-Host " [ERROR] Dependency installation failed in $projectName." -ForegroundColor Red
    Write-Host " Check npm errors above. It is unsafe to proceed without dependencies installed." -ForegroundColor Red
    Write-Host "======================================================" -ForegroundColor Red
    exit 1
}

if (Get-Command vp -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "[CONFIG] Synchronizing configuration and agents with Vite+ (vp config)..." -ForegroundColor Cyan
    try {
        & vp config
    } catch {}
}

# 10. Unblock native binaries downloaded by npm on Windows
Write-Host ""
Write-Host "[SECURITY] Unblocking native binaries in node_modules..." -ForegroundColor Cyan
$nodeModulesDir = Join-Path $PSScriptRoot "node_modules"
if (Test-Path $nodeModulesDir) {
    Get-ChildItem -Path $nodeModulesDir -Include "*.node", "*.dll", "*.exe" -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
}

# 11. Initialize Auditor & Project Base Directories
Write-Host ""
Write-Host "[DIRECTORIES] Initializing auditor and project base directories..." -ForegroundColor Cyan

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
        Write-Host "  [+] Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "  [OK] Directory detected: $dir" -ForegroundColor Gray
    }
}

# 11.1 Fallow Configuration, AI Embedding Model and Windows Defender Whitelisting
$hasFallow = $ConfigureFallow -or `
    ($pkgContent.dependencies -and $pkgContent.dependencies.fallow) -or `
    ($pkgContent.devDependencies -and $pkgContent.devDependencies.fallow) -or `
    (Test-Path (Join-Path $PSScriptRoot "node_modules\fallow"))

if ($hasFallow) {
    Write-Host ""
    Write-Host "[FALLOW] Configuring Fallow similar-code and security whitelisting on Windows..." -ForegroundColor Cyan

    # 1. Ensure model and vector cache directories
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
    Write-Host "  [OK] Persistent cache directory verified: $fallowUserCache" -ForegroundColor Gray

    # 2. Unblock Fallow binaries (SmartScreen / Mark of the Web)
    $fallowCliDirs = @(
        (Join-Path $PSScriptRoot "node_modules\@fallow-cli"),
        (Join-Path $PSScriptRoot "node_modules\fallow")
    )
    foreach ($dir in $fallowCliDirs) {
        if (Test-Path $dir) {
            Get-ChildItem -Path $dir -Include "*.exe", "*.dll", "*.node" -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
        }
    }
    Write-Host "  [OK] Fallow binaries unblocked (Unblock-File)." -ForegroundColor Gray

    # 3. Windows Defender Antivirus Whitelist
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $fallowCliPath = Join-Path $PSScriptRoot "node_modules\@fallow-cli"

    if ($isAdmin) {
        try {
            Add-MpPreference -ExclusionProcess "fallow.exe", "fallow-similar-code.exe" -ErrorAction SilentlyContinue
            Add-MpPreference -ExclusionPath $fallowUserCache, $fallowCliPath -ErrorAction SilentlyContinue
            Write-Host "  [OK] Windows Defender exclusions applied successfully." -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Could not register Defender exclusions: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [SECURITY] Administrator privileges required to whitelist Fallow in Windows Defender." -ForegroundColor Yellow
        Write-Host "  [SECURITY] Requesting elevation to register Defender exclusions..." -ForegroundColor Cyan
        $elevateCmd = "Add-MpPreference -ExclusionProcess 'fallow.exe', 'fallow-similar-code.exe' -ErrorAction SilentlyContinue; Add-MpPreference -ExclusionPath '$fallowUserCache', '$fallowCliPath' -ErrorAction SilentlyContinue"
        try {
            $elevProc = Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"$elevateCmd`"" -PassThru -Wait
            if ($elevProc.ExitCode -eq 0) {
                Write-Host "  [OK] Windows Defender exclusions registered via UAC elevation." -ForegroundColor Green
            } else {
                Write-Host "  [WARN] Elevation request finished with exit code $($elevProc.ExitCode)." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  [WARN] Administrator privileges skipped or denied. Defender exclusions could not be registered automatically." -ForegroundColor Yellow
            Write-Host "         To register manually in an elevated Administrator console:" -ForegroundColor Gray
            Write-Host "         Add-MpPreference -ExclusionProcess 'fallow.exe', 'fallow-similar-code.exe'" -ForegroundColor Cyan
            Write-Host "         Add-MpPreference -ExclusionPath '$fallowUserCache', '$fallowCliPath'" -ForegroundColor Cyan
        }
    }

    # 4. Initialize and verify similar-code AI model
    $fallowBin = Join-Path $PSScriptRoot "node_modules\fallow\bin\fallow"
    if (Test-Path $fallowBin) {
        Write-Host "  [+] Verifying similar-code vector model status..." -ForegroundColor Cyan
        try {
            $statusJson = node $fallowBin similar-code status --format json 2>$null | ConvertFrom-Json
            if ($statusJson.model_ready -ne $true) {
                Write-Host "  [+] Downloading and initializing AI embedding model (jina-embeddings-v2-base-code)..." -ForegroundColor Cyan
                node $fallowBin similar-code setup --local --yes
            } else {
                Write-Host "  [OK] Similar-code AI embedding model verified and ready." -ForegroundColor Green
            }
        } catch {
            Write-Host "  [WARN] Could not initialize similar-code automatically: $_" -ForegroundColor Yellow
        }
    }
}

# Verify scratch/ exclusion in .gitignore
$projectGitignore = Join-Path $PSScriptRoot ".gitignore"
if (Test-Path $projectGitignore) {
    $gitignoreContent = [System.IO.File]::ReadAllText($projectGitignore)
    if ($gitignoreContent -notmatch "(?m)^scratch/?\s*$") {
        Write-Host "  [+] Ensuring scratch/ exclusion in .gitignore..." -ForegroundColor Cyan
        $separator = if ($gitignoreContent.EndsWith("`n")) { "`n" } else { "`n`n" }
        $entry = "${separator}# Scratch & Temporary Audits`nscratch/`n"
        [System.IO.File]::AppendAllText($projectGitignore, $entry, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  [OK] scratch/ added to .gitignore" -ForegroundColor Green
    } else {
        Write-Host "  [OK] scratch/ is already excluded in .gitignore" -ForegroundColor Gray
    }
} else {
    Write-Host "  [+] Creating basic .gitignore excluding scratch/..." -ForegroundColor Cyan
    $newGitignore = "# Dependencies`nnode_modules/`n`n# Scratch & Temporary Audits`nscratch/`n*.log`n"
    [System.IO.File]::WriteAllText($projectGitignore, $newGitignore, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  [OK] .gitignore created with scratch/" -ForegroundColor Green
}

# Local Git standards configuration in project
$gitDir = Join-Path $PSScriptRoot ".git"
if (Test-Path $gitDir) {
    Write-Host "  [+] Ensuring local Git standards (core.filemode, core.autocrlf, core.eol)..." -ForegroundColor Cyan
    git -C $PSScriptRoot config core.filemode false
    git -C $PSScriptRoot config core.autocrlf input
    git -C $PSScriptRoot config core.eol lf
    Write-Host "  [OK] Local Git standards configured successfully in project" -ForegroundColor Green
}

# 12. Execute Project-Specific Plugins (scripts\setup\plugins\*.ps1)
$pluginsDir = Join-Path $PSScriptRoot "scripts\setup\plugins"
if (Test-Path $pluginsDir) {
    Get-ChildItem -Path $pluginsDir -Filter "*.ps1" -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
        Write-Host ""
        Write-Host "[PLUGIN] Executing setup plugin: $($_.Name)..." -ForegroundColor Cyan
        & $_.FullName
    }
}

# 13. Optional npm hook: env:post-setup
if ($pkgContent.scripts -and $pkgContent.scripts.'env:post-setup') {
    Write-Host ""
    Write-Host "[HOOK] Executing post-setup hook (npm run env:post-setup)..." -ForegroundColor Cyan
    npm run env:post-setup
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " [SUCCESS] ENVIRONMENT AND DEPENDENCIES PREPARED SUCCESSFULLY!" -ForegroundColor Green
Write-Host " Project: $projectName" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "Active versions in this session:"
node -v
npm -v
Write-Host ""
Write-Host "[NOTE] If you have open IDE terminal sessions, reload them to inherit the updated PATH." -ForegroundColor Cyan
Write-Host "Ready to work." -ForegroundColor Yellow
Write-Host ""
