# @francogp/auditor

> **Motor autónomo de análisis estático, auditoría de arquitectura, empaquetado de skills para agentes de IA y gobierno de calidad de código para proyectos Node.js 26+ nativos (`--permission`, `--experimental-strip-types`).**

Provee el framework abstracto `BaseAuditor` y `FileScanAuditor`, un runner streaming concurrente de alta velocidad, renderizado terminal estandarizado en tablas Box-Drawing (80 columnas fijas, visual width alineado con emojis y fila mandatoria `TOTAL CONSOLIDADO`), 36 suites de análisis genéricas integradas, **distribución nativa de 43 skills para agentes de IA de Antigravity**, **herramientas de análisis centralizadas (SSoT)** y un **sistema agnóstico de gobierno de entornos multiplataforma (Linux/Windows) con arquitectura de plugins extensibles y cero hardcoding**.

---

## 📑 Tabla de Contenidos

1. [Inicio Rápido & Setup de Entorno Local](#1-inicio-rápido--setup-de-entorno-local)
2. [Tutorial: Instalación en Proyectos Host](#2-tutorial-instalación-en-proyectos-host)
3. [Centralización de Dependencias (SSoT) y Cero Duplicación](#3-centralización-de-dependencias-ssot-y-cero-duplicación)
4. [Tutorial: Ejecución y Flujos de Auditoría](#4-tutorial-ejecución-y-flujos-de-auditoría)
5. [Tutorial: Auditoría de Bundle y Presupuestos de Rendimiento](#5-tutorial-auditoría-de-bundle-y-presupuestos-de-rendimiento)
6. [Tutorial: Integración con Agentes de IA (43 Skills de Antigravity)](#6-tutorial-integración-con-agentes-de-ia-43-skills-de-antigravity)
7. [Tutorial: Gobierno de Entorno Multiplataforma & Plugins](#7-tutorial-gobierno-de-entorno-multiplataforma--plugins)
8. [Tutorial: Creación de Sub-Auditores Personalizados](#8-tutorial-creación-de-sub-auditores-personalizados)
9. [Tutorial: Configuración Centralizada (`audit.config.ts`)](#9-tutorial-configuración-centralizada-auditconfigts)
10. [Tutorial: Testing Hermético de Sub-Auditores con Vitest](#10-tutorial-testing-hermético-de-sub-auditores-con-vitest)
11. [Tutorial: Reportes, Métricas e Inspección de Hallazgos](#11-tutorial-reportes-métricas-e-inspección-de-hallazgos)
12. [Guía de Migración (desde `@fgp/auditor` o `packages/auditor`)](#12-guía-de-migración-desde-fgpauditor-o-packagesauditor)
13. [Referencia Completa de Comandos CLI](#13-referencia-completa-de-comandos-cli)
14. [Licencia](#14-licencia)

---

## 1. Inicio Rápido & Setup de Entorno Local

Si estás desarrollando directamente dentro del repositorio `@francogp/auditor`:

### En Linux / macOS

```bash
./setup-linux.sh
```

### En Windows (PowerShell)

```powershell
.\setup-windows.ps1
```

> [!IMPORTANT]
> **Aislamiento y Convivencia Multi-Proyecto Garantizada**:
> Los scripts de setup preservan las demás versiones de Node.js instaladas en tu sistema, no alteran el alias `default` de NVM (activan el entorno vía `.nvmrc` para la sesión local) y aíslan la configuración de NPM exclusivamente a `.npmrc` del proyecto sin alterar tu configuración global en `~/.npmrc`.

---

## 2. Tutorial: Instalación en Proyectos Host

Puedes instalar `@francogp/auditor` en cualquier proyecto consumidor (aplicaciones web Vue/React, APIs backend, librerías o monorrepos) como dependencia de desarrollo:

### Opción A: Instalación desde GitHub (Recomendada para CI/CD y Proyectos FrancoGP)

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
> Al ser un repositorio público en GitHub, GitHub Actions en entornos como GitHub Pages o CI ejecutará `npm ci` o `npm install` clonando la librería automáticamente vía HTTPS sin requerir tokens, SSH keys ni secretos en el repositorio.

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
    "audit": "auditor",
    "audit:for-commit": "auditor-commit",
    "audit:bundle": "auditor-bundle",
    "audit:findings": "auditor-findings",
    "audit:fallow": "auditor-fallow category=all",
    "audit:complexity": "auditor-complexity",
    "audit:lint": "auditor preset=lint",
    "audit:fix": "auditor fix",
    "env:setup": "auditor-setup-env",
    "env:sync": "auditor-sync-env"
  }
}
```

---

## 3. Centralización de Dependencias (SSoT) y Cero Duplicación

`@francogp/auditor` actúa como la **Single Source of Truth** de dependencias de análisis estático, linters y compilación. Incluye y gestiona internamente:

- **`fallow`**: Inteligencia de código, complejidad ciclomática/cognitiva, duplicaciones y escaneo estricto de seguridad CWE (100% severidad `error`, zero-warning mandate).
- **`html-validate`** y **`html-validate-vue`**: Cumplimiento del W3C / WHATWG Living Standard en templates Vue y HTML, elementos obsoletos y atributos deprecados.
- **`typescript`**: Compilador nominal y typechecker (`tsc --noEmit`), con soporte de fallback si el proyecto no utiliza `vue-tsc`.
- **`markdownlint-cli`**: Linter de higiene y consistencia en documentación Markdown.
- **`css-checker-kit`**: Auditor multiplataforma nativo de duplicación de clases y reglas CSS/SCSS.
- **`rollup-plugin-visualizer`**: Generación de treemaps interactivos para presupuestos de bundles.

> [!IMPORTANT]
> **Elimina dependencias redundantes en el host**:
> Los proyectos consumidores (aplicaciones web, servicios backend, etc.) **no deben declarar** estas librerías en sus propios `devDependencies`. Al ejecutar `npm update @francogp/auditor`, todos los proyectos dependientes reciben las versiones actualizadas de estas herramientas de forma unificada.

---

## 4. Tutorial: Ejecución y Flujos de Auditoría

### 4.1. Auditoría Completa del Proyecto

Ejecuta todas las suites genéricas y las extensiones registradas en `audit.config.ts`:

```bash
npx auditor
# o con npm:
npm run audit
```

- Muestra una barra de progreso paso a paso en streaming (`🔍 [1/36]`).
- Imprime la tabla consolidada en terminal con diseño Box-Drawing de 80 columnas fijas y fila `TOTAL CONSOLIDADO`.
- Persiste el informe estructurado completo en `scratch/audits/latest_audit.json`.

### 4.2. Modo Auto-Fix (Corrección Automática)

Muchas suites (higiene de Markdown, registro de plugins, formatos automáticos) admiten corrección automática:

```bash
npx auditor fix
# o:
npm run audit:fix
```

### 4.3. Filtrar por Familia o Suite Específica

```bash
# Filtrar por familia:
npx auditor --family=architecture
npx auditor --family=documentation
npx auditor --family=domain_data
npx auditor --family=persistence

# Filtrar por sub-auditor específico:
npx auditor --suite=validate_agent_plugin
npx auditor --suite=validate_pinia_reactivity
```

### 4.4. Auditoría para Pre-Commit Seguro (`auditor-commit`)

Valida que tu trabajo local esté limpio antes de hacer commit o push contra `origin/main`:

```bash
npx auditor-commit
# o:
npm run audit:for-commit
```

- **Errores**: Exige 0 errores en todo el proyecto.
- **Advertencias (Warnings)**: Compara con `origin/main` y bloquea **únicamente** advertencias nuevas introducidas en archivos modificados por tu commit, permitiendo advertencias heredadas en archivos no modificados.
- **Fallow Zero-Downgrade Mandate**: Todas las métricas de Fallow (duplicación, complejidad, exports no usados, funciones >60 líneas) se evalúan con severidad estricta `error`.

---

## 5. Tutorial: Auditoría de Bundle y Presupuestos de Rendimiento

El comando `auditor-bundle` audita de forma exhaustiva los archivos generados en `dist/assets/` tras la compilación de producción:

```bash
npx auditor-bundle
# o:
npm run audit:bundle
```

### Características

- **Límites de Hilo Principal**: Detecta chunks JS/CSS que superen los umbrales configurados (por defecto: advertencia a 1.2 MB, error a 2.0 MB).
- **Exenciones Dinámicas de Web Workers**: Chunks legítimos que se ejecutan en segundo plano o librerías pesadas aisladas pueden eximirse mediante `bundle.exemptChunkPrefixes` en `audit.config.ts`.
- **Desactivación para Proyectos sin Bundle**: Si tu proyecto es una librería backend o herramienta CLI sin paso de empaquetado frontend, puedes desactivar la auditoría con `bundle: { enabled: false }` o permitir que no exista la carpeta con `bundle: { allowMissingDist: true }`.

---

## 6. Tutorial: Integración con Agentes de IA (43 Skills de Antigravity)

`@francogp/auditor` se distribuye como un **Plugin Oficial de Antigravity** que empaqueta **43 skills canónicos de ingeniería de software** y reglas arquitecturales de observabilidad para agentes autónomos.

### 6.1. Habilitar el Plugin en tu Proyecto Host

En la raíz de tu proyecto host, ejecuta:

```bash
npx auditor-init-agent
```

Este comando:

1. Localiza o crea la carpeta `.agents/` en el proyecto host.
2. Registra la entrada `"node_modules/@francogp/auditor"` en `.agents/plugins.json`.
3. Inmediatamente, cualquier agente de IA de Antigravity descubrirá y activará automáticamente las 43 skills y las directrices de `AGENTS.md`.

### 6.2. Catálogo de Skills Empaquetadas y Correspondencia con Sub-Auditores

Cada sub-auditor tiene una o más skills compañeras que enseñan al agente de IA exactamente cómo cumplir las reglas y resolver las incidencias:

| Familia de Auditorías | Sub-Auditores Clave | Skills de IA Vinculadas |
| :--- | :--- | :--- |
| **Framework & Calidad** | `validate_auditor_framework`, `validate_auditor_tests` | `auditor`, `clean-code`, `tdd`, `testing-patterns` |
| **Arquitectura & Tipos** | `validate_domain_types`, `validate_o1_data_structures`, `validate_duplicate_constants` | `architecture`, `domain-type-first`, `clean-code`, `improve-codebase-architecture` |
| **Vue & Reactividad** | `validate_pinia_reactivity`, `validate_reactive_leaks`, `validate_reactive_purity`, `validate_vue_sfc_hygiene` | `vue-best-practices`, `vue-pinia-best-practices`, `vue-router-best-practices`, `vue-testing-best-practices`, `vue-debug-guides`, `create-adaptable-composable`, `vueuse-functions` |
| **UI, Animaciones & CSS** | `validate_component_styles`, `validate_css_duplicates`, `validate_z_index`, `validate_typography_line_height` | `frontend-design`, `web-design-guidelines`, `gsap-core`, `gsap-plugins`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-frameworks`, `gsap-utils`, `gsap-performance` |
| **HTML5 & Accesibilidad** | `validate_html_validate`, `validate_template_ids` | `web-design-guidelines`, `clean-code` |
| **Inteligencia & Complejidad** | `validate_fallow`, `report_complexity`, `report_fallow` | `fallow`, `fallow-review`, `ponytail`, `ponytail-review`, `ponytail-debt`, `ponytail-audit`, `ponytail-gain` |
| **Seguridad & Persistencia** | `fallow security`, `validate_sql_anti_patterns`, `validate_ephemeral_storage_isolation` | `vulnerability-scanner`, `red-team-tactics`, `database-design`, `valibot` |
| **Documentación & DOX** | `validate_dox_integrity`, `validate_markdown_lint`, `validate_markdown_links`, `validate_markdown_code_references` | `dox-navigator`, `learn-with-docs`, `grill-with-docs` |
| **Entorno & Flujo Git** | `validate_agent_plugin`, `validate_type_check` | `safe-commit`, `systematic-debugging`, `typescript-6-upgrade`, `mcp-builder`, `skill-creator`, `brainstorming` |

### 6.3. Verificación Automática del Plugin (`validate_agent_plugin`)

El auditor verifica que el proyecto host mantenga `.agents/plugins.json` sincronizado. Si falta el registro, la auditoría advertirá:

```text
[ ❌ FAIL ] Falta registrar @francogp/auditor en .agents/plugins.json.
            Ejecuta: npx auditor-init-agent (o 'npm run audit fix')
```

---

## 7. Tutorial: Gobierno de Entorno Multiplataforma & Plugins

El auditor actúa como **Single Source of Truth (SSoT)** para el entorno de desarrollo en Linux, macOS y Windows, garantizando **cero hardcoding** y compatibilidad multi-proyecto.

### 7.1. Sincronizar los Scripts Canónicos al Host

Para adoptar el sistema de setup en un proyecto consumidor:

```bash
npx auditor-sync-env
```

Esto:

- Copia [`setup-linux.sh`](setup-linux.sh) y [`setup-windows.ps1`](setup-windows.ps1) actualizados a la raíz del host.
- Inicializa el directorio de extensiones en `scripts/setup/plugins/`.

### 7.2. Invariante de Piso Mínimo de Versión (Node / NPM)

Los proyectos consumidores **no pueden solicitar versiones de Node.js o npm inferiores a las requeridas por el auditor**:

- La cota mínima se define dinámicamente en el `package.json` del auditor (`node: ">=26.10.0"`, `npm: ">=12.0.0"`).
- `auditor-check-env` (configurado en el gancho `preinstall` del host) verifica antes de cualquier `npm install` que el entorno cumpla o supere la versión requerida.

### 7.3. Agregar Plugins Específicos de tu Proyecto

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

## 8. Tutorial: Creación de Sub-Auditores Personalizados

Puedes crear auditores específicos para tu aplicación dentro de `scripts/auditors/` y registrarlos en `audit.config.ts`.

### 8.1. Sub-Auditor Basado en Archivos (`FileScanAuditor`)

Usa `FileScanAuditor` cuando tu regla deba analizar archivos individuales con expresiones regulares o análisis léxico:

```typescript
// scripts/auditors/architecture/validate_no_inline_sql.ts
import { FileScanAuditor } from '@francogp/auditor';

export const NO_INLINE_SQL_RULES = ['inline-sql-detected'] as const;
export type NoInlineSqlRuleId = (typeof NO_INLINE_SQL_RULES)[number];

export class NoInlineSqlAuditor extends FileScanAuditor<NoInlineSqlRuleId> {
  constructor(roots: readonly string[] = ['src']) {
    super({
      id: 'validate_no_inline_sql',
      name: 'No Inline SQL Auditor',
      description: 'Prohíbe consultas SQL directas en componentes de vista',
      family: 'architecture',
      packageName: 'Base de Datos',
      ruleIds: NO_INLINE_SQL_RULES,
      ruleDescriptions: {
        'inline-sql-detected': 'Consulta SQL en capa de presentación'
      },
      roots,
      allowedExtensions: new Set(['.vue', '.ts'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    if (relPath.includes('.test.') || relPath.includes('.spec.')) return;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/SELECT\s+.*\s+FROM\s+/i.test(lines[i]!)) {
        this.addViolation({
          ruleId: 'inline-sql-detected',
          severity: 'error',
          file: relPath,
          line: i + 1,
          message: 'Extrae la consulta SQL al servicio o repositorio correspondiente.',
          context: lines[i]!.trim()
        });
      }
    }
  }
}
```

### 8.2. Sub-Auditor Global de Alto Rendimiento (`BaseAuditor`)

Usa `BaseAuditor` cuando necesites escanear todo el árbol de directorios, ejecutar herramientas externas o procesar estructuras globales:

```typescript
// scripts/auditors/architecture/validate_custom_parity.ts
import { BaseAuditor } from '@francogp/auditor';
import fs from 'node:fs/promises';
import path from 'node:path';

export class CustomParityAuditor extends BaseAuditor<'parity-mismatch'> {
  constructor() {
    super({
      id: 'validate_custom_parity',
      name: 'Custom Domain Parity Validator',
      description: 'Verifica la integridad de datos entre TS y JSON',
      family: 'domain_data',
      packageName: 'Dominio',
      ruleIds: ['parity-mismatch'],
      ruleDescriptions: {
        'parity-mismatch': 'Discrepancia entre tipos y catálogo'
      }
    });
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 1, 'Validando paridad de catálogo...');
    // ... tu lógica de análisis ...
    this.context.setMetric('Registros Validados', 42);
  }
}
```

### 8.3. Análisis de AST Compartido (`SharedAstContext`)

Para analizar código TypeScript/JavaScript a nivel de Árbol de Sintaxis Abstracta (AST) con máximo rendimiento:

```typescript
import { BaseAuditor, SharedAstContext } from '@francogp/auditor';

export class CustomAstAuditor extends BaseAuditor<string> {
  public override async runAudit(): Promise<void> {
    const sourceFile = SharedAstContext.getSourceFile('src/logic/constants.ts');
    if (!sourceFile) return;

    // Recorre nodos AST con la API nativa de TypeScript sin re-parsear archivos
  }
}
```

---

## 9. Tutorial: Configuración Centralizada (`audit.config.ts`)

En la raíz del proyecto host, crea `audit.config.ts` utilizando la función tipada `defineAuditConfig`:

```typescript
// audit.config.ts
import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'Mi Aplicación Web',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    e2eRoots: ['scripts/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'database/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts', 'database'],
    dataRoots: ['src/data'],
    constantsRoots: ['src/logic/constants'],
    ignoreGlobs: ['node_modules/**', 'dist/**', 'scratch/**'],
    ignoredDirs: ['deploy', 'backup']
  },
  persistence: {
    engine: 'supabase', // 'sqlite' | 'supabase' | 'hybrid' | 'custom'
    schemaQualified: true,
    authorizedSaveFiles: ['src/logic/storage/saveCoordinator.ts'],
    saveKeyPrefixes: ['myapp_local_save_']
  },
  domain: {
    timezoneVariable: 'APP_TIMEZONE',
    timezoneHelperModule: '@/logic/utils/timeUtils',
    zLayersFile: 'src/logic/constants/visuals.ts',
    finiteDomainTypes: ['UserId', 'StatusId', 'RoleId'],
    infraIdWhitelist: ['saveId', 'sessionId', 'fileId'],
    fallbackIdPatterns: ['userId', 'roleId', 'statusId'],
    o1CatalogPatterns: [
      {
        name: 'PRODUCT_CATALOG',
        pattern: /\bPRODUCT_CATALOG\.(?:find|filter|some)\s*\(/g,
        alternative: 'PRODUCT_CATALOG_BY_ID[productId]',
        definingFile: 'src/data/products.ts'
      }
    ]
  },
  bundle: {
    enabled: true, // false para proyectos de backend o CLI sin bundle
    distDir: 'dist/assets',
    maxBundleBytes: 2 * 1024 * 1024,     // 2 MB error
    warnBundleBytes: 1.2 * 1024 * 1024,  // 1.2 MB warning
    exemptChunkPrefixes: ['worker-vendor-', 'wasm-engine-'],
    allowMissingDist: true
  },
  styles: {
    globalUtilityClasses: ['app-button-primary'],
    baseScssFile: 'src/styles/_base.scss',
    zLayersScssFile: 'src/styles/_base.scss'
  },
  templates: {
    requireInputIds: false,
    safeTemplateFunctions: ['formatMoney', 'translate']
  },
  animation: {
    customTimerFunctions: ['requestDelayedFrame']
  },
  constants: {
    ignoredNames: ['TAX_DEFAULT_ROUNDING'],
    exemptMagicNumbers: [21, 10.5, 27]
  },
  documentation: {
    knownValidAbstractPaths: ['@docs/architecture/fiscal-engine.md']
  },
  pinia: {
    authorizedMutationFiles: ['src/logic/coordinators/sessionCoordinator.ts']
  },
  agentPlugin: {
    enabled: true // false si el proyecto no utiliza el plugin de IA
  },
  customFamilies: [
    {
      key: 'billing',
      title: 'Billing & Tax Engine Invariants',
      order: 5,
      icon: '💰',
      description: 'Reglas de cálculo fiscal y facturación'
    }
  ],
  extensions: [
    './scripts/auditors/architecture/validate_no_inline_sql.ts'
  ]
});
```

> [!IMPORTANT]
> **Mandato de Configuración Explícita Obligatoria (Cero Omisiones Silenciosas)**:
> Todo proyecto consumidor debe configurar de manera explícita cada subsistema del auditor en `audit.config.ts`, declarando si se utiliza o si se ignora (por ejemplo, `bundle: { enabled: false }`, `styles: { zLayersEnabled: false }` o `persistence: { engine: 'none' }`). Los sub-auditores **nunca deben omitir silenciosamente** verificaciones ante falta de configuración o ausencia de archivos; si un subsistema no está configurado, la auditoría fallará con un error explícito. Esto asegura que al incorporar nuevas suites al motor, los proyectos dependientes sean notificados inmediatamente en lugar de pasar en falso positivo.
>
> **Blueprints Reales de Ejemplo**: Para consultar configuraciones completas de producción (como arquitecturas empresariales con backend Supabase o aplicaciones interactivas con persistencia híbrida SQLite + Supabase y Web Workers), revisa [`blueprints.md`](./.agents/skills/auditor/references/blueprints.md) y los archivos de ejemplo en [`skills/auditor/references/`](./.agents/skills/auditor/references/).

---

## 10. Tutorial: Testing Hermético de Sub-Auditores con Vitest

Todas las pruebas unitarias de los sub-auditores deben cumplir los contratos de diseño del framework:

1. **Zero Live Repository Scanning**: Nunca ejecutes `auditor.execute()` sobre `process.cwd()` en tests unitarios. Usa snippets aislados con `testScanFile` o sandboxes con `fs.mkdtemp`.
2. **Verificación Negativa (Clean Path Mandate)**: Cada suite debe probar que un código válido produce `0` errores y estado `passed`. `validate_auditor_tests` reporta como `severity: 'error'` cualquier suite que carezca de clean path test.

### Ejemplo de Test Unitario Canónico

```typescript
// tests/validate_no_inline_sql.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoInlineSqlAuditor } from '../scripts/auditors/architecture/validate_no_inline_sql.ts';
import type { ViolationInput } from '@francogp/auditor';

class TestableNoInlineSqlAuditor extends NoInlineSqlAuditor {
  public readonly collectedViolations: ViolationInput<string>[] = [];

  public override addViolation(v: ViolationInput<string>): void {
    this.collectedViolations.push(v);
    super.addViolation(v);
  }

  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('NoInlineSqlAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  it('detecta consultas SQL inline en componentes Vue', () => {
    const badCode = `
      export function loadUsers() {
        return db.raw("SELECT * FROM users WHERE active = 1");
      }
    `;
    const auditor = new TestableNoInlineSqlAuditor();
    auditor.testScanFile('src/views/UserView.vue', badCode);
    expect(auditor.collectedViolations.length).toBe(1);
    expect(auditor.collectedViolations[0]?.ruleId).toBe('inline-sql-detected');
  });

  it('cumple verificación limpia en código que delega a repositorios (0 errores)', async () => {
    const cleanCode = `
      export function loadUsers() {
        return userRepository.findAllActive();
      }
    `;
    const auditor = new TestableNoInlineSqlAuditor();
    auditor.testScanFile('src/views/UserView.vue', cleanCode);
    expect(auditor.collectedViolations.length).toBe(0);

    const result = await auditor.finishAudit();
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});
```

---

## 11. Tutorial: Reportes, Métricas e Inspección de Hallazgos

### 11.1. Salida en Terminal (UnifiedTheme Box-Drawing)

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

### 11.2. Reporte JSON Estructurado

Cada ejecución genera `scratch/audits/latest_audit.json`:

- Metadatos de ejecución (tiempo total, fecha, plataforma, métricas).
- Desglose por sub-auditor y por familia.
- Array de hallazgos tipados con archivo, línea, columna, regla, mensaje y contexto del snippet afectado.

---

## 12. Guía de Migración (desde `@fgp/auditor` o `packages/auditor`)

Si tu proyecto utiliza una versión previa local (`packages/auditor`) o el paquete desactualizado `@fgp/auditor`:

1. **Actualiza `package.json`**:
   - Elimina `packages/auditor` de los `workspaces` (si correspondía).
   - Reemplaza `@fgp/auditor` por `@francogp/auditor` en `devDependencies`:

     ```json
     {
       "devDependencies": {
         "@francogp/auditor": "github:francogp/auditor#main"
       }
     }
     ```

   - Elimina de tus `devDependencies` locales: `fallow`, `html-validate`, `html-validate-vue`, `typescript`, `markdownlint-cli`, `css-checker-kit`, `rollup-plugin-visualizer`.
2. **Actualiza los scripts de auditoría**:
   Usa los comandos binarios directos (`auditor`, `auditor-commit`, `auditor-bundle`, `auditor-findings`, `auditor-fallow`, `auditor-complexity`).
3. **Actualiza imports en `audit.config.ts`**:

   ```typescript
   // Antes:
   import { defineAuditConfig } from './packages/auditor/src/core/auditConfig.ts';
   // Ahora:
   import { defineAuditConfig } from '@francogp/auditor';
   ```

4. **Actualiza imports en tus sub-auditores de extensión**:

   ```typescript
   // Antes:
   import { BaseAuditor, FileScanAuditor } from '@fgp/auditor';
   // Ahora:
   import { BaseAuditor, FileScanAuditor } from '@francogp/auditor';
   ```

5. **Inicializa las 43 skills de IA**:

   ```bash
   npx auditor-init-agent
   ```

6. **Cumple el Mandato de Configuración Explícita Obligatoria**:
   Asegúrate de que tu `audit.config.ts` declare explícitamente todos los subsistemas (`persistence`, `bundle`, `styles`, `templates`, `agentPlugin`), ya sea configurándolos con sus valores o desactivándolos con `enabled: false` o `engine: 'none'`. La auditoría fallará de inmediato si falta algún subsistema.

### 12.1 Blueprints de Configuración y Extensión de Setup para Proyectos Anfitriones

Para facilitar la migración de proyectos reales a `@francogp/auditor`, el directorio de referencias de la skill [`skills/auditor/references/`](./.agents/skills/auditor/references/) contiene la documentación y los archivos de configuración completos y validados:

- 📖 **Guía de Blueprints**: [`references/blueprints.md`](./.agents/skills/auditor/references/blueprints.md) — Explicación de invariantes, subsistemas obligatorios y extensiones.
- 🛠️ **Guía de Extensión de Setup**: [`references/setup-extension-guide.md`](./.agents/skills/auditor/references/setup-extension-guide.md) — Arquitectura de plugins en Linux/macOS y Windows (`scripts/setup/plugins/`) y gancho `env:post-setup`.
- ⚡ **Arquitectura Empresarial**: [`references/audit.config.enterprise.example.ts`](./.agents/skills/auditor/references/audit.config.enterprise.example.ts) — Blueprint con backend Supabase, tipado estricto de dominio y sub-auditores de extensión.
- 🎮 **Arquitectura Interactiva / Gaming**: [`references/audit.config.gaming.example.ts`](./.agents/skills/auditor/references/audit.config.gaming.example.ts) — Blueprint con persistencia híbrida (SQLite + Supabase), Web Workers exentos de bundle budget, familias personalizadas y sub-auditores de extensión.

---

## 13. Referencia Completa de Comandos CLI

| Comando Binario | Script Asociado | Propósito |
| :--- | :--- | :--- |
| `npx auditor` | `src/cli/audit_full.ts` | Ejecuta la suite completa de auditorías del proyecto. Soporta flags `--family`, `--suite` y `fix`. |
| `npx auditor-commit` | `src/cli/audit_for_commit.ts` | Gatekeeper para pre-commit. Exige 0 errores y bloquea advertencias nuevas comparando con `origin/main`. |
| `npx auditor-bundle` | `src/cli/audit_bundle.ts` | Auditoría de tamaños de chunks generados en `dist/assets/`, respetando límites y exenciones de workers. |
| `npx auditor-findings` | `src/cli/report_findings.ts` | Reporte interactivo y filtrado de hallazgos por severidad (`severity=error`, `severity=warning`) o suite. |
| `npx auditor-fallow` | `src/cli/report_fallow.ts` | Reporte de Fallow: duplicaciones (`category=dupes`), circulares (`category=circular`), exports (`category=exports`), seguridad CWE (`category=security`). |
| `npx auditor-complexity` | `src/cli/report_complexity.ts` | Reporte de complejidad ciclomática, complejidad cognitiva y funciones largas (>60 LOC). |
| `npx auditor-init-agent` | `src/cli/init_agent.ts` | Registra `@francogp/auditor` en `.agents/plugins.json` del proyecto para activar las 43 skills de Antigravity. |
| `npx auditor-sync-env` | `src/cli/sync_env_scripts.ts` | Copia `setup-linux.sh`, `setup-windows.ps1` e inicializa `scripts/setup/plugins/` en el proyecto host. |
| `npx auditor-check-env` | `src/cli/check_environment.ts` | Valida que las versiones de Node.js y npm del host cumplan el piso requerido por el auditor (usado en `preinstall`). |
| `npx auditor-setup-env` | `src/cli/setup_env.ts` | Detecta la plataforma y ejecuta el script de setup correspondiente (`setup-linux.sh` o `setup-windows.ps1`). |

---

## 14. Licencia

**MIT License** © 2026 Franco Gastón Pellegrini ([`@francogp`](https://github.com/francogp)).  
Consulta el archivo [`LICENSE`](LICENSE) para más detalles.
