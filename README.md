# @francogp/auditor

> **Motor autónomo de análisis estático, auditoría de arquitectura y gobierno de calidad de código para proyectos Node.js 26+ nativos (`--permission`, `--experimental-strip-types`).**

Provee el framework abstracto `BaseAuditor`, un runner streaming concurrente de alta velocidad, renderizado terminal estandarizado en tablas Box-Drawing (80 columnas fijas, visual width alineado con emojis), más de 37 suites de análisis integradas, **distribución nativa de skills y reglas para agentes de IA de Antigravity**, y un **sistema agnóstico de gobierno de entornos multiplataforma (Linux/Windows) con arquitectura de plugins extensibles y cero hardcoding**.

---

## 📑 Tabla de Contenidos

1. [Inicio Rápido & Setup de Entorno Local](#1-inicio-rápido--setup-de-entorno-local)
2. [Tutorial: Instalación en Proyectos Host](#2-tutorial-instalación-en-proyectos-host)
3. [Tutorial: Ejecución y Flujos de Auditoría](#3-tutorial-ejecución-y-flujos-de-auditoría)
4. [Tutorial: Integración con Agentes de IA (Antigravity Plugin & Skill)](#4-tutorial-integración-con-agentes-de-ia-antigravity)
5. [Tutorial: Gobierno de Entorno Multiplataforma & Plugins](#5-tutorial-gobierno-de-entorno-multiplataforma--plugins)
6. [Tutorial: Creación de Sub-Auditores Personalizados](#6-tutorial-creación-de-sub-auditores-personalizados)
7. [Tutorial: Configuración Centralizada (`audit.config.ts`)](#7-tutorial-configuración-centralizada-auditconfigts)
8. [Tutorial: Testing Hermético de Sub-Auditores con Vitest](#8-tutorial-testing-hermético-de-sub-auditores-con-vitest)
9. [Tutorial: Reportes, Métricas e Inspección de Hallazgos](#9-tutorial-reportes-métricas-e-inspección-de-hallazgos)
10. [Referencia de Comandos CLI](#10-referencia-de-comandos-cli)
11. [Licencia](#11-licencia)

---

## 1. Inicio Rápido & Setup de Entorno Local

Si estás desarrollando directamente dentro del repositorio `@francogp/auditor`:

### En Linux / macOS

```bash
./setup-linux.sh
```

### En Windows (PowerShell con permisos de ejecución)

```powershell
.\setup-windows.ps1
```

> [!IMPORTANT]
> **Aislamiento y Convivencia Multi-Proyecto Garantizada**:
> Los scripts de setup preservan las demás versiones de Node.js instaladas en tu sistema, no alteran el alias `default` de NVM (activan el entorno vía `.nvmrc` para la sesión local) y aíslan la configuración de NPM exclusivamente a `.npmrc` del proyecto sin alterar tu configuración global en `~/.npmrc`.

---

## 2. Tutorial: Instalación en Proyectos Host

Puedes instalar `@francogp/auditor` en cualquier proyecto consumidor (aplicaciones web, APIs, monorrepos) como dependencia directa o paquete npm.

### Opción A: Instalación desde GitHub (Recomendada para CI/CD y GitHub Pages)

Agrega a las `devDependencies` de tu `package.json`:

```json
{
  "devDependencies": {
    "@francogp/auditor": "github:francogp/auditor#main"
  }
}
```

Luego instala las dependencias:

```bash
npm install
```

> [!NOTE]
> Al ser un repositorio público en GitHub, GitHub Actions en entornos como GitHub Pages ejecutará `npm ci` o `npm install` clonando la librería automáticamente vía HTTPS sin requerir tokens, SSH keys ni secretos en el repositorio.

### Opción B: Enlace Local (Durante desarrollo simultáneo)

```json
{
  "devDependencies": {
    "@francogp/auditor": "file:../auditor"
  }
}
```

### Configuración recomendada de scripts en el `package.json` del Host

```json
{
  "scripts": {
    "preinstall": "auditor-check-env",
    "audit": "node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process node_modules/@francogp/auditor/src/cli/audit_full.ts",
    "audit:commit": "node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process node_modules/@francogp/auditor/src/cli/audit_for_commit.ts",
    "audit:fix": "npm run audit -- fix",
    "env:setup": "auditor-setup-env",
    "env:sync": "auditor-sync-env"
  }
}
```

### Gestión Centralizada de Herramientas (SSoT) y Cero Duplicación

`@francogp/auditor` actúa como la **Single Source of Truth** de dependencias de análisis estático y compilación. Incluye y fija internamente:

- **`fallow`**: Inteligencia de código, complejidad ciclomática/cognitiva, duplicaciones y seguridad CWE.
- **`html-validate`** y **`html-validate-vue`**: Estándares W3C/WHATWG Living Standard en templates.
- **`typescript`**: Compilador y typechecker nominal.
- **`markdownlint-cli`**: Linter de higiene y consistencia en documentación.
- **`css-checker-kit`**: Auditor de duplicación de reglas y selectores CSS/SCSS.
- **`rollup-plugin-visualizer`**: Generación de treemaps interactivos para presupuestos de bundles.

> [!IMPORTANT]
> **No dupliques estas herramientas en el host**:
> Los proyectos consumidores (`facturacion2`, `PokeBorrador`, etc.) **no deben declarar** estas librerías en sus propios `devDependencies`. Al ejecutar `npm update @francogp/auditor`, el proyecto host actualiza automáticamente el motor y las herramientas de análisis al unísono sin alterar su `package.json`.

---

## 3. Tutorial: Ejecución y Flujos de Auditoría

### 3.1. Auditoría Completa del Proyecto

Ejecuta todas las suites genéricas y las extensiones registradas en `audit.config.ts`:

```bash
npx auditor
# o si definiste el script npm:
npm run audit
```

- Muestra una barra de progreso paso a paso en streaming (`🔍 [1/37]`).
- Imprime la tabla consolidada en terminal con diseño Box-Drawing de 80 columnas.
- Persiste el informe estructurado completo en `scratch/audits/latest_audit.json`.

### 3.2. Modo Auto-Fix (Corrección Automática)

Muchas suites (como registro de plugins, higiene de Markdown, o formatos automáticos) admiten corrección automática:

```bash
npx auditor fix
# o:
npm run audit:fix
```

### 3.3. Filtrar por Familia o Suite Específica

Si deseas ejecutar únicamente las auditorías de arquitectura o documentación:

```bash
# Filtrar por familia:
npx auditor --family=architecture
npx auditor --family=documentation

# Filtrar por sub-auditor específico:
npx auditor --suite=validate_agent_plugin
```

### 3.4. Auditoría para Pre-Commit Seguro (`auditor-commit`)

Valida que tu trabajo local esté limpio antes de hacer commit o push contra `origin/main`:

```bash
npx auditor-commit
# o:
npm run audit:commit
```

- **Errores**: Exige 0 errores en todo el proyecto.
- **Advertencias (Warnings)**: Compara con `origin/main` y bloquea **únicamente** advertencias nuevas introducidas en archivos modificados por tu commit, permitiendo advertencias heredadas en archivos que no tocaste.
- **Fallow Zero-Downgrade Mandate**: Las métricas de Fallow (duplicación, complejidad, exports no usados, funciones >60 líneas) siempre tienen severidad estricta `error`.

---

## 4. Tutorial: Integración con Agentes de IA (Antigravity)

`@francogp/auditor` se distribuye como un **Plugin Oficial de Antigravity**. Incluye:

- **Skill Oficial**: [`skills/auditor-framework/SKILL.md`](skills/auditor-framework/SKILL.md)
- **Plantillas Oficiales**: [`skills/auditor-framework/assets/templates/`](skills/auditor-framework/assets/templates/)
- **Reglas Arquitecturales**: [`rules/AGENTS.md`](rules/AGENTS.md)

### 4.1. Habilitar el Skill en tu Proyecto Host

En la raíz de tu proyecto host, ejecuta:

```bash
npx auditor-init-agent
```

Este comando:

1. Localiza o crea la carpeta `.agents/` en el proyecto host.
2. Registra la entrada `"node_modules/@francogp/auditor"` en `.agents/plugins.json`.
3. Inmediatamente, cualquier agente de IA que trabaje en el proyecto host descubrirá y activará automáticamente el skill `auditor-framework` y las directrices de `rules/AGENTS.md`.

### 4.2. Detección Automática de Olvidos (`validate_agent_plugin`)

El auditor incluye una suite integrada que verifica si el proyecto host olvidó correr `npx auditor-init-agent`. Si falta el registro, la auditoría fallará con un mensaje guiado:

```text
[ ❌ FAIL ] Falta registrar @francogp/auditor en .agents/plugins.json.
            Ejecuta: npx auditor-init-agent (o 'npm run audit fix')
```

---

## 5. Tutorial: Gobierno de Entorno Multiplataforma & Plugins

El auditor actúa como **Single Source of Truth (SSoT)** para el entorno de desarrollo en Linux, macOS y Windows, garantizando **cero hardcoding** y compatibilidad multi-proyecto.

### 5.1. Sincronizar los Scripts Canónicos al Host

Para adoptar el sistema de setup en un proyecto consumidor:

```bash
npx auditor-sync-env
```

Esto:

- Copia [`setup-linux.sh`](setup-linux.sh) y [`setup-windows.ps1`](setup-windows.ps1) actualizados a la raíz del host.
- Crea el directorio de extensiones en `scripts/setup/plugins/`.

### 5.2. Invariante de Piso Mínimo de Versión (Node / NPM)

Los proyectos consumidores **no pueden solicitar versiones de Node.js o npm inferiores a las requeridas por el auditor**:

- La cota mínima se define dinámicamente en el `package.json` del auditor (ej. `node: ">=26.10.0"`, `npm: ">=12.0.0"`).
- `npx auditor-check-env` (configurado en el gancho `preinstall` del host) verifica antes de cualquier `npm install` que el entorno cumpla o supere la versión requerida.

### 5.3. Agregar Plugins Específicos de tu Proyecto

Los scripts de setup del auditor son 100% genéricos. Para agregar tareas propias de tu proyecto (configurar base de datos, generar certificados locales, copiar variables de entorno):

1. **Vía Archivos de Plugin**:
   Crea scripts numerados en `scripts/setup/plugins/`:
   - `scripts/setup/plugins/01_deploy_env.sh` (para Linux/macOS)
   - `scripts/setup/plugins/01_deploy_env.ps1` (para Windows)
   El setup los descubrirá y ejecutará ordenadamente al finalizar la instalación de Node y paquetes npm.

2. **Vía Gancho de NPM (`env:post-setup`)**:
   En el `package.json` del host:

   ```json
   {
     "scripts": {
       "env:post-setup": "npm run db:migrate && npm run generate-certs"
     }
   }
   ```

   Si existe, el setup invocará este comando automáticamente al concluir.

---

## 6. Tutorial: Creación de Sub-Auditores Personalizados

Puedes crear auditores específicos para tu aplicación dentro de `scripts/auditors/` o en un directorio dedicado.

### 6.1. Sub-Auditor Basado en Archivos (`FileScanAuditor`)

Usa `FileScanAuditor` cuando tu regla deba analizar archivos individuales con expresiones regulares o análisis léxico:

```typescript
// scripts/auditors/validate_no_inline_sql.ts
import { FileScanAuditor, type AuditFinding } from '@francogp/auditor';

export const NO_INLINE_SQL_RULES = ['inline-sql-detected'] as const;
export type NoInlineSqlRuleId = (typeof NO_INLINE_SQL_RULES)[number];

export class NoInlineSqlAuditor extends FileScanAuditor<NoInlineSqlRuleId> {
  public override readonly id = 'validate_no_inline_sql';
  public override readonly family = 'architecture';
  public override readonly packageName = 'Base de Datos';
  public override readonly description = 'Prohíbe consultas SQL inline en componentes de vista';

  public override readonly targetExtensions = ['.vue', '.ts'];
  public override readonly ignoredFiles = ['.test.ts', '.spec.ts'];

  public override formatRuleDescription(ruleId: NoInlineSqlRuleId): string {
    return 'Consulta SQL encontrada en capa de presentación';
  }

  public override async scanFile(filePath: string, content: string): Promise<AuditFinding<NoInlineSqlRuleId>[]> {
    const findings: AuditFinding<NoInlineSqlRuleId>[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (/SELECT\s+.*\s+FROM\s+/i.test(lines[i])) {
        findings.push(this.createFinding({
          ruleId: 'inline-sql-detected',
          severity: 'error',
          file: filePath,
          line: i + 1,
          message: 'Extrae la consulta SQL al repositorio de datos correspondiente.',
          context: lines[i].trim()
        }));
      }
    }

    return findings;
  }
}
```

### 6.2. Sub-Auditor Global de Alto Rendimiento (`BaseAuditor`)

Usa `BaseAuditor` cuando necesites escanear todo el árbol de directorios, interactuar con herramientas externas o procesar estructuras globales:

```typescript
// scripts/auditors/validate_bundle_limits.ts
import { BaseAuditor } from '@francogp/auditor';
import fs from 'node:fs/promises';
import path from 'node:path';

export class BundleLimitsAuditor extends BaseAuditor<'bundle-size-exceeded'> {
  public override readonly id = 'validate_bundle_limits';
  public override readonly family = 'performance';
  public override readonly packageName = 'Frontend';
  public override readonly description = 'Verifica que ningún asset supere el presupuesto de 1MB';

  public override formatRuleDescription(ruleId: 'bundle-size-exceeded'): string {
    return 'Asset supera el límite máximo de tamaño';
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 1, 'Analizando tamaño de assets en dist/...');
    const distAssets = path.join(this.projectRoot, 'dist/assets');

    // ... lógica de análisis ...
    this.context.setMetric('Assets Analizados', '14 archivos');
  }
}
```

### 6.3. Análisis de AST Compartido (`SharedAstContext`)

Si necesitas analizar código TypeScript/JavaScript a nivel de Árbol de Sintaxis Abstracta (AST), usa `SharedAstContext` provisto por el framework para no re-parsear archivos:

```typescript
import { BaseAuditor, SharedAstContext } from '@francogp/auditor';

export class CustomAstAuditor extends BaseAuditor<string> {
  // ...
  public override async runAudit(): Promise<void> {
    const sourceFiles = await this.findProjectFiles(['.ts', '.tsx']);
    
    for (const file of sourceFiles) {
      // Obtiene el AST cacheado en memoria:
      const sourceFile = SharedAstContext.getSourceFile(file);
      if (!sourceFile) continue;

      // Recorrer nodos AST con la API nativa de TypeScript...
    }
  }
}
```

---

## 7. Tutorial: Configuración Centralizada (`audit.config.ts`)

En la raíz del proyecto host, crea `audit.config.ts` utilizando la función tipada `defineAuditConfig`:

```typescript
// audit.config.ts
import { defineAuditConfig } from '@francogp/auditor/config';
import { NoInlineSqlAuditor } from './scripts/auditors/validate_no_inline_sql.ts';

export default defineAuditConfig({
  projectRoot: process.cwd(),
  paths: {
    sourceDirs: ['src', 'scripts'],
    ignoredDirs: ['dist', 'coverage', 'node_modules', 'scratch'],
    ephemeralScratchDir: 'scratch/audits'
  },
  bundle: {
    maxMainBundleSizeWarningBytes: 1.2 * 1024 * 1024, // 1.2 MB
    maxMainBundleSizeErrorBytes: 2.0 * 1024 * 1024,   // 2.0 MB
    // Prefijos de Web Workers exentos del límite de hilo principal:
    exemptChunkPrefixes: ['worker-', 'sqlite-wasm-']
  },
  extensions: [
    new NoInlineSqlAuditor()
  ]
});
```

---

## 8. Tutorial: Testing Hermético de Sub-Auditores con Vitest

Todas las pruebas unitarias de los sub-auditores deben cumplir los contratos de diseño del framework:

1. **Zero Live Repository Scanning**: Nunca ejecutes `auditor.execute()` sobre `process.cwd()` en tests unitarios. Usa snippets aislados con `testScanFile` o sandboxes con `fs.mkdtemp`.
2. **Verificación Negativa (Clean Path)**: Cada suite debe probar que un código válido produce `0` errores y estado `passed`.

### Ejemplo de Test Unitario Canónico

```typescript
// tests/validate_no_inline_sql.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoInlineSqlAuditor } from '../scripts/auditors/validate_no_inline_sql.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('NoInlineSqlAuditor', () => {
  let auditor: NoInlineSqlAuditor;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-test-'));
    auditor = new NoInlineSqlAuditor({ projectRoot: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detecta consultas SQL inline en archivos de componentes', async () => {
    const badCode = `
      export function loadUsers() {
        return db.raw("SELECT * FROM users WHERE active = 1");
      }
    `;
    const findings = await auditor.testScanFile('src/views/UserView.vue', badCode);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('inline-sql-detected');
    expect(findings[0].severity).toBe('error');
  });

  it('cumple verificación limpia en código que delega a repositorios (0 errores)', async () => {
    const cleanCode = `
      export function loadUsers() {
        return userRepository.findAllActive();
      }
    `;
    const findings = await auditor.testScanFile('src/views/UserView.vue', cleanCode);
    expect(findings.length).toBe(0);

    const result = await auditor.finishAudit();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
```

---

## 9. Tutorial: Reportes, Métricas e Inspección de Hallazgos

### 9.1. Salida en Terminal (UnifiedTheme Box-Drawing)

El motor formatea todas las tablas con reglas estrictas de renderizado:

- Ancho estándar de **80 columnas**.
- Medición visual precisa (`getVisualWidth`) para caracteres de doble ancho y emojis (evitando descuadres visuales).
- Inclusión mandatoria de la fila **`TOTAL CONSOLIDADO`** al final de cada reporte.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  AUDITORÍA DE ARQUITECTURA & CALIDAD DE CÓDIGO                              │
├────────────────────────────────────────┬────────┬───────┬───────┬────────────┤
│ Familia / Sub-Auditor                  │ Estado │ Err   │ Warn  │ Tiempo     │
├────────────────────────────────────────┼────────┼───────┼───────┼────────────┤
│ Agente: validate_agent_plugin          │ PASS   │ 0     │ 0     │ 12 ms      │
│ Base de Datos: validate_no_inline_sql  │ PASS   │ 0     │ 0     │ 24 ms      │
│ Código: validate_eslint                │ PASS   │ 0     │ 0     │ 145 ms     │
├────────────────────────────────────────┼────────┼───────┼───────┼────────────┤
│ TOTAL CONSOLIDADO                      │ PASS   │ 0     │ 0     │ 181 ms     │
└────────────────────────────────────────┴────────┴───────┴───────┴────────────┘
```

### 9.2. Reporte JSON Estructurado

Cada ejecución genera `scratch/audits/latest_audit.json`:

- Metadatos de ejecución (tiempo total, fecha, plataforma).
- Desglose por sub-auditor y por familia.
- Array de hallazgos tipados con archivo, línea, columna, regla, mensaje y contexto del snippet afectado.

---

## 10. Referencia de Comandos CLI

| Comando Binario | Script Asociado | Propósito |
| :--- | :--- | :--- |
| `npx auditor` | `src/cli/audit_full.ts` | Ejecuta la suite completa de auditorías del proyecto. Soporta flags `--family`, `--suite` y `fix`. |
| `npx auditor-commit` | `src/cli/audit_for_commit.ts` | Gatekeeper para pre-commit. Exige 0 errores y bloquea advertencias nuevas comparando con `origin/main`. |
| `npx auditor-init-agent` | `src/cli/init_agent.ts` | Registra `@francogp/auditor` en `.agents/plugins.json` del proyecto para activar el skill de Antigravity. |
| `npx auditor-sync-env` | `src/cli/sync_env_scripts.ts` | Copia `setup-linux.sh`, `setup-windows.ps1` e inicializa `scripts/setup/plugins/` en el proyecto host. |
| `npx auditor-check-env` | `src/cli/check_environment.ts` | Valida que las versiones de Node.js y npm del host cumplan el piso requerido por el auditor (usado en `preinstall`). |
| `npx auditor-setup-env` | `src/cli/setup_env.ts` | Detecta la plataforma y ejecuta el script de setup correspondiente (`setup-linux.sh` o `setup-windows.ps1`). |

---

## 11. Licencia

**MIT License** © 2026 Franco Gastón Pellegrini ([`@francogp`](https://github.com/francogp)).  
Consulta el archivo [`LICENSE`](LICENSE) para más detalles.
