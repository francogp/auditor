---
name: auditor-framework
description: MANDATORY governance and architectural engine for creating, refactoring, maintaining, and administering ALL static analysis tools, sub-auditors, AST rules, and CLI reporting scripts across the repository. YOU MUST ALWAYS TRIGGER THIS SKILL whenever the user mentions auditors, audit suites, audit reports, audit tables, Fallow analyzers, report formatting, or modifies ANY file in `scripts/auditors/`, `@francogp/auditor`, `audit.config.ts`, `src/core/auditorBase.ts`, or `src/core/unifiedTheme.ts`, even if they just mention 'auditor', 'auditores', 'auditoría', 'audit', 'fallow', 'reporte', 'tabla', 'resultados en la tabla', 'superclase', 'BaseAuditor', 'report_fallow', 'report_complexity', 'report_audit_findings', or audit scripts ('npm run audit', 'npm run audit:fallow:*', 'npm run audit:lint'). Enforces strict OOP inheritance (BaseAuditor, FileScanAuditor), standardized Box-Drawing table rendering via unifiedTheme (80-col limit, zero wrapping, getVisualWidth emoji alignment), dynamic auto-discovery, zero code duplication, zero project hardcoding in @francogp/auditor, and zero ad-hoc console loggers.
---

# Auditor Framework: Governance, Architecture & Maintenance

This skill defines the immutable standard and architectural contract for creating, administering, refactoring, and maintaining all sub-auditors, reporting scripts, and the `@francogp/auditor` engine across the repository.

Every sub-auditor and reporter is part of a unified static analysis and verification system orchestrated by `npm run audit`.

---

## 🏛️ Core Principles & Tooling Mandates

1. **Strict OOP Inheritance Mandate**:
   - Every sub-auditor MUST extend either `BaseAuditor<TRuleId>` or `FileScanAuditor<TRuleId>` from `@francogp/auditor`.
   - Creating standalone procedural scripts, custom CLI loggers, or ad-hoc result printers is **STRICTLY FORBIDDEN**.
2. **Unified Box-Drawing Table & Terminal Width Mandate (Max 80 Cols, Zero Wrapping)**:
   - ALL terminal tables, whether rendered by sub-auditors (`BaseAuditor`), orchestrators (`audit_full.ts`), or interactive reporters (`report_fallow.ts`, `report_complexity.ts`, `report_findings.ts`), MUST use the shared Box-Drawing utilities from `@francogp/auditor` (`renderBanner`, `renderBoxTable`, `formatStatusBadge`, `getVisualWidth`).
   - Hardcoding custom ASCII banners (`╔════...` exceeding 80 columns) or ad-hoc bulleted lists (`•`) is **STRICTLY FORBIDDEN**.
   - Tables must fit within the standard 80-column terminal width (`TERMINAL_WIDTH = 80`) and use `getVisualWidth()` for padding so emojis (`✅`, `❌`, `⚠️`) do NOT throw column borders out of alignment.
   - **Consolidated Total Row Requirement**: Every multi-row summary or breakdown table displaying numeric findings across categories or rules MUST include a dedicated `footerRows` entry labeled `TOTAL CONSOLIDADO` separated by a standard divider (`├───┼───┤`), providing explicit, mathematically transparent sums for all error and warning columns.
3. **Dynamic Auto-Discovery & Extension Mandate (Zero Hardcoded Lists)**:
   - The master orchestrator (`npm run audit`) and safe-commit diff gatekeeper (`npm run audit:for-commit`) discover all generic suites dynamically via `@francogp/auditor` and host-specific extensions registered in `audit.config.ts`.
   - **Never hardcode an array of auditors or task IDs**. Any generic suite placed in `src/suites/<family>/` or host extension registered in `audit.config.ts` is automatically discovered, categorized, timed, and executed.
