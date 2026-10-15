# Master Audit Error Triage and Remediation Guide

This guide provides a comprehensive reference for diagnosing and resolving errors detected by `@francogp/auditor`, its official sub-auditors, and custom host extensions.

---

## 🚀 On-Demand Terminal Remediation Guides (`auditor guide`)

Since version 7.1.6, every sub-auditor and host extension **mandatorily defines step-by-step diagnostic and remediation guides** for 100% of its declared rules (`ruleRemediations`).

Any guide can be rendered on demand in the console with zero text truncation and Box-Drawing formatting:

```bash
# 1. By exact rule ID:
npm run auditor guide <ruleId>
# Examples:
npm run auditor guide coverage-missing-ledger
npm run auditor guide audit-config-missing-section

# 2. By complete suite (displays all declared rules in the suite):
npm run auditor guide suite=<suiteId>
# or simply:
npm run auditor guide <suiteId>
# Examples:
npm run auditor guide validate_audit_coverage
npm run auditor guide validate_audit_config

# 3. By architectural family:
npm run auditor guide family=<family>
# Examples:
npm run auditor guide family=architecture
npm run auditor guide family=persistence

# 4. Global index of available rules and suites:
npm run auditor guide
```

---

## 🔍 Critical Errors Catalog and Triage Recipes

### 1. `coverage-missing-ledger`

- **Family**: `architecture` | **Suite**: `validate_audit_coverage`
- **Symptom**: A planned suite completed without generating its coverage ledger file in `scratch/audits/coverage/<suiteId>.json`.
- **Root Cause**:
  1. The sub-process exited with a non-zero code or uncaught runtime exception prior to `finishAudit()`.
  2. The suite lacks `await BaseAuditor.runCliIfMain(...)` or encountered an ESM top-level await cycle under Node.js 26+.
  3. Missing dependencies or invalid constructor options (`ruleRemediations`, `criticalConfig`, etc.).
- **Remediation**:
  1. Execute the suite in isolation to observe the full terminal stack trace:

     ```bash
     npm run auditor suite=<suiteId>
     ```

  2. Ensure the class inherits from `BaseAuditor` or `FileScanAuditor` and passes all required constructor fields.
  3. Ensure `BaseAuditor.runCliIfMain(import.meta.url, new YourAuditor())` is invoked at the bottom of the file.

---

### 2. `audit-config-missing-section`

- **Family**: `architecture` | **Suite**: `validate_audit_config`
- **Symptom**: A sub-auditor or extension declares a `configKey` (e.g. `valibot`, `oxlint`, `customExt`), but the section is missing in `.auditor/audit.config.ts`.
- **Remediation**:
  1. Run the automatic repair command:

     ```bash
     npm run auditor:fix
     ```

  2. Or manually add the configuration block with `enabled: true` to `.auditor/audit.config.ts`.

---

### 3. `audit-config-missing-file` / `audit-config-missing-path`

- **Family**: `architecture` | **Suite**: `validate_audit_config`
- **Symptom**: A file or directory path configured in `paths` or declared by a sub-auditor does not physically exist on disk.
- **Remediation**:
  1. Create the missing directory or file (e.g. migrations directory or source root).
  2. Or update `.auditor/audit.config.ts` to reference the correct relative path.

---

### 4. `audit-config-missing-gitignore-entry`

- **Family**: `architecture` | **Suite**: `validate_audit_config`
- **Symptom**: Missing temporary cache or log pattern in `.gitignore` (e.g. `scratch/`, `*.log`, `cache/`).
- **Remediation**:
  1. Run `npm run auditor:fix` to automatically inject missing requirements.
  2. Or append the required entry directly to your `.gitignore` file.

---

### 5. `missing-clean-auditor-test` / `untested-auditor-rule`

- **Family**: `architecture` | **Suite**: `validate_auditor_tests`
- **Symptom**: A sub-auditor or extension lacks complete unit test coverage under the 5-point contract.
- **Remediation**:
  1. Create or update the dedicated test file under `tests/`.
  2. Ensure the test file contains:
     - Construction verification via `validateAuditorConstruction(auditor)`.
     - Clean path testing with `errors === 0` and `status === 'passed'`.
     - Violation detection with `severity === 'error'`.
     - Explicit verification of 100% of declared `ruleIds`.

---

### 6. `fallow-refactoring-targets` / Architectural Debt

- **Family**: `architecture` | **Suite**: `validate_fallow`
- **Symptom**: A source file exceeds holistic refactoring priority and cyclomatic complexity limits.
- **Remediation**:
  1. Run `npm run auditor:complexity` to inspect function-level hotspots.
  2. Decompose large files by extracting pure composables, utility functions, or isolated sub-modules.

---

## 📋 Sub-Auditor Authoring Contract (`ruleRemediations`)

Every sub-auditor and host extension author MUST provide `ruleRemediations` in the `BaseAuditor` options:

```typescript
export class SampleAuditorExtension extends BaseAuditor<'sample-rule-a'> {
  constructor() {
    super({
      id: 'validate_sample_extension',
      name: 'Sample Extension',
      description: 'Validates business domain constraints',
      family: 'architecture',
      packageName: 'Sample',
      icon: '🔧',
      configKey: 'sampleExtension.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleIds: ['sample-rule-a'],
      ruleDescriptions: {
        'sample-rule-a': 'Short description of the rule'
      },
      // MANDATORY CONTRACT:
      ruleRemediations: {
        'sample-rule-a': 'Step-by-step diagnostic and remediation guide.'
      },
      ruleCapabilities: createUniformRuleCapabilities(['sample-rule-a'], {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      coverage: { include: ['src/**/*.ts'] }
    });
  }
}
```

Omitting `ruleRemediations` or omitting any declared rule causes `BaseAuditor` to fail loudly during instantiation (`throw new Error(...)`), ensuring all error conditions are always documented.
