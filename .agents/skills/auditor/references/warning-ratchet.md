# Built-In Warning Ratchet & Warning Baseline Architecture (`auditRatchet.ts`)

This document details the architecture, mathematical fingerprinting formula, production reference synchronization, and baseline shrinkage invariants of the Warning Ratchet system in `@francogp/auditor`.

---

## 1. Core Principle: Zero Errors and Zero New Warnings

The full default audit (`npm run auditor`) and exhaustive audit (`npm run auditor:full`) enforce:

1. Exactly **0 errors**.
2. Exactly **0 new warnings**.

Any newly introduced warning that is not fingerprinted in the committed production baseline triggers an immediate failure. Existing legacy warnings are permitted only if they already exist in the baseline, forcing continuous quality ratcheting.

---

## 2. Content-Based Warning Fingerprinting Formula

Every warning emitted by an audit suite is fingerprinted deterministically using a SHA-256 hash:

$$\text{Fingerprint} = \text{SHA256}(\text{suiteId} \mid \text{ruleId} \mid \text{relFilePath} \mid \text{normalizedSourceLine} \mid \text{occurrenceIndex})$$

- **Normalized Source Line**: Strips leading and trailing whitespace to make the fingerprint immune to cosmetic indentation changes.
- **Occurrence Index**: Differentiates multiple identical warnings occurring on identical lines within the same file.
- **Line Shift Invariance**: Because the formula hashes the content of the normalized source line rather than absolute line numbers, inserting or deleting lines elsewhere in the file will not invalidate existing warning fingerprints.

---

## 3. Production Baseline & Invariant of Monotonic Shrinkage

- **Baseline Location**: `.auditor/audit-baseline.json`.
- **Production Reference**: Evaluated against the Git reference configured in `config.ratchet.productionRef` (default: `origin/main`), statically verified by `validate_audit_config` (`audit-config-invalid-production-ref`).
- **Baseline Shrinkage Invariant**: The local warning baseline can **only shrink, never grow**.
  - When a full audit pass runs with 0 errors, any warnings that were resolved or deleted are automatically pruned from the baseline file.
  - Suites that were skipped or not applicable in the current run carry over their existing baseline entries intact.
  - The newly reduced baseline file must be committed alongside code improvements.
  - Local warning fingerprints that do not exist in the production baseline fail loudly.

---

## 4. Initial Baseline Workflow

On existing repositories with pre-existing legacy warnings:

- Initialize the baseline once with:

  ```bash
  npm run auditor -- --init-baseline
  ```

- This command is strictly refused if the remote production reference (`origin/main`) already contains a committed baseline file.

---

## 5. Scope of Ratchet Execution & Partial Run Exemption

The Warning Ratchet operates exclusively during full, whole-workspace audit runs.
The ratchet is **automatically bypassed** during:

- Fast presets (`speed=light`, `preset=md`).
- Targeted runs (`only-speed=...`, `tasks=...`, `rules=...`, `families=...`).
- Delta runs (`--changed-since`).
- Automated repair mode (`auditor fix`).
- Post-build artifact verification (`phase=post-build`).

---

## 6. Removal of Legacy Commit Gate & CI Checkout Mandate

- **Removed Commit Gate**: The legacy `audit:for-commit` and `auditor-commit` scripts have been completely removed in favor of standard build chaining and pre-commit hooks. Scripts still referencing them trigger `audit-config-removed-commit-gate` (repaired via `auditor fix`).
- **CI/CD Full History Checkout**: In continuous integration environments (e.g. GitHub Actions), runners must check out full Git history (`fetch-depth: 0`) so that `origin/main` is reachable for baseline comparison.
