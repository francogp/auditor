# Purpose

Specialized static analyzers supporting auditor suites. Contains AST constant analysis (`constantAnalyzer.ts`) and DOX documentation hierarchy validation (`doxAnalyzer.ts`). CSS, SCSS, and Vue SFC style verification is delegated to the official Stylelint engine (`validate_stylelint.ts`).

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Pure Diagnostics**: Analyzers produce canonical violation records without direct terminal side-effects.
- **Hermetic AST Processing**: Utilizes the shared TypeScript AST context and visitors for maximum performance and zero platform dependency.
- **Idempotent Mandate Injection (`agentsMandateAnalyzer.ts`)**: `injectOrUpdateMandateInAgentsMd` collects all matching line occurrences, replaces the first match, and splices out subsequent duplicates in reverse order. It avoids inserting redundant blank lines under `## Local Contracts` and bypasses disk writes if the canonical text is already satisfied.

## Key Files

- [`agentsMandateAnalyzer.ts`](./agentsMandateAnalyzer.ts): AGENTS.md mandate parsing, language validation, and in-place injection helper.
- [`auditRuleTypes.ts`](./auditRuleTypes.ts): Core rule descriptors, violation schemas, and matching primitives.
- [`constantAnalyzer.ts`](./constantAnalyzer.ts): TypeScript AST visitor detecting duplicate or divergent numeric/string constants.
- [`constantRules.ts`](./constantRules.ts): Rules and heuristics for magic numbers, constant names, numeric suffixes, and aliases.
- [`doxAnalyzer.ts`](./doxAnalyzer.ts): AGENTS.md documentation tree walker and link integrity verifier.
- [`homebrew/`](./homebrew/AGENTS.md): Modular analyzer engine and registry detecting homebrew anti-patterns in auditors and extensions.
- [`zIndexRules.ts`](./zIndexRules.ts): Z-Index Design System Parity and isolated constant rules.

## Work Guidance

- Analyzers must be stateless or manage caches predictably through AST visitor structures.
- Return structured `Violation[]` objects rather than throwing unhandled runtime exceptions.
- Never hardcode candidate file names; resolve dynamic configuration through `getAuditConfig()`.

## Verification

- Run constant analyzer unit tests: `npm test -- tests/validate_constant_hygiene.test.ts`
- Run DOX analyzer unit tests: `npm test -- tests/validate_dox_integrity.test.ts`

## Child DOX Index

- [`homebrew/`](./homebrew/AGENTS.md): Homebrew anti-pattern analyzer and detector registry.
