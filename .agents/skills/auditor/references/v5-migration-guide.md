# Upgrading Host Applications to `@francogp/auditor` v5+

## Executive Overview

`@francogp/auditor` v5+ establishes the next-generation, zero-tolerance architectural verification framework for TypeScript and Vue applications. The v5 engine introduces a fully modular configuration pipeline (`src/core/auditConfig*.ts`), capability-driven suite auto-coordination (`AuditorCapabilities`), built-in dedicated Fallow architecture governance (`validate_fallow`), vector semantic duplication accelerated on Candle CPU (`validate_similar_code`), strict English documentation language verification (`validate_documentation_language`), and terminal Box-Drawing reporting featuring mandatory consolidated totals (`TOTAL CONSOLIDADO`).

This guide provides a comprehensive migration blueprint for upgrading host projects from v4 (or earlier) to canonical v5+ standards.

---

## 1. Upstream Package Consumption

Host applications consume `@francogp/auditor` as a native npm GitHub dependency targeting the v5 line:

```json
{
  "dependencies": {
    "@francogp/auditor": "github:francogp/auditor"
  }
}
```

### Upgrading the Auditor

Always upgrade using the framework's native CLI utilities:

```bash
# Upgrade to latest commit on main
npm run auditor:update
# or directly:
auditor-update

# Verify active version and commit hash
npm run auditor:version
# or directly:
auditor-version -v
```

> [!IMPORTANT]
> **Prohibition of NPX and Third-Party Runners**:
> Executing `npx` (such as `npx tsx`, `npx auditor`, `npx vitest`) is strictly prohibited. All TypeScript files and auditor CLI tools MUST be executed directly with native Node.js 26+ (`node --experimental-strip-types <file.ts>`) or through canonical npm package scripts (`npm run <script>`, `npm test`).

---

## 2. Package Scripts Synchronization

Modernize the host application's `package.json` scripts using the canonical v5 template (`recommended_package_scripts_template.json`):

```json
{
  "scripts": {
    "audit": "auditor",
    "audit:changed": "auditor changed-since=main",
    "audit:fix": "auditor fix",
    "audit:lint": "auditor preset=lint",
    "audit:md": "auditor preset=md",
    "audit:build": "auditor preset=build",
    "audit:findings": "auditor-findings",
    "audit:errors": "auditor-findings severity=error",
    "audit:warnings": "auditor-findings severity=warning",
    "audit:summary": "auditor-findings",
    "audit:files": "auditor-findings files",
    "audit:by-file": "auditor-by-file",
    "audit:complexity": "auditor-complexity",
    "audit:similar": "auditor-similar",
    "audit:review": "auditor-review",
    "audit:flags": "auditor-flags",
    "audit:coverage-gaps": "auditor-fallow category=coverage-gaps",
    "audit:css": "auditor-css",
    "audit:bundle": "auditor-bundle",
    "audit:package-hygiene": "auditor task=validate_package_hygiene",
    "audit:type-coverage": "auditor task=validate_type_coverage",
    "audit:fallow": "auditor-fallow category=all",
    "audit:fallow:dupes": "auditor-fallow category=dupes",
    "audit:fallow:circular": "auditor-fallow category=circular",
    "audit:fallow:exports": "auditor-fallow category=exports",
    "audit:fallow:security": "auditor-fallow category=security",
    "audit:fallow:dead-code": "auditor-fallow category=dead-code",
    "audit:family:architecture": "auditor family=architecture",
    "audit:family:domain": "auditor family=domain_data",
    "audit:family:persistence": "auditor family=persistence",
    "audit:family:documentation": "auditor family=documentation",
    "lint": "npm run audit:lint",
    "lint:fix": "auditor preset=lint fix",
    "lint:md": "auditor preset=md",
    "auditor:update": "auditor-update",
    "auditor:version": "auditor-version",
    "init-agent": "auditor-init-agent"
  }
}
```

---

## 3. Configuration Modernization (`.auditor/audit.config.ts`)

Host applications configure the auditor strictly via `.auditor/audit.config.ts` using `defineAuditConfig(...)`. Root-level configurations (`audit.config.ts`) fail loudly; `auditor fix` moves and rebases them automatically.

