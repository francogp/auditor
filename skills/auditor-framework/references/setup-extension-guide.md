# Setup Scripts Extension & Governance Guide (Linux & Windows)

This guide documents the canonical architecture, extension mechanisms, and governance policies for development environment initialization scripts (`setup-linux.sh` and `setup-windows.ps1`) in projects utilizing `@francogp/auditor`.

---

## 1. Setup Architecture Principles

1. **Agnostic & Modular**: Core setup scripts (`setup-linux.sh` and `setup-windows.ps1`) handle cross-cutting fundamentals exclusively:
   - Node.js runtime verification and synchronization (Node.js 26+).
   - Package manager governance (`npm`).
   - Hermetic dependency installation (`npm ci`).
   - Native build tools discovery (`css-checker`, etc.).
2. **Zero Core Modification & Strict Prohibition on Local Host Patches**: Domain-specific requirements of a host project (e.g. Docker databases, local SSL certificates, database seeds, background daemons) **MUST NEVER** be introduced by mutating the framework base scripts. Furthermore, when encountering bugs, version synchronization gaps, or improvements in setup scripts, **AGENTS ARE STRICTLY FORBIDDEN** from applying local patches or workarounds in the host project; agents MUST notify the user so the issue is resolved upstream in `@francogp/auditor`.
3. **Mandatory Idempotency**: All extension scripts must be 100% idempotent; executing the setup repeatedly must yield identical end states without errors, duplicates, or data corruption.

---

### Strict Prohibition on Local Host Patches & Upstream Reporting Mandate

Master setup scripts (`setup-linux.sh` and `setup-windows.ps1`) are distributed canonically by `@francogp/auditor`.

> [!CAUTION]
> **Prohibition on Local Host Patches**: AI agents and developers **ARE STRICTLY PROHIBITED** from applying local patches, ad-hoc rewrites, or logic mutations to `setup-linux.sh` or `setup-windows.ps1` in host projects to circumvent version synchronization issues, NVM edge cases, or runtime behaviors.

**Mandatory Protocol for Agents**:
1. If an agent identifies a defect, version discrepancy (e.g. Node vs NPM in `--declared-versions`), or needed optimization in `setup-linux.sh` or `setup-windows.ps1`:
2. **DO NOT modify the script locally within the host project.**
3. **Proactively warn the user**, detailing the precise root cause and stating clearly that the fix **must be communicated to the `@francogp/auditor` maintainer** so it is resolved upstream in the master framework and cleanly distributed across all projects via `npm run auditor:update`.

---

## 2. Supported Extension Mechanisms

Two canonical mechanisms exist for extending the setup workflow:

```
┌────────────────────────────────────────────────────────┐
│             setup-linux.sh / setup-windows.ps1          │
│  1. Node.js 26+ check & NVM resolution                 │
│  2. npm dependencies installation (npm ci)             │
│  3. Native build tools verification                    │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   [Mechanism A: Plugins]      [Mechanism B: Post-Setup Hook]
   scripts/setup/plugins/*.sh   npm run env:post-setup
   scripts/setup/plugins/*.ps1
```

---

### Mechanism A: Plugins Directory (`scripts/setup/plugins/`)

The setup runner automatically searches for a `scripts/setup/plugins/` directory at the project root. If found, it executes all executable scripts in alphabetical/numerical order.

#### Recommended Directory Structure
```
scripts/setup/plugins/
├── 01-docker-db.sh          # Linux/macOS: Starts local DB container
├── 01-docker-db.ps1         # Windows: Starts local DB container
├── 02-local-ssl-certs.sh    # Linux/macOS: Generates TLS certificates via mkcert
└── 02-local-ssl-certs.ps1   # Windows: Generates TLS certificates via mkcert
```

#### Naming Conventions & Numerical Ordering
- Use two-digit numerical prefixes (`01-`, `02-`, `10-`) to ensure deterministic execution order.
- Every Bash plugin must have an identically functioning PowerShell counterpart (and vice-versa) to guarantee cross-platform parity.

---

### Mechanism B: `npm run env:post-setup` Hook

In `package.json`, host projects can declare an `env:post-setup` script:

```json
{
  "scripts": {
    "setup": "bash scripts/setup/setup-linux.sh",
    "setup:win": "powershell -ExecutionPolicy Bypass -File scripts/setup/setup-windows.ps1",
    "env:post-setup": "node --experimental-strip-types scripts/setup/init-project-state.ts",
    "validate:tools": "node --experimental-strip-types scripts/setup/validate-tools.ts"
  }
}
```

