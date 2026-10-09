# Upgrading Host Applications to `@francogp/auditor` v4+

> [!NOTE]
> **Canonical v5 Upgrade Guide Available**:
> For projects upgrading to `@francogp/auditor` v5+, refer directly to the canonical [v5-migration-guide.md](v5-migration-guide.md). This document is preserved for historical context regarding v3 to v4 migrations.

## Executive Overview

`@francogp/auditor` v4+ establishes an uncompromising, zero-tolerance architectural verification framework for TypeScript and Vue applications. The engine coordinates built-in generic static analysis suites across all architectural families, AST context caching, vector semantic duplication (Candle CPU embeddings), official Stylelint governance, strict coverage ledgers, and terminal Box-Drawing reporting with consolidated totals.

This guide provides a comprehensive migration blueprint for upgrading legacy host projects (v3 or earlier) to canonical v4+ standards.

---

## 1. Upstream Package Consumption

Host applications must consume `@francogp/auditor` strictly as a native npm GitHub dependency:

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

Manual cloning (`git clone`), git submodules, or direct file copying into host repositories is strictly prohibited.

---

## 2. Package Scripts Synchronization

All sub-auditors and registered host extensions automatically declare their required scripts. Hardcoding or copy-pasting static script lists is strictly prohibited.

To inject all canonical scripts non-destructively into `package.json`:

```bash
auditor fix
# or
npm run auditor:fix
```

This command automatically chains `auditor &&` into your `build` script and appends all missing auditor commands without altering your existing custom scripts or aliases.

---

---

## 3. Configuration Modernization (`.auditor/audit.config.ts`)

Host applications configure the auditor via `.auditor/audit.config.ts` using `defineAuditConfig(...)` (root-level configs fail loudly; `auditor fix` or `npm run auditor:fix` migrates them).

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
  // ...
});
```

### 3.2 Audit Coverage & Ledger Enforcement (`coverage`)

In v4+, `validate_audit_coverage` enforces 100% file coverage across all versioned files. Files that are intentionally exempt or have acknowledged policy degradations must be formally registered:

```typescript
  coverage: {
    enabled: true,
    exemptGlobs: [
      {
        glob: 'deploy-*.sh',
        reason: 'Host server provisioning and deployment shell scripts'
      },
      {
        glob: 'src/data/system/servers.defaults.json',
        reason: 'Static configuration catalog and template seed for servers'
      }
    ],
    acknowledgedDegradations: [
      {
        policy: 'scripts',
        glob: 'scripts/**',
        reason: 'Maintenance, testing, calculation, and deployment scripts'
      },
      {
        policy: 'cli',
        glob: 'scripts/**',
        reason: 'CLI scripts authorized for console and local tool operations'
      },
      {
        policy: 'cli',
        glob: 'supabase/**',
        reason: 'Supabase provisioning and maintenance CLI scripts'
      },
      {
        policy: 'data',
        glob: 'src/data/**',
        reason: 'Tabular data catalogs and system metadata'
      },
      {
        policy: 'exemptFiles',
        glob: 'src/logic/services/errorLoggingService.ts',
        reason: 'Central error logging service with justified console access'
      }
    ]
  },
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

### 3.4 Warning Ratchet Replaces `audit:for-commit` (`ratchet`)

The differential `audit:for-commit` / `auditor-commit` gate no longer exists. `npm run auditor` itself now fails on any NEW warning compared with `.auditor/audit-baseline.json` committed at `ratchet.productionRef` (default `origin/main`). Migration steps:

1. Run `npm run auditor:fix` (or `auditor fix`) to delete the `audit:for-commit` script and rewrite any script that referenced it (otherwise `audit-config-removed-commit-gate` fails).
2. Make sure the production ref resolves (`git fetch origin`; CI checkouts need full history), or set `ratchet.productionRef`.
3. Reach 0 errors, then run `npm run auditor -- --init-baseline` once and commit `.auditor/audit-baseline.json` to the production branch.

```typescript
  ratchet: {
    enabled: true,                       // Active by default
    productionRef: 'origin/main',        // Ref holding the authoritative baseline
    baselineFile: '.auditor/audit-baseline.json'  // Shrink-only, committed fingerprint baseline
  },
```

---

## 4. Modernizing Local Extension Sub-Auditors

Custom project rules reside in `scripts/auditors/<family>/` and must inherit from `BaseAuditor` or `FileScanAuditor`:

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
      ruleDescriptions: MY_RULE_DESCRIPTIONS,
      projectRoot: options.projectRoot,
      capabilities: { lint: true, fix: false }
    });
  }

  public async run(): Promise<AuditFinding[]> {
    // 1. Mark every evaluated rule in the coverage ledger:
    this.markRuleEvaluated('rule-one');
    this.markRuleEvaluated('rule-two');

    // 2. Perform verification logic...
    return this.getFindings();
  }
}
```

### 4.2 Key v4+ Contracts for Sub-Auditors

1. **`markRuleEvaluated` Method**:
   Always call `this.markRuleEvaluated(ruleId)` instead of outdated methods (`recordRuleEvaluation` is obsolete). Un-evaluated rules will be flagged by `validate_audit_coverage` as `coverage-sleeping-rule`.
2. **Modular Descriptions & 50-Character Limit**:
   Descriptions in `ruleDescriptions` must be pure Spanish without hardcoded package prefixes. The combined string `${packageName}: ${ruleDescription}` must not exceed 50 characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`).
3. **Capabilities**:
   Only declare non-default capabilities in `capabilities` (`{ fix: true, lint: true }`). Default is all `false`.
4. **No Manual Scan Counts**:
   `finish()` no longer accepts legacy error/warning counts, and assigning `filesScannedCount` throws unless the suite declares the `declared-only` coverage source. Record scanned files through `recordScanned()` / `testScanFile()` instead.

---

## 5. Non-Negotiable Directives

### Zero Rule Suppression Mandate

AI agents and developers are **STRICTLY PROHIBITED** from suppressing, silencing, or disabling auditor rules (e.g. setting `"rule": null`, `"rule": "off"`, passing arbitrary skip flags, or mocking empty test passes). When findings emerge during an upgrade:

1. They represent genuine architectural, typing, or hygiene defects.
2. They must be resolved legitimately in the application source code.
3. Clean passes must be earned through source code quality, never by castrating the auditor.

### DRY Code & Modular Architecture

When refactoring code to eliminate semantic or duplicated code findings:

- Extract shared functionality into clean, well-tested utility modules (e.g., `scripts/lib/envUtils.ts`).
- Employ clean OOP inheritance (e.g., `BaseDefinitionParser`) to consolidate duplicated workflows.
- Modularize repetitive CSS/SCSS with SCSS mixins (e.g., `@mixin modal-form-group`).

---

## 6. Root README Modernization Pass

When upgrading a host application to v4+:

1. **Audit Script Table**: Update the scripts table in `README.md` to reflect canonical v4 runner commands (`npm run auditor`, `npm run auditor:fix`, `npm run auditor:build`, `npm run auditor:similar`, `npm run auditor:update`).
2. **Remove Deprecated Flags**: Eradicate obsolete CLI instructions or deprecated script references.
3. **Environment & Node Prerequisites**: Align documentation with Node.js 26+ native requirements (`--permission`).
