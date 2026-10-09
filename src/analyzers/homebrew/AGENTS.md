# Purpose

Extensible homebrew anti-pattern analyzer and detector registry. Inspects sub-auditor and host extension codebases to detect fragile homebrew implementations (uncoordinated raw console logging, manual package.json parsing, uncoordinated Vue SFC regex slicing, isolated TS AST creation, manual path normalization/containment, manual comment stripping, manual brace counting, recursive directory walks, and homebrew test/path predicates).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Dynamic Detector Registration**: All homebrew checks derive from `HomebrewDetector` instances registered in `HomebrewDetectorRegistry`.
- **Zero Hardcoded Heuristics in Core**: Rules and detectors must be modular, self-contained, and exportable.
- **Escape Hatch Standard**: Detectors strictly honor inline and preceding-line comments (`// homebrew-ok: <reason>` or `// console-ok: <reason>`).

## Key Files

- [`homebrewTypes.ts`](./homebrewTypes.ts): Domain types, rule IDs, and `HomebrewDetector` interface definitions.
- [`homebrewRegistry.ts`](./homebrewRegistry.ts): Dynamic registry for detectors with line-based exemption handling.
- [`index.ts`](./index.ts): Default registry initialization and built-in detector auto-registration.
- [`detectors/`](./detectors/): Directory of 10 canonical homebrew detectors.

## Work Guidance

- When adding new homebrew detectors, implement `HomebrewDetector` and register it in `HomebrewDetectorRegistry`.
- Ensure rule descriptions stay under 50 characters when combined with package prefix.

## Verification

- Run hygiene suite tests: `npm test -- tests/validate_auditor_hygiene.test.ts`
- Execute standalone suite: `node --experimental-strip-types src/suites/architecture/validate_auditor_hygiene.ts`

## Child DOX Index

- [`detectors/`](./detectors/AGENTS.md): Canonical homebrew anti-pattern detectors.
