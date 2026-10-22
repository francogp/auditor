# Purpose

Single Source of Truth configuration directory for `@francogp/auditor` runtime settings, rule definitions, and architectural governance.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Dynamic SSoT Configuration (`audit.config.ts`)**: All auditor thresholds, root definitions, suite gating flags, and documentation language specifications reside strictly in `.auditor/audit.config.ts`.
- **Prohibition on Modifying Configurations Without Prior Programmer Consultation**: Developers and AI agents are strictly prohibited from altering or disabling auditor configurations in `.auditor/audit.config.ts` without explicit prior user authorization.

## Key Files

- [`audit.config.ts`](./audit.config.ts): Canonical auditor configuration file defining paths, suite toggles, and governance baselines.

## Work Guidance

- Keep configuration declarative, minimal, and aligned with canonical defaults.
- Always run `npm run auditor:lint` after touching configuration.

## Verification

- Validate configuration health: `npm run auditor suite=validate_audit_config`
- Inspect findings: `npm run auditor:findings`

## Child DOX Index

This module is a terminal leaf in the DOX hierarchy and contains no child packages or sub-agents.
