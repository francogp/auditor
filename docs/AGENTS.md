# Purpose

Documentation guides, host migration blueprints, and configuration examples for `@francogp/auditor`.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Framework Import Consistency**: All sample configuration files MUST import from `@francogp/auditor` (`defineAuditConfig`).
- **Relative Link Integrity**: All documentation files in this directory MUST use strictly relative paths and adhere to DOX linking rules.
- **Hermetic Reference Examples**: Configuration examples in this directory represent validated, real-world host blueprints (`Facturación 2.0`, `Poké Vicio`).

## Key Files

- [`blueprints.md`](./blueprints.md): Migration blueprints and subsystem configuration guide.
- [`audit.config.facturacion2.example.ts`](./audit.config.facturacion2.example.ts): Reference audit configuration for Facturación 2.0.
- [`audit.config.pokevicio.example.ts`](./audit.config.pokevicio.example.ts): Reference audit configuration for Poké Vicio.

## Child DOX Index

- _This directory does not contain subdirectories._
