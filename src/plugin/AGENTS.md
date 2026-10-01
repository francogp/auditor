# Purpose

Auditor extension plugin protocol and registration helpers. Provides `defineAuditorExtension` to enable host projects to create domain-specific sub-auditors that integrate seamlessly into `@francogp/auditor`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Declarative Extension API**: Host extensions define metadata, auditor classes, or factory functions via `AuditorExtensionDefinition`.
- **Agnostic Dispatch**: The core runner executes extensions adhering strictly to the BaseAuditor lifecycle.

## Key Files

- [`defineAuditorExtension.ts`](./defineAuditorExtension.ts): Type definition and factory helper for registering custom auditor extensions.

## Child DOX Index

- _This directory contains plugin extension definition modules with no subdirectories._
