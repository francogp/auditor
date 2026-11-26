# Speed Engine & Execution Tiers Guide

This reference provides the comprehensive architectural specification for the Auditor Speed Engine, execution tiers, command chaining, and scheduler prioritization.

---

## 3 Canonical Speed Tiers (`AuditExecutionSpeed`)

The framework classifies suites and rules into 3 canonical execution tiers:

- `'light'` (`🐇`): Fast static lint and AST rules (`npm run auditor:lint` / `auditor speed=light`).
- `'heavy'` (`🐢`): Default workspace audit ceiling (`npm run auditor` / `auditor` / `auditor speed=heavy`), running `'light'` + `'heavy'` suites.
- `'full'` (`🐘`): Exhaustive pre-build and release ceiling (`npm run auditor:full` / `auditor speed=full`), running `'light'` + `'heavy'` + `'full'` (including heavy multi-module operations like dead-code cascades, vector semantic analysis, and full test coverage).

---

## Execution Modes: Ceiling vs. Exact

1. **Ceiling Mode (`speed=light|heavy|full`)**: Cumulative up to the requested ceiling:
   - `speed=light`: Runs only `'light'` rules.
   - `speed=heavy`: Runs `'light'` + `'heavy'` rules.
   - `speed=full`: Runs `'light'` + `'heavy'` + `'full'` rules.
2. **Exact Isolation Mode (`only-speed=light|heavy|full`)**: Executes strictly the rules matching that exact tier, excluding lower tiers.

---

## Speed Engine Governance Mandates

- **Mandatory Speed Selection in Multi-Speed Critical Suites**: If a suite or rule declares `critical: true` and `speed` has 2 or more speeds declared (e.g. `speed: ['light', 'full']`), it **MUST ALWAYS choose the fastest (`light`) when no speed is specified in the invocation** (`auditor`, direct node execution, or `npm run <validate-script>`), guaranteeing that direct local executions run instantaneously with incremental/multithreading enabled.
- **Mandatory Authentic Tiers & Prohibition of Duplicated Tiers**: Inventing or duplicating speed tiers that repeat identical CLI arguments or behaviors as another tier is **STRICTLY PROHIBITED**. Each declared tier (`light`, `heavy`, `full`) MUST execute genuinely different commands or CLI flags of the underlying tool. If a tool only supports 2 distinct operational modes (e.g. `tsc` with `--incremental` in `light` vs without `--incremental` in `full`), ONLY those 2 basic tiers are declared (`['light', 'full']`).
- **Permanent Cache & Multithreading Mandate**: In the Full (`🐘`) tier, the entire project is audited without incremental/delta scoping, BUT tool caches and multithreading are NEVER turned off. Tools with multithreading support (e.g. `oxlint --threads`) utilize all available CPU cores.
- **Clean Composition in `TieredCommandProfile`**: Repeating identical literal arrays in `profiles` is strictly prohibited. Profiles must be cleanly composed using shared constants (e.g. `standardArgs`, `incrementalArgs`).
- **LPT Task Scheduler (Longest Processing Time First)**: In `audit_full`, suites with higher speed tiers (`🐘` `'full'`, `🐢` `'heavy'`) are sorted and dispatched FIRST in the worker queue so multi-core CPU workers absorb heavy tasks immediately.

---

## Mnemonic Command Naming & Master Build Chaining

- `npm run auditor:lint` (`auditor speed=light`): Fast `🐇` lint pass.
- `npm run auditor` (`auditor`): Default `🐢` heavy audit pass.
- `npm run auditor:full` (`auditor speed=full`): Exhaustive `🐘` pre-compilation/release audit pass.
- `npm run auditor:post-build` (`auditor phase=post-build`, binary `auditor-post-build`): Post-compilation artifact verification against `dist/`.
- `npm run build`: Chains `"npm run auditor:full && <compile> && npm run auditor:post-build"`.
- `npm run build:deploy` (`auditor-build-deploy`): Runs `npm run build` under `AUDITOR_ENV=production` for Docker/CI/deploy environments.

---

## Command Containment & Zero Redundant Execution Mandate

Follow this strict containment hierarchy to avoid wasting minutes repeating checks that a broader command already runs:

```text
npm run auditor:lint (speed=light)
  ⊂ npm run auditor (speed=heavy, includes auditor:md, oxfmt, oxlint, fallow)
    ⊂ npm run auditor:full (speed=full, includes similar-code & full AST/dead-code)
      ⊂ npm run build (auditor:full + compile + auditor:post-build)
```

- **`npm run test:coverage` vs `npm run build`**: `validate_test_coverage` inside `auditor:full`/`build` **reads** the coverage artifact (`scratch/coverage/coverage-final.json`); it does **not** execute tests. Therefore:
  - Run `npm run test:coverage` **once** after finishing code/test edits (never run `npm run test` and then `npm run test:coverage`, and never re-run `test:coverage` if neither `src/` nor `tests/` changed).
  - Run `npm run build` **once** after `test:coverage` passes.
- **Never run subsets around `auditor:full` or `npm run build`**:
  - Running `npm run auditor:lint`, `npm run auditor`, `npm run auditor:md`, `npm run fmt:check`, or `npm run auditor:post-build` **before or after** `npm run auditor:full` or `npm run build` is strictly redundant and prohibited.
  - Running `npm run auditor:full` and immediately running `npm run build` is strictly redundant (unless `dist/` compilation is not needed, in which case run only `auditor:full`).
- **Inspect without re-running**: When an audit or build fails, inspect `scratch/audits/latest_audit.json` with `npm run auditor:next` / `npm run auditor:findings` / `npm run auditor:errors` instead of re-running the suite. Use `npm run auditor:fix` (which already applies formatting and auto-fixes) and verify targeted fixes with `npm run auditor suite=<id>` or `npm run auditor:lint` during the inner loop; run `npm run build` only once at the end.

---

## Disambiguating `typeAware`: Vite+/Oxlint vs. Fallow

| Setting in `.auditor/audit.config.ts` | Purpose | Runs TypeScript Checker (`tsc`)? | Active Speed Tiers |
| :--- | :--- | :--- | :--- |
| `vitePlusConfig.lint.typeAware` + `typeCheck` | TypeScript compiler type-checking and Oxlint type-aware lint rules (`vp check`). | Yes (type-checking + typed lint). | All (`light`, `heavy`, `full`) |
| `fallow.typeAware` (`default: false`) | Project-wide dead-code & contract graph refinement in Fallow (protects interface/inheritance class members from false positives and detects cross-file private type leaks). | No (never emits `tsc` errors; consumes semantic graph only). | `full` only when `true`; `light`/`heavy` always pass `--no-type-aware` (or run `fallow dead-code --type-aware --symbol-impact` on demand). |