The base setup script executes `npm run env:post-setup --if-present` upon completing package installation.

---

## 3. Reference Implementation Templates

### Plugin 1: Local Docker Database Container

#### Linux / macOS (`01-docker-db.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="facturacion-postgres"
IMAGE="postgres:16-alpine"
DB_PORT="5432"

echo "🐘 [Plugin 01] Verifying Docker Database container ($CONTAINER_NAME)..."

if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️ Docker is not installed on this system. Skipping database launch."
  exit 0
fi

if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  ✅ Container $CONTAINER_NAME is already running."
elif [ "$(docker ps -aq -f status=exited -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  🔄 Starting existing container $CONTAINER_NAME..."
  docker start "$CONTAINER_NAME" >/dev/null
  echo "  ✅ Container started."
else
  echo "  🚀 Creating and starting new container $CONTAINER_NAME..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=facturacion \
    -p "${DB_PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "  ✅ Container $CONTAINER_NAME created and listening on port $DB_PORT."
fi
```

#### Windows (`01-docker-db.ps1`)
```powershell
# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$containerName = "facturacion-postgres"
$image = "postgres:16-alpine"
$dbPort = "5432"

Write-Host "🐘 [Plugin 01] Verifying Docker Database container ($containerName)..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker is not installed on this system. Skipping database launch."
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
  -e POSTGRES_DB=facturacion `
  -p "${dbPort}:5432" `
  $image | Out-Null

Write-Host "  ✅ Container $containerName created and listening on port $dbPort." -ForegroundColor Green
```

---

### Plugin 2: Local SSL Certificates with `mkcert`

#### Linux / macOS (`02-local-ssl-certs.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="certs"
KEY_FILE="$CERT_DIR/localhost-key.pem"
CERT_FILE="$CERT_DIR/localhost.pem"

echo "🔐 [Plugin 02] Verifying local development SSL certificates..."

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
  echo "  ✅ Local SSL certificates already exist in $CERT_DIR/."
  exit 0
fi

mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "  🔑 Generating certificates with mkcert..."
  mkcert -install
  mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" localhost 127.0.0.1 ::1
  echo "  ✅ Certificates successfully generated."
else
  echo "  ⚠️ mkcert not found. Skipping automatic SSL generation."
  echo "     For local HTTPS, install mkcert: https://github.com/FiloSottile/mkcert"
fi
```

#### Windows (`02-local-ssl-certs.ps1`)
```powershell
# Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$certDir = "certs"
$keyFile = Join-Path $certDir "localhost-key.pem"
$certFile = Join-Path $certDir "localhost.pem"

Write-Host "🔐 [Plugin 02] Verifying local development SSL certificates..." -ForegroundColor Cyan

if ((Test-Path $keyFile) -and (Test-Path $certFile)) {
    Write-Host "  ✅ Local SSL certificates already exist in $certDir/." -ForegroundColor Green
    exit 0
}

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (Get-Command mkcert -ErrorAction SilentlyContinue) {
    Write-Host "  🔑 Generating certificates with mkcert..." -ForegroundColor Yellow
    mkcert -install
    mkcert -key-file $keyFile -cert-file $certFile localhost 127.0.0.1 ::1
    Write-Host "  ✅ Certificates successfully generated." -ForegroundColor Green
} else {
    Write-Warning "mkcert not found. Skipping automatic SSL generation."
    Write-Host "     For local HTTPS, install mkcert: choco install mkcert" -ForegroundColor Gray
}
```

---

## 4. Critical Rules for Extension Plugins

1. **No Hardcoded Passwords or Production Secrets**: Never introduce production credentials or secret API tokens into setup scripts. Use environment variables or local test defaults (`postgres`, `dev`, `localhost`).
2. **Pre-flight Dependency Checks**: Always verify with `command -v <tool>` (Bash) or `Get-Command <tool>` (PowerShell) whether a required tool is present before executing it, preventing abrupt setup crashes on developer machines lacking the tool.
3. **Clean Error Handling**:
   - In Bash: `set -euo pipefail` at the header.
   - In PowerShell: `$ErrorActionPreference = 'Stop'` at the header.
4. **Node.js 26+ Permission Compliance**: When `env:post-setup` is a TypeScript/Node.js script, it must execute strictly under Node.js 26+ native permission guards (`node --permission ...`).
