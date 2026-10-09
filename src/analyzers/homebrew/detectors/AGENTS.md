# Purpose

Canonical homebrew anti-pattern detectors for `@francogp/auditor`. Provides discrete, modular detection heuristics for common homebrew implementations across auditor suites and host extensions.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Single Responsibility Detectors**: Each detector implements `HomebrewDetector` targeting a single rule ID.
- **Escape Hatch Support**: Detectors must respect both inline (`// homebrew-ok:`, `// console-ok:`) and previous-line annotations.
- **Pure Heuristics**: Detectors analyze provided lines and context without performing disk I/O.

## Key Files

- [`packageJsonDetector.ts`](./packageJsonDetector.ts): Detects manual package.json reads (`auditor-manual-package-json`).
- [`vueSfcRegexDetector.ts`](./vueSfcRegexDetector.ts): Detects ad-hoc Vue SFC block slicing regexes (`auditor-manual-vue-sfc-regex`).
- [`tsAstDetector.ts`](./tsAstDetector.ts): Detects isolated ts.createSourceFile calls (`auditor-manual-ts-ast`).
- [`pathNormalizeDetector.ts`](./pathNormalizeDetector.ts): Detects manual backslash replacement regexes (`auditor-manual-path-normalize`).
- [`rawConsoleDetector.ts`](./rawConsoleDetector.ts): Detects uncoordinated console.log calls (`auditor-raw-console`).
- [`commentStrippingDetector.ts`](./commentStrippingDetector.ts): Detects manual comment stripping regexes (`auditor-manual-comment-stripping`).
- [`braceCountingDetector.ts`](./braceCountingDetector.ts): Detects manual brace counting loops (`auditor-manual-brace-counting`).
- [`pathContainmentDetector.ts`](./pathContainmentDetector.ts): Detects manual startsWith/relative path containment checks (`auditor-manual-path-containment`).
- [`fileWalkerDetector.ts`](./fileWalkerDetector.ts): Detects manual recursive fs directory traversal (`auditor-manual-file-walker`).
- [`predicatesDetector.ts`](./predicatesDetector.ts): Detects homebrew test/path predicates (`auditor-homebrew-predicates`).

## Work Guidance

- Keep rule descriptions concise (<= 50 chars when prefixed).
- Register all new detectors in `../index.ts`.

## Verification

- Run hygiene tests: `npm test -- tests/validate_auditor_hygiene.test.ts`
- Execute standalone suite: `node --experimental-strip-types src/suites/architecture/validate_auditor_hygiene.ts`

## Child DOX Index

- _This directory contains modular detector implementations with no subdirectories._
