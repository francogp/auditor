# @fgp/auditor

Motor autónomo de análisis estático, auditoría de arquitectura y gobierno de calidad de código para proyectos basados en Node.js 26+ nativo (`--permission`, `--experimental-strip-types`). Provee el framework `BaseAuditor`, runner concurrente de alta velocidad, renderizado unificado en terminal con tablas Box-Drawing (80 columnas), integración con Fallow y herramientas nativas, **distribución oficial de skills para agentes de Antigravity** y **gestión de entorno de desarrollo multiplataforma con soporte de plugins**.

---

## 🚀 Inicio Rápido & Preparación de Entorno

El repositorio del auditor gestiona su propio entorno de forma determinista y aislada:

### En Linux / macOS:
```bash
./setup-linux.sh
```

### En Windows (PowerShell):
```powershell
.\setup-windows.ps1
```

> [!IMPORTANT]
> **Aislamiento y Convivencia Multi-Proyecto Garantizada**:
> Los scripts de setup preservan las demás versiones de Node.js instaladas en el sistema, no alteran el alias `default` de NVM (activan el entorno vía `.nvmrc` para la sesión local) y aíslan la configuración de NPM exclusivamente a `.npmrc` del proyecto sin tocar `~/.npmrc`.

---

## 📦 Uso como Librería en Proyectos Host

### 1. Instalación en el Proyecto Host

En el `package.json` del proyecto host (ej. `facturacion2` o `PokeBorrador`):
```json
{
  "devDependencies": {
    "@fgp/auditor": "file:../auditor"
  }
}
```

Luego ejecuta `npm install`.

### 2. Habilitar el Skill Oficial de Auditoría para Agentes de IA

Para que el agente de Antigravity cargue automáticamente el skill oficial `auditor-framework` y las directrices de `rules/AGENTS.md`:

```bash
npx auditor-init-agent
```

Este comando registra `@fgp/auditor` en `.agents/plugins.json` del proyecto host sin duplicar código ni plantillas.

### 3. Sincronizar Scripts de Entorno Canónicos

Para que el proyecto host utilice los scripts canónicos de setup y actualización de entorno de `@fgp/auditor`:

```bash
npx auditor-sync-env
```

Esto copiará `setup-linux.sh` y `setup-windows.ps1` al host e inicializará el directorio `scripts/setup/plugins/`.

---

## 🔌 Sistema de Plugins para Setup de Entorno

Los scripts de setup generados por `@fgp/auditor` son **100% agnósticos y libres de código hardcodeado**. Si tu proyecto host necesita tareas adicionales durante la inicialización:

1. **Plugins por Scripts**:
   Coloca tus scripts específicos en `scripts/setup/plugins/`:
   - `scripts/setup/plugins/01_deploy_templates.sh` (para Linux)
   - `scripts/setup/plugins/01_deploy_templates.ps1` (para Windows)
   El setup los detectará y ejecutará en orden alfabético tras instalar las dependencias.

2. **Gancho NPM (`env:post-setup`)**:
   Define un script `"env:post-setup"` en tu `package.json`:
   ```json
   "scripts": {
     "env:post-setup": "npm run servers:configure"
   }
   ```
   El setup lo invocará automáticamente al finalizar.

---

## 🏛️ Invariante de Piso de Versión (Cero Hardcoding)

Cualquier proyecto que consuma `@fgp/auditor` **no puede solicitar ni utilizar versiones de Node.js o npm inferiores a las exigidas por el auditor**.
- La cota mínima se define dinámicamente en el `package.json` y `.nvmrc` del auditor al correr su setup.
- El comando `npx auditor-check-env` (ejecutado automáticamente en `preinstall`) lee dinámicamente el `package.json` de la librería y valida que el host satisfaga o supere dicho piso.

---

## 🛠️ Comandos CLI Disponibles

| Binario / Script | Descripción |
| :--- | :--- |
| `auditor` | Ejecuta la suite completa de auditorías de arquitectura (`src/cli/audit_full.ts`). |
| `auditor-commit` | Puerta de enlace segura de pre-commit (`src/cli/audit_for_commit.ts`). |
| `auditor-init-agent` | Registra el plugin y skill oficial en `.agents/plugins.json` del host. |
| `auditor-sync-env` | Sincroniza los scripts de setup (`setup-linux.sh`, `setup-windows.ps1`) y crea `scripts/setup/plugins/`. |
| `auditor-check-env` | Validador de entorno y versiones mínimas contra la librería SSoT. |
| `auditor-setup-env` | Invocador multiplataforma de setup (`setup-linux.sh` / `setup-windows.ps1`). |

---

## 🧪 Pruebas Unitarias del Framework

Para ejecutar la suite completa de pruebas unitarias de `@fgp/auditor`:

```bash
npm test
```

## 📜 Licencia

Propietario: Franco Gastón Pellegrini (`@fgp`).
