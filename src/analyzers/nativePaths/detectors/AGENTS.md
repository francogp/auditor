# Purpose

Canonical AST detector modules for `validate_native_paths`. Each detector inspects TypeScript AST nodes to identify specific unsafe or homebrew path/URL patterns according to Node.js native standard library standards and CWE-22 security requirements.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Single Concern per Detector**: Each detector inspects AST nodes for one specific rule or tightly coupled rule set.
- **Node Context Awareness**: Node-specific detectors (`concatDetector`, `normalizeDetector`, `parsingDetector`, `containmentDetector`, `fileUrlDetector`, `slashDetector`, `envArgvDetector`) are only dispatched when `facts.isNodeContext` is true.
- **Zero Regex on AST Nodes**: Node structure, property accesses, and call arguments must be evaluated via TypeScript Compiler API types (`ts.isCallExpression`, `ts.isPropertyAccessExpression`, etc.).

## Key Files

- [`concatDetector.ts`](./concatDetector.ts): Detects manual path assembly via `+`, `+=`, template literals, and `join('/')` (`unsafe-path-concat`).
- [`normalizeDetector.ts`](./normalizeDetector.ts): Detects homebrew separator replacements (`replace(/\\/g, '/')`, `split('/').join(sep)`) and manual slash stripping (`homebrew-path-manipulation`).
- [`parsingDetector.ts`](./parsingDetector.ts): Detects manual extension extraction (`split('.').pop()`) and basename extraction (`split('/').pop()`) (`homebrew-path-parsing`).
- [`containmentDetector.ts`](./containmentDetector.ts): Detects CWE-22 vulnerable path containment checks via `.startsWith()` and manual `..` substring checks (`homebrew-path-containment`).
- [`fileUrlDetector.ts`](./fileUrlDetector.ts): Detects homebrew `file://` conversions (`replace('file://', '')`, `.pathname` on `import.meta.url`) instead of `fileURLToPath()` (`homebrew-file-url`).
- [`urlParsingDetector.ts`](./urlParsingDetector.ts): Detects manual search query parsing and pathname regexes on URLs (`homebrew-url-parsing`).
- [`slashDetector.ts`](./slashDetector.ts): Detects hardcoded Windows backslash operations without cross-platform handling (`hardcoded-slash-path`).
- [`envArgvDetector.ts`](./envArgvDetector.ts): Detects unsanitized `process.env` or `process.argv` variables passed directly into filesystem sinks (`unsanitized-env-argv-path`).
- [`fetchDetector.ts`](./fetchDetector.ts): Detects untrusted network fetch calls without URL origin or protocol validation (`untrusted-url-fetch`).

## Work Guidance

- Detector functions implement `NativePathDetector` and take `(node: ts.Node, facts: NativePathFileFacts)`.
- If an AST node matches, return `{ ruleId, node, message }`; otherwise return `null`.

## Verification

- Run detector test cases: `vp test tests/validate_native_paths.test.ts` (or `npm test -- tests/validate_native_paths.test.ts`)

## Child DOX Index

No child directories exist under this folder.