### 3.1 Path Governance and Policy Mapping

```typescript
import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'My Application',

  paths: {
    srcRoots: ['src'],
    testRoots: ['tests/unit', 'tests/node'],
    e2eRoots: ['tests/e2e'],
    integrationRoots: ['tests/integration'],
    migrationsDir: 'supabase/migrations',
    scriptsRoots: ['scripts'],
    codeRoots: ['src', 'scripts', 'supabase'],
    dataRoots: ['src/data'], // Exempt from function LOC/complexity limits
    constantsRoots: ['src/logic/constants'],
    componentsRoots: ['src/components'],
    viewsRoots: ['src/views'],
    storesRoots: ['src/stores'],
    typesRoots: ['src/types'],
    stylesRoots: ['src/styles'],
    logicRoots: ['src/logic'],
    cliRoots: ['scripts', 'supabase'], // Authorized for CLI synchronous operations
    exemptFiles: ['src/logic/services/errorLoggingService.ts'],
    includeTestsInCodeAudit: false,
    ignoreGlobs: ['supabase/docker/volumes/**'],
    ignoredDirs: ['deploy', 'supabase/docker']
  },

  // 3.2 Subsystem Gating
  // Any subsystem not applicable to the project must be explicitly gated off:
  persistence: {
    engine: 'supabase', // or 'sqlite', 'postgres', 'hybrid', 'none'
    schemaQualified: false
  },
  domain: {
    enabled: true, // Set false for standalone tool/CLI packages
    finiteDomainTypes: []
  },
  accessibility: {
    enabled: true // Set false for headless/CLI repositories without Vue SFCs
  },
  documentation: {
    language: 'en', // Strict English documentation governance
    languageExemptions: []
  }
});
```

### 3.3 Vector Semantic Duplication (`fallow.similarCode`)

Vector code duplication runs on Candle CPU via Jina code embeddings in ~2s leveraging local disk caching. Configure sensitivity in `.auditor/audit.config.ts`:

```typescript
  fallow: {
    enabled: true,
    security: {
      enabled: true
    },
    enforceTargets: false,
    maxTargetPriority: 'critical',
    similarCode: {
      enabled: true,
      threshold: 0.95, // High precision threshold
      minLines: 5,     // Skips trivial 1-line getters/setters
      ignoreSameFile: true
    }
  },
```

### 3.4 Warning Ratchet (`ratchet`)

The differential warning ratchet prevents baseline degradation. `npm run audit` fails on any NEW warning compared with `.auditor/audit-baseline.json` committed at `ratchet.productionRef` (default `origin/main`):

```typescript
  ratchet: {
    enabled: true,
    productionRef: 'origin/main',
    baselineFile: '.auditor/audit-baseline.json'
  },
```

---

## 4. Modernizing Local Extension Sub-Auditors in v5+

Custom project rules reside in `scripts/auditors/<family>/` and inherit from `BaseAuditor` or `FileScanAuditor`:

### 4.1 Sub-Auditor Class Template

```typescript
import { BaseAuditor, type AuditFinding, type AuditorOptions } from '@francogp/auditor';

export const MY_EXTENSION_RULES = [
  'rule-one',
  'rule-two'
] as const;

export type MyExtensionRuleId = (typeof MY_EXTENSION_RULES)[number];

export const MY_RULE_DESCRIPTIONS: Record<MyExtensionRuleId, string> = {
  'rule-one': 'Regla de verificación uno en español',
  'rule-two': 'Regla de verificación dos en español'
};

export class ValidateMyExtension extends BaseAuditor<MyExtensionRuleId> {
  constructor(options: AuditorOptions = {}) {
    super({
      id: 'validate_my_extension',
      name: 'My Extension Validator',
      description: 'Verifica reglas de negocio locales de la aplicación',
      icon: '🛡️',
      family: 'domain_data',
      ruleIds: MY_EXTENSION_RULES,
      packageName: 'MyExt',
      // Mandatory in v5: Single Source of Truth configuration key
      configKey: 'domain.enabled',
      // Mandatory in v5: Default configuration object dynamically collected for .auditor/audit.config.ts
      defaultConfig: {
        enabled: true
      },
      ruleDescriptions: MY_RULE_DESCRIPTIONS,
      projectRoot: options.projectRoot,
      // Declare execution capabilities in v5:
      capabilities: { lint: true, fix: false }
    });
  }

  public async run(): Promise<AuditFinding[]> {
    this.markRuleEvaluated('rule-one');
    this.markRuleEvaluated('rule-two');
    return this.getFindings();
  }
}
```

