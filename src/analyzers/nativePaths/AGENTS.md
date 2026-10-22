# Purpose

TypeScript AST semantic analyzer for filesystem paths, file URLs, and network endpoints. Powers the `validate_native_paths` architecture suite, enforcing Node.js native standard library (`node:path`, `node:url`, `URL`) and eradicating homebrew path string concatenations, fragile separator replacements, manual filename/extension parsing, and CWE-22 path containment vulnerabilities.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **AST-First Traversal**: Code inspections across `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and Vue SFC `<script>` blocks must execute strictly via the TypeScript Compiler API (`doc.getAst()`). Regex-based line scanning of source code is strictly prohibited.
- **Node Context Gating (`isNodeContext`)**: Rules requiring Node.js APIs (`node:path`, `node:url`) only fire on files that import `node:*` modules or access Node globals (`process.cwd`, `__dirname`, `__filename`). Browser-only UI code is protected from false positives.
- **Pure Detection Contract**: Each detector in `detectors/` receives AST nodes and returns structured `NativePathViolation` objects or `null`.
- **Zero-Escape Mandate**: All filesystem operations and path resolutions must use canonical `node:path` and `node:url` APIs without bypass directives.

## Key Files

- [`nativePathTypes.ts`](./nativePathTypes.ts): Domain types, 9 rule IDs, and `NativePathDetector` interface definitions.
- [`pathHeuristics.ts`](./pathHeuristics.ts): Pure AST helper functions, node unwrappers, path/URL classification predicates, and fact extractors.
- [`pathLiteralHeuristics.ts`](./pathLiteralHeuristics.ts): Pure AST predicates for literal nodes, string values, regex sources, and templates.
- [`nativePathScanner.ts`](./nativePathScanner.ts): AST scanner coordinating document traversal, pre-collecting file facts, and evaluating active detectors.
- [`detectors/`](./detectors/AGENTS.md): Canonical AST detectors for each of the 9 native path rules.

## Work Guidance

- When adding or refining detectors, place AST inspection logic in `detectors/` and register the detector in `nativePathScanner.ts`.
- Ensure all rule IDs are mapped in `NATIVE_PATH_RULES` and covered by comprehensive test fixtures in `tests/fixtures/native_paths/`.

## Verification

- Run canonical suite tests: `vp test tests/validate_native_paths.test.ts` (or `npm test -- tests/validate_native_paths.test.ts`)

## Child DOX Index

- [`detectors/`](./detectors/AGENTS.md): Individual AST detectors for path concatenations, homebrew normalizations, parsing, containment, and URL safety.