4. **Strict Agnostic Engine & Zero Project Hardcoding Mandate**:
   - The `@francogp/auditor` core package MUST remain 100% project-agnostic.
   - It is **STRICTLY FORBIDDEN** to hardcode host-specific directory names (e.g. `external`, `backup_legacy_code`, `third_party`), host domain entity identifiers (e.g. `userId`, `invoiceId`, `tariffId`, `formulaId`), or project-specific test subpaths (`fuzzer`, `simulation`) inside `@francogp/auditor`.
   - All host-specific directories, ignore patterns, entity prefixes, and custom test roots MUST be declared in `audit.config.ts`:
     - `paths.ignoredDirs`: Host-specific third-party or backup folders to skip globally.
     - `paths.ignoredPatterns`: Specific file paths or patterns (e.g. giant SQL migrations or generated data) to skip from standard code scans.
     - `paths.ignoreGlobs`: Glob patterns to exclude.
     - `paths.testFragmentationWhitelist`: Large test files or suites exempt from max test file size limit.
     - `paths.cliRoots`: CLI and tool root directories permitted to emit console output without logging wrappers.
     - `templates.safeTemplateFunctions`: Project-specific functions safe to invoke inside Vue templates.
     - `styles.baseScssFile`: Base SCSS file for global resets and overscroll locks.
     - `bundle.forbiddenUiImports`: Heavy backend modules or drivers barred from UI layers.
     - `animation.customTimerFunctions`: Additional timer function names recognized in UI animations.
     - `constants.ignoredNames`: Constant identifier names ignored during duplicate detection.
     - `constants.exemptMagicNumbers`: Numeric literals exempt from magic numbers validation.
     - `documentation.knownValidAbstractPaths`: Abstract docs paths recognized as valid.
     - `pinia.authorizedMutationFiles`: Files authorized for direct pinia state mutations outside store actions.
     - `domain.fallbackIdPatterns`: Domain-specific catalog ID patterns to disallow fallbacks on.
     - `persistence.allowedDatabaseFiles`: Database generator and schema files exempt from domain type checks.
     - `domain.infraIdWhitelist`: Host-specific infrastructure or external entity IDs (e.g. `cardId`, `slotId`, `assetId`, `serverId`) exempt from domain union rules.
     - `isTestPath(filePath)`: Dynamically checks `testRoots`, `e2eRoots`, and `integrationRoots` from configuration.
     - `isCliPath(filePath)`: Dynamically checks `cliRoots` from configuration.
5. **Mandatory GSAP UI Animation Governance & `gsapSleep` Standard**:
   - GSAP animation enforcement rules (`manualAnimations`, `manualTimersFrontend`, `noLayoutAnimationInGsap`) are strictly mandatory and non-downgradable (`severity: 'error'`).
   - `manualTimersFrontend` scopes timer checks strictly to UI components and views (`.vue` or within `componentsRoots`/`viewsRoots`), barring uncoordinated timers (`setTimeout`, `setInterval`) in UI workflows.
   - `gsapSleep` and `delayedCall` are established, universal framework standards for UI delays and animation timing across all projects, ensuring deterministic test acceleration (scaling with `gsap.globalTimeline.timeScale(100)` during Playwright runs).
   - Additional custom timer functions can be registered dynamically via `config.animation.customTimerFunctions`.
6. **Config-Driven Path Ignored Engine (`isPathIgnored`)**:
   - `isPathIgnored(relPath)` in `auditorBase.ts` unifies `CANONICAL_IGNORE_DIRS` + `config.paths.ignoredDirs` + `config.paths.ignoredPatterns` + `config.paths.ignoreGlobs`.
   - Supports bidirectional leaf and path matching, ensuring both full relative paths and base directory scans in `fs.glob` respect configured ignores.
   - Any sub-auditor discovering or filtering files (`getFilesToAudit`, `FileScanAuditor`, `BaseAuditor`) MUST use `isPathIgnored(p)`.
7. **Concurrent Execution & Completion-Ordered Output Model**:
   - `npm run audit` executes suites concurrently across a pool of background workers (sized to CPU parallelism).
   - Console progress lines (`[ 01/54 | 2% ]`) stream in the order that suites **FINISH** (`coordinator.onTaskComplete`), NOT in the order of task discovery.
   - Heavy suites that take longer (such as full-codebase regex or Fallow intelligence) will complete and log towards the end of the run (e.g. `[ 54/54 | 100% ]`).
8. **Shared AST Engine & Zero Duplicate Parse Mandate (`SharedAstContext`)**:
   - Whenever a sub-auditor performs TypeScript AST analysis or inspects Vue SFC `<script>` blocks, it MUST declare `requiresAst: true` in its constructor configuration (`BaseAuditor` or `FileScanAuditor`).
   - Sub-auditors MUST NEVER instantiate isolated AST parsers or call `ts.createProgram` / `ts.createSourceFile` inside ad-hoc file loops.
   - Sub-auditors consume the centralized `astContext: SharedAstContext` passed to `runAudit(astContext?: SharedAstContext)` or receive the pre-compiled `sourceFile?: ts.SourceFile` directly in `FileScanAuditor.scanFile(relPath, content, sourceFile)`.
   - The master orchestrator (`audit_full.ts`) initializes and preheats `SharedAstContext` **before any tasks run**, providing lazy AST parsing on demand.
9. **Prohibition of Ad-Hoc File Walkers**:
   - Sub-auditors MUST NEVER implement custom recursive directory traversals (`fs.readdir` loops, `getAllFiles`, `getAllVueFiles`, `getFilesRecursively`, `walkSourceFiles`, `walkFiles`, `walkDir`, `collectMarkdownFiles`).
   - File discovery MUST use the centralized, cached, and ignore-aware scanner: `this.context.collectFiles(roots, extensions)` or `collectRepositoryFiles()`.
