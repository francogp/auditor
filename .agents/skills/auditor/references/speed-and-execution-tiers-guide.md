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
- **Zero Redundant Execution Mandate**: `auditor:lint` is a strict subset of `auditor`. Executing `npm run auditor:lint` AFTER running `npm run auditor`, `npm run auditor:full`, or `npm run build` is strictly redundant and prohibited.
