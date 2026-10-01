# Guía de Extensión de Scripts de Setup (Linux & Windows)

Esta guía documenta la arquitectura estándar y los mecanismos de extensión para los scripts de inicialización de entorno de desarrollo (`setup-linux.sh` y `setup-windows.ps1`) en proyectos que utilizan `@francogp/auditor`.

---

## 1. Principios de Arquitectura de Setup

1. **Agnóstico y Modular**: Los scripts de setup base (`setup-linux.sh` y `setup-windows.ps1`) se encargan exclusivamente de los fundamentos transversales:
   - Verificación de versión de Node.js (Node 26+).
   - Verificación de gestor de paquetes (`npm`).
   - Instalación hermética de dependencias (`npm ci` o `npm install`).
   - Verificación de herramientas nativas de compilación (`css-checker`, etc.).
2. **Cero Modificación del Core**: Las dependencias específicas del dominio de un proyecto (ej. bases de datos Docker, certificados SSL locales, semillas de datos, servicios en segundo plano) **NUNCA** deben introducirse modificando los scripts base del framework.
3. **Idempotencia Obligatoria**: Cualquier script de extensión debe ser 100% idempotente; ejecutar el setup múltiples veces consecutivas debe producir el mismo estado final sin errores, duplicados ni corrupción de datos.

---

## 2. Mecanismos de Extensión Disponibles

Existen dos mecanismos canónicos para extender el proceso de setup:

```
┌────────────────────────────────────────────────────────┐
│             setup-linux.sh / setup-windows.ps1          │
│  1. Node.js 26+ check                                  │
│  2. npm dependencies installation                      │
│  3. Native build tools verification                    │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   [Mecanismo A: Plugins]      [Mecanismo B: Post-Setup Hook]
   scripts/setup/plugins/*.sh   npm run env:post-setup
   scripts/setup/plugins/*.ps1
```

---

### Mecanismo A: Carpeta de Plugins (`scripts/setup/plugins/`)

El runner de setup busca automáticamente un directorio `scripts/setup/plugins/` en la raíz del proyecto. Si existe, ejecuta todos los scripts ejecutables en orden alfabético/numérico.

#### Estructura Recomendada
```
scripts/setup/plugins/
├── 01-docker-db.sh          # Linux/macOS: Inicia contenedor de DB local
├── 01-docker-db.ps1         # Windows: Inicia contenedor de DB local
├── 02-local-ssl-certs.sh    # Linux/macOS: Genera certificados TLS con mkcert
└── 02-local-ssl-certs.ps1   # Windows: Genera certificados TLS con mkcert
```

#### Convenciones de Nomenclatura y Prefijos Numéricos
- Usar prefijos de dos dígitos (`01-`, `02-`, `10-`) para garantizar un orden de ejecución determinista.
- Cada plugin en Bash debe tener su contraparte idéntica en funcionalidad para PowerShell (y viceversa) para garantizar paridad entre plataformas.

---

### Mecanismo B: Gancho `npm run env:post-setup`

En `package.json`, los proyectos pueden declarar un script `env:post-setup`:

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

El script base invoca `npm run env:post-setup --if-present` al finalizar la instalación de paquetes.

---

## 3. Plantillas de Implementación

### Plugin 1: Contenedor Docker para Base de Datos Local

#### Linux / macOS (`01-docker-db.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="facturacion-postgres"
IMAGE="postgres:16-alpine"
DB_PORT="5432"

echo "🐘 [Plugin 01] Verificando contenedor Docker de Base de Datos ($CONTAINER_NAME)..."

if ! command -v docker >/dev/null 2>&1; then
  echo "⚠️ Docker no está instalado en este sistema. Omitiendo arranque de DB."
  exit 0
fi

if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  ✅ Contenedor $CONTAINER_NAME ya está en ejecución."
elif [ "$(docker ps -aq -f status=exited -f name=^/${CONTAINER_NAME}$)" ]; then
  echo "  🔄 Iniciando contenedor existente $CONTAINER_NAME..."
  docker start "$CONTAINER_NAME" >/dev/null
  echo "  ✅ Contenedor iniciado."
else
  echo "  🚀 Creando y arrancando nuevo contenedor $CONTAINER_NAME..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=facturacion \
    -p "${DB_PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "  ✅ Contenedor $CONTAINER_NAME creado y escuchando en puerto $DB_PORT."
fi
```

#### Windows (`01-docker-db.ps1`)
```powershell
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
```

---

### Plugin 2: Certificados SSL Locales con `mkcert`

#### Linux / macOS (`02-local-ssl-certs.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="certs"
KEY_FILE="$CERT_DIR/localhost-key.pem"
CERT_FILE="$CERT_DIR/localhost.pem"

echo "🔐 [Plugin 02] Verificando certificados SSL locales para desarrollo..."

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
  echo "  ✅ Certificados SSL locales ya existen en $CERT_DIR/."
  exit 0
fi

mkdir -p "$CERT_DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "  🔑 Generando certificados con mkcert..."
  mkcert -install
  mkcert -key-file "$KEY_FILE" -cert-file "$CERT_FILE" localhost 127.0.0.1 ::1
  echo "  ✅ Certificados generados correctamente."
else
  echo "  ⚠️ mkcert no encontrado. Omitiendo generación automática de SSL."
  echo "     Para HTTPS local, instala mkcert: https://github.com/FiloSottile/mkcert"
fi
```

#### Windows (`02-local-ssl-certs.ps1`)
```powershell
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
```

---

## 4. Reglas Críticas para Plugins

1. **Sin Contraseñas ni Secretos Hardcodeados**: No introduzcas claves de producción ni tokens de API en los scripts de setup. Usa variables de entorno o defaults exclusivos para entornos de pruebas locales (`postgres`, `dev`, `localhost`).
2. **Comprobación de Dependencias Previas**: Verifica siempre con `command -v <herramienta>` (Bash) o `Get-Command <herramienta>` (PowerShell) si la herramienta requerida está instalada antes de ejecutarla, para evitar que el script falle abruptamente en máquinas de desarrollo que no la tengan configurada.
3. **Manejo de Errores Limpio**:
   - En Bash: `set -euo pipefail` al inicio.
   - En PowerShell: `$ErrorActionPreference = 'Stop'` al inicio.
4. **Respeto al Flag `--permission`**: Si el hook `env:post-setup` es un script TypeScript/Node.js, debe ejecutarse bajo el modelo de permisos nativo de Node.js 26+ (`node --permission ...`).
