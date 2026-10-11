# Sub-Auditor Testing & Conformance Verification Guide

This guide establishes the mandatory testing contract and verification standards for all sub-auditors in `@francogp/auditor` and host project extensions (`scripts/auditors/`).

---

## 🏛️ The 5-Point Conformance Contract

Every sub-auditor and host extension MUST be covered by a dedicated Vitest unit test adhering strictly to the 5-point contract enforced by `tests/all_auditors_contract_conformance.test.ts` and `runAuditorContractConformanceTests`:

1. **Instantiation & Metadata Verification**:
   - Verify construction through `validateAuditorConstruction(auditor)`.
   - Validate that `id`, `name`, `description`, `family`, `packageName`, `icon`, `ruleDescriptions`, `ruleCapabilities`, `configKey`, `defaultConfig`, and `criticalConfig` are explicitly defined and non-empty.

2. **Clean Workspace / Negative Verification**:
   - Every test suite MUST include a test asserting that valid, compliant code produces **zero errors and passed status**:

     ```typescript
     expect(result.summary.errors).toBe(0);
     expect(result.status).toBe('passed');
     expect(result.findings).toHaveLength(0);
     ```

   - The rule `missing-clean-auditor-test` is classified strictly as `severity: 'error'`. Omission of clean path verification fails the audit build.

3. **Violation Detection**:
   - For every rule configured to emit errors, verify that non-compliant code produces `severity: 'error'`, `status: 'failed'`, and `summary.errors > 0`.
   - Explicitly verify:

     ```typescript
     expect(finding.ruleId).toBe('<exact-rule-id>');
     expect(finding.severity).toBe('error');
     ```

4. **Warning Verification (Where Declared)**:
   - For rules configured or categorized as warnings, verify that the condition produces `status: 'warned'`, `severity: 'warning'`, and `summary.warnings > 0`.

5. **100% Rule ID Coverage**:
   - Every single declared `ruleId` in `ruleDescriptions` MUST have at least one dedicated test assertion verifying its behavior.
   - Leaving any declared rule ID unasserted triggers contract failure.

---

## 📁 File Locations & Naming Conventions

- **Generic Suites (Core)**: `tests/<suite_filename>.test.ts` (e.g., `tests/validate_web_performance.test.ts`).
- **Host Extension Plugins**: `tests/node/auditors/<suite_filename>.test.ts` or `tests/auditors/<suite_filename>.test.ts`.
- **Meta-Conformance Test**: `tests/all_auditors_contract_conformance.test.ts` ensures that 100% of discovered suites have a matching test file.

---

## 🛡️ Hermetic Test Isolation & Anti-Leak Patterns

Sub-auditor unit tests must run with hermetic isolation to prevent host code defects from leaking into test suites:

### 1. In-Memory Snippet Verification (`testScanFile`)

When testing `FileScanAuditor` or line-based analyzers, pass synthetic code directly into `testScanFile` and conclude with `await auditor.finishAudit()`:

```typescript
const auditor = new MyAuditor();
auditor.testScanFile('src/example.ts', 'const invalid = true;');
const result = await auditor.finishAudit();
```

### 2. Sandbox Directories for Multi-File Analyzers

When testing whole-directory scans, instantiate the auditor passing an isolated temporary sandbox directory via `projectRoot`:

```typescript
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-'));
try {
  const auditor = new MyAuditor({ projectRoot: tempDir });
  const result = await auditor.execute();
  // assertions...
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
```

> [!CAUTION]
> **Zero Live Repository Scanning**: Sub-auditor unit tests MUST NEVER execute full workspace scans (`auditor.execute()`) directly on `process.cwd()` without a sandbox directory.

### 3. Test Fixture String Concatenation

When writing unit tests for linters or AST rules that detect banned imports or syntax (e.g. banned modules, dangerous types), string fixtures representing violating code snippets MUST be dynamically split or concatenated (e.g. `'import fs from ' + "'fs';"`). This prevents whole-project regex and AST scanners from misidentifying test fixtures as workspace architectural defects.

### 4. Suppression / Escape Hatch Verification

If the auditor supports statement-level suppression comments (e.g., `// <rule>-ok: <justification>`) or configuration ignore patterns, the test suite must verify that valid suppressions cleanly bypass detection and do not produce violations.
