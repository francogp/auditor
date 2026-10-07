# Purpose

Auditor extension plugin protocol and registration helpers. Provides `defineAuditorExtension` to enable host projects to create domain-specific sub-auditors that integrate seamlessly into `@francogp/auditor`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Declarative Extension API**: Host extensions define metadata, auditor classes, or factory functions via `AuditorExtensionDefinition`.
- **Agnostic Dispatch**: The core runner executes extensions adhering strictly to the BaseAuditor lifecycle.

## Key Files

- [`defineAuditorExtension.ts`](./defineAuditorExtension.ts): Type definition and factory helper for registering custom auditor extensions.

## Work Guidance

- Ensure `defineAuditorExtension` validates extension options and enforces Spanish `ruleDescriptions` under `<= 50` characters.
- Ensure extensions preserve the `BaseAuditor` lifecycle contracts without mutating runner internals.

## Verification

- Run plugin unit tests: `npm test -- tests/plugin_protocol.test.ts`
- Run general auditor: `npm run audit:lint`

## Child DOX Index

- _This directory contains plugin extension definition modules with no subdirectories._