10. **Unified Dual Output Standard (`StandardAuditResult`)**:
    - **Console (stdout)**: Emits formatted progress lines (`🔍 [X/N]`) followed by clean visual Box-Drawing tables (`[ ✅ PASS ]`, `[ ❌ FAIL ]`, `[ ⚠️ WARN ]`), runtimes in ms, and domain metrics via `@francogp/auditor`.
    - **Scratch Disk (`scratch/audits/`)**: ALWAYS saves 100% complete structured JSON conforming to `StandardAuditResult` to `scratch/audits/<family>/<id>.json` (and `scratch/audits/latest_audit.json` for global runs).
11. **Zero Double-Reporting Anti-Pattern**:
    - NEVER pass string arrays (`errors`, `warnings`) to `context.finish(...)` if violations were already registered with `this.addViolation(...)` or `context.addError()`. Doing so causes duplicate violation listings in the terminal summary table.
12. **Zero Runtime Data Auto-Heal in Tooling**:
    - Auditors verify structural and data integrity. They must never silently patch, mock, or auto-heal corrupt data or invalid structures. Failures must be detected loudly with clear, actionable context.
13. **Mandatory Modular Identity & Human-Friendly Description Mandate (Package + Pure Message, Max 50 chars)**:
    - Every sub-auditor MUST declare via inheritance:
      - `id: string`: Unique canonical auditor ID (e.g. `validate_my_feature`).
      - `name: string`: Formal suite name (e.g. `My Feature Validator`).
      - `packageName?: string`: The scope or technology package of the sub-auditor (e.g. `'ESLint'`, `'TypeScript'`, `'Markdownlint'`, `'Combate'`, `'Estilos'`, `'DOX'`, `'FSM'`).
      - `description: string`: Human-friendly Spanish explanation (strictly max 60 characters, single line, no `\n`) of what the suite verifies (`MAX_AUDITOR_SUITE_DESCRIPTION_LENGTH = 60`).
      - `ruleDescriptions: Record<TRuleId, string>`: PURE human-friendly Spanish explanation for each rule ID. NEVER hardcode the package prefix inside rule descriptions (e.g. use `'Error de sintaxis o regla'`, NEVER `'ESLint: Error de sintaxis o regla'`).
    - **Dynamic Composition & 50-Character Box-Drawing Constraint**:
      - `BaseAuditor.formatRuleDescription(ruleId, rawDescription)` dynamically joins both parts as `${packageName}: ${ruleDescription}`.
      - The composed description `${packageName}: ${ruleDescription}` MUST be `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) so that in 80-column terminal tables (column width 52), every row displays cleanly without any `...` truncation.
    - Raw unexplained slugs without human context in console output are strictly forbidden.
14. **Absolute Prohibition of Homebrew SLOC Counters Mandate**:
    - Sub-auditors must NEVER implement manual line-counting loops, regex line filters, or ad-hoc SLOC checkers (`checkSloc`, line counting loops).
    - Fallow is the Single Source of Truth (SSoT) for all AST metrics, cognitive and cyclomatic complexity, function unit size, maintainability, dead code, and duplication detection across the codebase.
15. **Human-Friendly Descriptions & Category Breakdown Mandate (Zero Code Slugs & Zero Family Grouping)**:
    - The master audit orchestrator (`npm run audit`) and warnings reporter (`npm run audit:warnings`) MUST render results desglosados strictly by category/rule in an official Box-Drawing table.
    - The table MUST display **100% human-friendly Spanish descriptions** (`finding.ruleDescription` or `suite.description`) defined via inheritance in `BaseAuditor` (`ruleDescriptions: Record<TRuleId, string>`). Displaying raw code slugs, identifiers, or technical keys (e.g. displaying `icon-missing-asset` instead of `'Ícono no encontrado en catálogo de assets'`) is **STRICTLY FORBIDDEN**.
    - Following the table, they MUST output ONLY an illustrative sample of the last 5 errors (`❌ Muestra de errores detectados (últimos 5 de N)`).
    - Listing the full set of warnings or dumping all errors in console output is **STRICTLY FORBIDDEN**.
    - Grouping console results under opaque "FAMILIAS" headers is permanently eradicated. Full machine-readable findings reside in `scratch/audits/latest_audit.json`.
16. **Single Source of Truth Directory Ignore Mandate (`CANONICAL_IGNORE_DIRS` + `getEffectiveIgnoreDirs`)**:
    - Sub-auditors and maintenance scripts MUST NEVER declare local ignore sets (`const IGNORE_DIRS`, `const SKIP_DIRS`, `const SKIP_NAMES`, `const SKIP_SUBDIRECTORIES`).
    - Directory ignores are strictly governed by `CANONICAL_IGNORE_DIRS` in `@francogp/auditor`, combined with `getEffectiveIgnoreDirs()` which dynamically includes `config.paths.ignoredDirs`.
    - Documentation auditors that need to inspect documentation trees must configure `unignoreDirs: ['docs', '.agents']` instead of maintaining custom walkers.
    - Sub-auditors supporting unit-test sandboxes (`tempDir`) must forward `projectRoot: effectiveRoot` via `AuditorOptions` into `super({...})` to guarantee isolation from the live project repository.
17. **Mandatory Audit Metadata & Anti-Staleness Header Mandate (`AuditRunMetadata`)**:
    - The master orchestrator (`src/cli/audit_full.ts`) MUST embed an explicit `meta: AuditRunMetadata` header into `scratch/audits/latest_audit.json` and `scratch/audits/latest_summary.json` containing: `isFullAudit`, `runMode`, `preset`, `timestamp`, `totalDiscoveredSuites`, `executedSuiteCount`, `executedSuites`, and `omittedSuites`.
    - Partial audit runs (such as `npm run audit:md`, `preset=lint`, or single suite executions) update `scratch/audits/latest_audit.json` with `isFullAudit: false` and populate `omittedSuites`.
    - **Strict 5-Minute Staleness Policy (`MAX_AUDIT_STALENESS_MS = 5 * 60 * 1000`)**: If more than 5 minutes have elapsed since `meta.timestamp`, the audit file is considered OBSOLETE. Any tool, script, or AI agent reading `latest_audit.json` MUST reject it with Exit Code 1, forcing a fresh run (`npm run audit`) to prevent decisions based on stale code data.
    - **Zero Tolerated Misleading Reports**: Downstream scripts consuming audit results (`report_complexity.ts`, `report_fallow.ts`, `report_findings.ts`) MUST validate this metadata. If a required suite was omitted, if the report is older than 5 minutes, or if a global report is requested on a partial run, the script MUST fail fast with Exit Code 1 (`assertAuditorExecuted(...)`).
18. **Fallow 100% Error Severity & Zero-Warning Mandate**:
    - Sub-auditors, architecture runners, and plugins integrating Fallow (such as `audit_project.ts` or standalone Fallow inspectors) MUST map ALL Fallow findings to `severity: 'error'`.
    - Downgrading any Fallow finding to `severity: 'warning'` to mask technical debt or bypass audit gates is **STRICTLY PROHIBITED**.
19. **Static Security Single Source of Truth (Fallow CWE vs ESLint Syntax)**:
    - Codebase vulnerability analysis (CWE) is strictly and exclusively delegated to **Fallow** (`fallow security`).
    - Using `eslint-plugin-security` in ESLint configurations is **STRICTLY PROHIBITED**. ESLint must focus exclusively on ECMAScript/TypeScript syntax correctness, style, and Vue SFC integrity. Sub-auditors analyzing AST or traversing files are legitimate development operations and must never be encumbered by blunt regex-based linter false positives.
20. **Standard Living Specification Engines Over Handcrafted Regex Mandate**:
    - When validating web standards, markup hygiene, accessibility, or obsolete HTML5 elements/attributes, the auditor framework and linters MUST NOT implement handcrafted manual regular expressions or arbitrary AST pattern lists (e.g. in ESLint).
    - Sub-auditors MUST delegate to authoritative, actively maintained specification engines (`html-validate` with `html-validate-vue`) that embody the W3C / WHATWG Living Standard, bridging their output into canonical `AuditFinding[]` objects.
21. **Child Process Stream Isolation & Ephemeral Scratch Output Mandate**:
    - Sub-auditors invoking external CLI tools or linters (`html-validate`, `vue-tsc`, `fallow`) via child processes (`spawnSync`) MUST NEVER rely on piping large JSON payloads across standard output (`stdout`), as Node.js process exits can truncate unbuffered output streams.
    - Tools supporting direct file output MUST write raw JSON to an isolated ephemeral file in `scratch/audits/<family>/` (e.g. `-f json=scratch/audits/architecture/html-validate-raw.json`) and parse it cleanly from disk.

---

## 📂 Canonical Architecture: Built-in Suites & Host Extensions

### 1. Generic Built-In Suites (`src/suites/`)
36 domain-agnostic suites discovered automatically across 4 canonical families:
- `architecture/` (28 suites + shared rule module `audit_rules.ts`): AST rules, Fallow intelligence, Z-Index, CSS orphans, emoji typography, HTML5 standards validation (`validate_html_validate`), Vue SFC hygiene, Pinia reactivity, reactive leaks and purity
- `domain_data/` (2 suites): O(1) data structures, Domain-type-first validation (`validate_domain_types.ts`, parameterized via `audit.config.ts`)
- `persistence/` (1 suite): SQL anti-patterns (`validate_sql_anti_patterns.ts`, with hybrid persistence support)
- `documentation/` (5 suites): Markdown relative links, DOX hierarchy (AGENTS.md), syntax standards, markdown lint, code references

### 2. Host Project Extensions (`scripts/auditors/`) & `audit.config.ts`
All domain-specific rules unique to host applications (e.g. specialized domain entities, state machines, business workflows, custom SQLite schemas) reside in `scripts/auditors/` (or designated project folders) and extend `BaseAuditor` imported from `@francogp/auditor`.

Configured at root in `audit.config.ts`:
- `paths.migrationsDir`: `'database/migrations'`
- `paths.testFilePatterns`: `['.spec.', '.test.', '.simulation.']` (Dynamic test file recognition)
- `paths.testFragmentationWhitelist`: `['src/large-feature.ts']` (Files exempt from test fragmentation limits)
- `paths.e2eRoots`: `['tests/e2e']`
- `paths.ignoredDirs`: `['external', 'backup_legacy_code', 'fixtures']`
- `paths.ignoredPatterns`: `['src/generated/migrations_data.ts']`
- `persistence.engine`: `'hybrid' | 'supabase' | 'sqlite' | 'postgres' | 'none'`
- `persistence.prohibitedTemplateIdentifiers`: `['supabase', 'db', 'sqlite']` (Identifiers barred from Vue `<template>`)
- `persistence.authorizedSaveFiles`: `['src/logic/utils/saveCoordinator.ts']` (Files authorized for save keys)
- `persistence.allowedHosts`: `['supabase.co', 'localhost', '127.0.0.1']` (SSRF allowlist for `safeFetch`)
- `styles.zLayers`: Direct numeric scale `{ BASE: 0, MODAL: 11000, ... }`
- `styles.zLayersTsFile`: `'src/logic/constants/visuals.ts'` (TypeScript Z_LAYERS definition)
- `styles.zLayersScssFile`: `'src/styles/_base.scss'` (SCSS variables mapping)
- `styles.baseScssFile`: `'src/styles/_base.scss'` (Base SCSS file for global resets and overscroll locks)
- `styles.lineHeightOverlapCheck`: `boolean` (Anti-zero line-height verification)
- `bundle.exemptChunkPrefixes`: `['worker-vendor-pkmn', 'worker-game-data']` (Exempt client chunks)
- `bundle.forbiddenUiImports`: `[{ module: 'xlsx', reason: 'Parser pesado' }]` (Heavy modules barred in UI)
- `templates.safeTemplateFunctions`: `['formatMoney', 'translate']` (Functions safe in templates)
- `templates.forbiddenTemplateCallPatterns`: Heavy classes/helpers barred from template calls
- `animation.customTimerFunctions`: `['requestDelayedFrame']` (Custom timer functions recognized in UI)
- `constants.ignoredNames`: `['TAX_DEFAULT_ROUNDING']` (Constants ignored in duplicate detection)
- `constants.exemptMagicNumbers`: `[21, 10.5, 27]` (Numeric literals exempt from magic numbers check)
- `documentation.knownValidAbstractPaths`: `['@docs/architecture/fiscal-engine.md']` (Abstract valid docs paths)
- `pinia.authorizedMutationFiles`: `['src/logic/coordinators/sessionCoordinator.ts']` (Authorized store mutation files)
- `domain.caseNormalizationExemptTokens`: `['rpg', 'pvp', 'cuit', 'dni', ...]` (Tokens exempt from lowercasing)
- `domain.allowedStoreSetterPrefixes`: `['set', 'update', 'equip', 'assign']` (Pinia store action prefixes)
- `domain.allowedNumericConstantPrefixes`: `['GEN_', 'ISO_', 'UTF_8', 'RGB_', ...]` (Constant naming exceptions)
- `domain.finiteDomainTypes`: `['UserId', 'InvoiceId', 'RoleId', 'CustomerId', ...]`
- `domain.fallbackIdPatterns`: `['userId', 'invoiceId', 'roleId', 'customerId', ...]`
- `extensions`: [Host project custom plugins in `scripts/auditors/`]

### File Naming Conventions:
- **Generic Suite**: `src/suites/<family>/validate_<topic>.ts`
- **Host Extension**: `scripts/auditors/<family>/validate_<topic>.ts` (registered in `audit.config.ts`).
- **Private Helper**: `_<helper_name>.ts` (ignored by discovery).
- **Interactive Developer Reporter**: `src/cli/report_<topic>.ts` (e.g. `report_fallow.ts`, `report_complexity.ts`).

---

## 🛠️ Step-by-Step Guide: How to Create a New Sub-Auditor

### 📦 Bundled Boilerplate Templates (`assets/templates/`)
Pre-formatted, production-ready templates conforming to all project standards are bundled directly within this skill for instant scaffolding:
- **Line-by-Line Scanner**: [`assets/templates/file_scan_auditor_template.ts`](./assets/templates/file_scan_auditor_template.ts)
- **Composite / Database / Asset Auditor**: [`assets/templates/base_auditor_template.ts`](./assets/templates/base_auditor_template.ts)
- **AST-Driven Auditor**: [`assets/templates/ast_auditor_template.ts`](./assets/templates/ast_auditor_template.ts)
- **Dedicated Vitest Unit Test**: [`assets/templates/auditor_unit_test_template.test.ts`](./assets/templates/auditor_unit_test_template.test.ts)

### Option A: File-Scanning Auditor (`FileScanAuditor`)
Use `FileScanAuditor` when the audit inspects files line-by-line across specific directories (e.g. searching for regex patterns, forbidden tokens, or syntax rules).

```typescript
/**
 * scripts/auditors/architecture/validate_my_feature.ts
 *
 * MY FEATURE AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-token'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-token',
  'my-feature-missing-attribute'
];

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  constructor(roots: readonly string[] = ['src']) {
    super({
      id: 'validate_my_feature',
      name: 'My Feature Validator',
      description: 'Valida tokens prohibidos y atributos de la característica X',
      family: 'architecture',
      ruleIds: MY_FEATURE_RULES,
      ruleDescriptions: {
        'my-feature-forbidden-token': 'Token prohibido detectado en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante en componente'
      },
      roots,
      allowedExtensions: new Set(['.vue', '.ts'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Check escape hatches: // domain-ok, // my-feature-ok
      if (this.isLineIgnored(line, ['my-feature-ok'])) continue;

      if (line.includes('bannedToken')) {
        this.addViolation({
          ruleId: 'my-feature-forbidden-token',
          severity: 'error',
          file: relPath,
          line: lineNum,
          message: `Forbidden token 'bannedToken' detected. Use canonical helper instead.`,
          context: line.trim()
        });
      }
    }
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MyFeatureAuditor());
}
```

### Option B: Composite / Data Auditor (`BaseAuditor`)
Use `BaseAuditor` when the audit performs multi-source comparisons, AST graphs, database schema validations, or dataset integrity checks.

```typescript
/**
 * scripts/auditors/domain_data/validate_my_data.ts
 *
 * MY DATA INTEGRITY AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '@francogp/auditor';
import { MY_DATA } from '../../../src/data/myData.ts';

enableCompileCache();

export type MyDataRuleId = 'my-data-key-missing' | 'my-data-value-invalid';

export const MY_DATA_RULES: readonly MyDataRuleId[] = [
  'my-data-key-missing',
  'my-data-value-invalid'
];

export class MyDataAuditor extends BaseAuditor<MyDataRuleId> {
  constructor() {
    super({
      id: 'validate_my_data',
      name: 'My Data Validator',
      description: 'Valida integridad y campos obligatorios en base de datos',
      family: 'domain_data',
      ruleIds: MY_DATA_RULES,
      ruleDescriptions: {
        'my-data-key-missing': 'Clave requerida faltante en registro de datos',
        'my-data-value-invalid': 'Valor no válido en propiedad requerida'
      },
      requiredFiles: [
        path.resolve(process.cwd(), 'src/data/myData.ts')
      ]
    });
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Validating my data keys...');
    for (const [key, value] of Object.entries(MY_DATA)) {
      this.filesScannedCount++;
      if (!value.requiredField) {
        this.addViolation({
          ruleId: 'my-data-key-missing',
          severity: 'error',
          file: 'src/data/myData.ts',
          line: 1,
          message: `Entry '${key}' is missing 'requiredField'.`,
          context: key
        });
      }
    }

    this.context.setMetric('Total Entries Checked', Object.keys(MY_DATA).length);
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MyDataAuditor());
}
```

### Option C: AST-Driven Sub-Auditor (`requiresAst: true` & `SharedAstContext`)
Use `BaseAuditor` with `requiresAst: true` (or `FileScanAuditor` with `sourceFile`) when the audit inspects TypeScript syntax trees, imports, exports, decorators, types, or Vue SFC script blocks across codebase files.

```typescript
/**
 * scripts/auditors/architecture/validate_my_ast_rule.ts
 *
 * AST-DRIVEN AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, SharedAstContext } from '@francogp/auditor';

enableCompileCache();

export type MyAstRuleId = 'my-ast-forbidden-call';

export const MY_AST_RULES: readonly MyAstRuleId[] = [
  'my-ast-forbidden-call'
] as const;

export class MyAstAuditor extends BaseAuditor<MyAstRuleId> {
  constructor() {
    super({
      id: 'validate_my_ast_rule',
      name: 'My AST Rule Validator',
      description: 'Valida llamadas prohibidas en el AST de TypeScript',
      family: 'architecture',
      ruleIds: MY_AST_RULES,
      ruleDescriptions: {
        'my-ast-forbidden-call': 'Llamada prohibida detectada en el árbol sintáctico'
      },
      requiresAst: true,
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    this.context.logStep(1, 1, 'Analizando AST con contexto compartido...');

    const astEngine = astContext ?? new SharedAstContext();
    const relFiles = await this.context.collectFiles(['src'], new Set(['.ts', '.vue']));

    for (const relFile of relFiles) {
      this.filesScannedCount++;
      const absPath = path.resolve(this.projectRoot, relFile);
      const sourceFile = astEngine.getSourceFile(absPath);

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isCallExpression(node)) {
          // Inspect AST node properties...
        }
      });
    }

    this.context.setMetric('Files Scanned with AST', this.filesScannedCount);
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MyAstAuditor());
}
```

---

## ⚡ Integrating with `package.json`

Host extensions declared in `audit.config.ts` are automatically loaded by the audit engine. For quick in-development execution, they can be invoked via `npm run audit -- --rule=validate_<topic>` or registered in `package.json`.

Because `@francogp/auditor` auto-discovers all built-in suites in `src/suites/` and loads extensions from `audit.config.ts`, **no manual registration in runner files is needed**. Running `npm run audit` will automatically discover and execute all suites.

---

## 🛡️ Testing & Conformance Verification (Zero Untested Rules & Warnings Mandate)

Every sub-auditor (generic suites in `src/suites/` and host extension plugins in `scripts/auditors/`) MUST adhere strictly to the **Zero Untested Rules & Warnings Mandate**:

1. **Dedicated Exhaustive Unit Test File**:
   - Generic suites: `tests/<suite_filename>.test.ts`
   - Host extension plugins: `tests/node/auditors/<suite_filename>.test.ts`
2. **100% RuleId Coverage (Every Error and Every Warning)**:
   - For **every single declared `ruleId`** in `ruleIds` (and every Fallow category/metric mapped by the auditor), there MUST be at least one dedicated test case with a dirty fixture triggering that exact rule.
   - The test MUST explicitly assert:
     - `expect(finding.ruleId).toBe('<exact-rule-id>')`
     - `expect(finding.severity).toBe('<error|warning>')`
     - The violation is captured in `result.findings` with appropriate file, line, and context.
3. **Clean Workspace / Negative Verification (Mandatory Error Severity)**:
   - Every test suite (both core suites in `tests/` and host extension plugins in `tests/node/auditors/`) MUST include a test asserting that valid, compliant code produces **zero errors and passed status** (`expect(result.summary.errors).toBe(0)`, `expect(result.status).toBe('passed')`).
   - The rule `missing-clean-auditor-test` is classified strictly as `severity: 'error'`. Omission of clean path verification fails the audit build.
4. **Hermetic Test Isolation via `finishAudit()` or Sandbox Directories**:
   - Sub-auditor unit tests MUST NEVER execute full workspace scans (`auditor.execute()`) directly on `process.cwd()` without isolation.
   - When unit testing individual file-scanning logic, tests MUST pass synthetic code to `testScanFile(...)` and invoke `await auditor.finishAudit()`.
   - When testing full filesystem traversals, tests MUST instantiate the auditor with a temporary sandbox directory via `projectRoot` (`new MyAuditor({ projectRoot: tempDir })`). Scanning the live host repository in unit tests leaks application code defects into testing infrastructure.
5. **Escape Hatch & Suppression Verification**:
   - If the auditor supports suppression comments (e.g. `// <rule>-ok:`, `// domain-ok:`, `// script-ok:`) or configuration ignore patterns, the test suite MUST verify that valid suppressions prevent false positives and are not reported as violations.
6. **Continuous Meta-Conformance Enforcement**:
   - The meta-test `tests/auditor_architecture_conformance.test.ts` continuously checks that **100% of discovered suites have a dedicated unit test file**. No sub-auditor or plugin may be merged without its companion test suite.

---

## 🔍 Interactive Findings Reporter (`report_findings.ts`) & CLI Diagnostics

The findings reporter (`src/cli/report_findings.ts`) is the official SSoT diagnostic tool for querying, grouping, and inspecting audit results without running arbitrary terminal scripts or raw grep commands.

### Supported CLI Options & Flags

| Flag / Parameter | Description | Example Usage |
| :--- | :--- | :--- |
| `partial` | Allows inspecting partial runs (e.g. `npm run audit suites=audit_project`, `npm run audit:lint`) without failing the full-audit completeness check. Displays an informative partial-mode warning banner with executed suite count. | `npm run audit:findings partial dir=src/` |
| `breakdown` / `by-dir` / `dirs` | Renders a consolidated Box-Drawing table of findings grouped by directory/scope with `TOTAL CONSOLIDADO`. | `npm run audit:findings breakdown` |
| `dir=<path>` / `folder=<path>` | Filters findings by directory or file path substring across both category breakdown tables and finding samples. | `npm run audit:findings partial dir=src/` |
| `scope=<host\|packages\|all>` | Isolates application code (`host`) from reusable engine code (`packages`) in category tables and sample lists. | `npm run audit:findings scope=host` |
| `category=<name>` / `<name>` | Filters by rule or category name. | `npm run audit:findings category=seguridad` |
| `files` | Lists affected files sorted by error density with category banners and total sums. | `npm run audit:findings category=cwe files top=10` |
| `stale` / `allow-stale` | Bypasses the 5-minute freshness check for investigative read-only inspection. | `npm run audit:findings breakdown stale` |
| `severity=<error\|warning\|all>` | Filters findings by severity level (`error`, `warning`, `all`). | `npm run audit:findings severity=error` |
| `top=<N\|all>` | Limits displayed items (default: 20). | `npm run audit:findings top=all` |
| `search=<term>` | Searches within finding messages and context snippets. | `npm run audit:findings search=token` |
| `json` | Emits structured JSON including `breakdownByDir` and `files` maps. | `npm run audit:findings json` |

### Official NPM Reporter Scripts

All inspection routines MUST use the official NPM scripts declared in `package.json`:
- `npm run audit:findings`: Primary findings reporter with full filtering capabilities (`partial`, `dir=...`, `search=...`, `category=...`, `top=...`, `json`).
- `npm run audit:errors`: Preset filtering strictly to errors (`severity=error`).
- `npm run audit:warnings`: Preset filtering strictly to warnings (`severity=warning`).
- `npm run audit:summary`: Compact summary overview of latest audit results.

### Proactive Tool Evolution Mandate (Enhance the Official Toolkit over Makeshift Scripts)
If diagnostic needs or query patterns require analyzing audit data in ways not yet covered, agents and developers must avoid relying on disposable, makeshift terminal one-liners (`node -e`, raw grep chains). Instead, **proactively add the missing capabilities directly into the official native toolkit** (e.g. adding flags, directory breakdowns, or output formatters to `report_findings.ts`, `auditScanner.ts`, or official npm scripts in `package.json`), transforming ad-hoc needs into first-class, reusable tools for everyone.

---

## 🧠 Fallow Code Quality Governance & Content-Aware Complexity (Zero Arbitrary Line Limits)

Fallow is integrated into `@francogp/auditor` (`audit_project.ts` and `report_fallow.ts`) to evaluate **code structure, semantic content, and mental load** through AST parsing, NOT through arbitrary line limits:

1. **AST Content Analysis over Raw Line Counts**:
   - Arbitrary line limits (such as `≤ 60 LOC` per function or raw file line caps) are **STRICTLY FORBIDDEN**. Raw line counts penalize comments, JSDocs, Mermaid architecture diagrams, TypeScript domain interfaces, blank lines, and formatting.
   - Code quality is governed strictly by Fallow's native complexity metrics declared in `.fallowrc.json`:
     - `maxCognitive` (default: 20): Measures mental nesting and cognitive branching.
     - `maxCyclomatic` (default: 25): Measures independent execution control paths.
     - `maxCrap` (default: 500): Measures change risk anti-patterns against test coverage.
2. **Strict Demarcation of Telemetry vs Auditor Errors (`fallow health`)**:
   - In `fallow health`, Fallow outputs informational statistics (`large_functions`, `targets`, `hotspots`).
   - The auditor framework maps **ONLY `data.findings`** (true complexity threshold breaches) as blocking auditor errors (`severity: 'error'`).
   - Converting informational statistics (`large_functions` or `targets`) into fatal auditor errors is strictly prohibited; doing so forces unnatural micro-fragmentation of clear, declarative functions.
3. **Module Sizing Protocol**:
   - Modules and components should be decomposed when their **cognitive load** or responsibilities grow unwieldy (Single Responsibility Principle), not by counting lines.

---

## 📚 References & Host Integration Blueprints

The following reference manuals and configuration blueprints are maintained in `references/`:

- [`references/setup-extension-guide.md`](./references/setup-extension-guide.md): Architecture and plugin guides for extending `setup-linux.sh` and `setup-windows.ps1` in host projects.
- [`references/blueprints.md`](./references/blueprints.md): Overview of configuration blueprints and mandatory explicit subsystem configuration.
- [`references/audit.config.facturacion2.example.ts`](./references/audit.config.facturacion2.example.ts): Reference `audit.config.ts` for Facturación 2.0 (Supabase, fiscal domain types, strict rules).
- [`references/audit.config.pokevicio.example.ts`](./references/audit.config.pokevicio.example.ts): Reference `audit.config.ts` for Poké Vicio (hybrid persistence, Web Workers chunk exemptions, combat domain types, custom families, local extensions).
- [`references/extensions/validate_button_governance.extension.ts`](./references/extensions/validate_button_governance.extension.ts): Reference extension blueprint for button governance and anti-clipping (Facturación 2.0).
- [`references/extensions/validate_render_performance.extension.ts`](./references/extensions/validate_render_performance.extension.ts): Reference extension blueprint for GPU render hygiene and atmospheric overlays.
- [`references/plugins/`](./references/plugins/): Sample setup plugins for Docker database containers and local SSL certificates with `mkcert` (Bash & PowerShell).