### 4.2 Key v5+ Contracts for Sub-Auditors

1. **Mandatory Constructor Metadata Contract (Zero Bypass / Zero Optional Defaults)**:
   Every sub-auditor and extension MUST declare `id`, `name`, `description` (<= 60 chars), `family`, `packageName`, `icon`, `ruleDescriptions` (100% Spanish, <= 50 chars when prefixed), `configKey`, and `defaultConfig` (with mandatory boolean `enabled`). Omitting any field throws an immediate, blocking runtime `Error`.
2. **Universal Dynamic Suite Gating**:
   Suite status is resolved dynamically from `configKey` against `audit.config.ts`. No hardcoded registration maps.
3. **Capability-Driven Auto-Coordination**:
   Declare execution capabilities cleanly via `capabilities: Partial<AuditorCapabilities>` (`lint`, `fix`, `md`, `ast`, `heavy`, `requiresBuild`). When `auditor fix` runs, the engine isolates only suites with `capabilities.fix === true`.
4. **Post-Build Suite Partitioning (`audit:build` / `preset=build`)**:
   Suites declaring `capabilities: { requiresBuild: true }` (`validate_bundle_budget`, `validate_package_distribution`, `validate_package_types`) are excluded from pre-build source audit (`npm run audit`) and executed post-build against `dist/` via `npm run audit:build`.
5. **Security and Distribution Blind Spot Protection**:
   Framework incorporates `@secretlint/core` token scanning (`validate_secret_leaks`), npm audit CVE checking (`validate_dependency_vulnerabilities`), package export map verification (`validate_package_distribution`), and ATTW type declaration auditing (`validate_package_types`).
6. **Consolidated Table Total Row & Terminal Font Width Guarantees**:
   All multi-category tables automatically render the `TOTAL CONSOLIDADO` summary footer. Boxen frames use clean ASCII text within closed 80-column borders to prevent font-width misalignments from ambiguous Unicode glyphs.
7. **Prohibition on Modifying Configs Without Authorization**:
   AI agents and developers are strictly barred from modifying auditor configs (`.auditor/audit.config.ts`, `eslint.config.js`, `.stylelintrc.json`, `.fallowrc.json`) to bypass errors without prior consultation and detailed technical justification.
8. **Idempotent Injections & Anti-Duplication Pruning in `AGENTS.md` (`audit fix`)**:
   Auto-repair operations in `AGENTS.md` gather all matching line occurrences, replace the first match in place, and splice out all subsequent duplicates in reverse order. Running `auditor fix` repeatedly across multiple cycles or switching language modes never duplicates lines or blank spacing.

---

## 5. Non-Negotiable Directives

### Zero Rule Suppression Mandate

AI agents and developers are **STRICTLY PROHIBITED** from suppressing, silencing, or disabling auditor rules (e.g. setting `"rule": null`, `"rule": "off"`, passing arbitrary skip flags, or mocking empty test passes). When findings emerge during an upgrade:
1. They represent genuine architectural, typing, or hygiene defects.
2. They must be resolved legitimately in the application source code.
3. Clean passes must be earned through source code quality, never by castrating the auditor.

---

## 6. Root README Modernization Pass

When upgrading a host application to v5+:
1. **Audit Script Table**: Update the scripts table in `README.md` to reflect canonical v5 runner commands.
2. **Remove Deprecated Flags**: Eradicate obsolete CLI instructions or deprecated script references.
3. **Environment & Node Prerequisites**: Align documentation with Node.js 26+ native requirements (`--permission` and `--experimental-strip-types`).
