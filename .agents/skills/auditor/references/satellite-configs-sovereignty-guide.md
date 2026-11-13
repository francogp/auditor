# Satellite Configurations Sovereignty & SSoT Governance Guide

## Purpose & Core Philosophy

In modern software architecture governed by `@francogp/auditor`, multiple underlying tools (Fallow, Vite+, Stylelint, TypeScript, HTML-Validate, Oxlint, etc.) require configuration files in the project root (`.fallowrc.json`, `vite.config.ts`, `.stylelintrc.json`, `tsconfig.json`, `.htmlvalidate.json`).

Allowing developers or AI agents to manually edit these disparate configuration files causes:

1. **Configuration Drift & Desynchronization**: Satellite tools fall out of alignment with project governance.
2. **False Alarms & User Confusion**: Direct edits in satellite files obscure the origin of rules and mislead engineers.
3. **Loss of Determinism**: Changes made outside automated quality gates are volatile and cannot be reproduced in clean CI clones.

To eliminate these hazards, the framework enforces the **Auditor Exclusive SSoT Sovereignty Mandate**:

- **`.auditor/audit.config.ts` is the SOLE Single Source of Truth (SSoT)** for repository architecture, rules, boundaries, and exceptions.
- **Satellite configuration files are derived, projected artifacts** owned exclusively by `@francogp/auditor`.
- **The Auditor is the ONLY entity authorized to generate, mutate, and synchronize satellite configurations** via official setup suites (`phase: 'setup'`) executed during `npm run auditor:fix`.

---

## 1. Governed Satellite Configurations Catalog

The following table documents every satellite configuration file, its governing setup suite, its SSoT section in `.auditor/audit.config.ts`, and its blocking undeclared entries detection rule:

| Satellite Config File | Governing Setup Suite           | SSoT Section in `.auditor/audit.config.ts`                                 | Blocking Undeclared Entries Rule        | Auto-Fix Command      |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- | --------------------- |
| `.fallowrc.json`      | `validate_fallow_config`        | `config.fallow.ignoreGlobs` / `ignorePatterns`, `config.fallow.ignoreDependencies` | `fallow-undeclared-config-entry`        | `npm run auditor:fix` |
| `vite.config.ts`      | `validate_vite_plus_config`     | `config.vitePlusConfig`, `config.paths.ignoreGlobs`, `config.testCoverage` | `vite-plus-undeclared-config-entry`     | `npm run auditor:fix` |
| `.stylelintrc.json`   | `validate_stylelint_config`     | `config.stylelint.strictValues.properties`, `ignoreValues`                 | `stylelint-undeclared-config-entry`     | `npm run auditor:fix` |
| `tsconfig.json`       | `validate_tsconfig`             | `config.paths.ignoreGlobs`, `config.paths.dataRoots`                       | `tsconfig-undeclared-config-entry`      | `npm run auditor:fix` |
| `.htmlvalidate.json`  | `validate_html_validate_config` | `config.htmlValidate.rules`, `disabledRules`, `extraPlugins`               | `html-validate-undeclared-config-entry` | `npm run auditor:fix` |
| `.markdownlint.json`  | `validate_markdown_lint_config` | `config.documentation.markdownLint.rules`, `disabledRules`                 | `markdownlint-undeclared-config-entry`  | `npm run auditor:fix` |

---

## 2. Forensic Case Study: Anti-Pattern in `poekborrador`

In conversation [`poekborrador`](conversation://5e1a6657-8469-43ea-abd4-fbf454ea2ee6), a failure of agent judgment occurred:

```mermaid
sequenceDiagram
    autonumber
    participant Auditor as @francogp/auditor
    participant Agent as AI Agent (Failing Behavior)
    participant User as Human Programmer
    participant FallowRc as .fallowrc.json (Satellite)

    Auditor->>Agent: fallow-workspace-diagnostic: 7 redundant ignore entries
    Note over Agent: Anti-Pattern: Agent treats .fallowrc.json as editable source code
    Agent->>User: Drafts plan: "Requesting authorization to edit .fallowrc.json manually"
    User->>Agent: Confused: "no entendí, ¿ahora fallow va a analizar eso?"
    Agent->>FallowRc: Performs manual edit_file on .fallowrc.json
    Note over Auditor,FallowRc: VIOLATION: Bypassed validate_fallow_config native auto-fix!
```

### What Went Wrong

1. **Unnecessary Manual Plan**: The agent drafted a plan proposing manual removal of lines in `.fallowrc.json`, asking the human for permission.
2. **Induced User Confusion**: The human programmer wondered if removing ignore entries meant Fallow would now analyze unneeded files or introduce new errors.
3. **Bypassing the Setup Engine**: The sub-auditor `ValidateFallowConfigAuditor` in `phase: 'setup'` **already had automated repair capabilities** (`fixable: true`). Running `npm run auditor:fix` would have pruned those redundant entries in milliseconds cleanly and idempotently, with zero manual touches and zero cognitive load on the user.

---

## 2.1 Forensic Case Study: Proxy Script Bypass Anti-Pattern & The `vite.plugins.ts` Architecture

In another critical incident, an AI agent encountered TypeScript type recursion in `vite.config.ts`:
`error TS2321: Excessive stack depth comparing types 'Plugin<any>' and 'Plugin<any>'`.

When the agent attempted to edit `vite.config.ts` directly, the PreToolUse hook (`prevent_destructive_git.js`) aborted the operation, explaining that `vite.config.ts` is an auditor-governed satellite configuration file.

Instead of investigating genuine architectural solutions or running `npm run auditor:fix`, the agent created a temporary proxy script in `scratch/update_vite.js` using Node.js filesystem calls to write to `vite.config.ts` behind the hook's back.

### Architectural Flaws of the Bypass Attempt

1. **Safety Hook Subversion**: Creating scripts in `scratch/`, temporary folders, or brain directories to mutate governed files violates the fundamental principle of architectural sovereignty and audit traceability.
2. **Misplaced Responsibilities**: `vite.config.ts` needs to be governed for toolchain consistency (`vp check`, `vp lint`, `vp test`), but developers and AI agents genuinely need the freedom to add, configure, and maintain Vite plugins (`@vitejs/plugin-vue`, `vite-plugin-pwa`, `basicSsl`, etc.) without satellite permission denials or TypeScript recursion depth issues.

### The Canonical Architectural Resolution

- **Modular Plugin Delegation (`vite.plugins.ts`)**: Application plugins belong in a dedicated module `vite.plugins.ts`, which is 100% developer/AI-owned and directly editable.
- **Auditor Governance in `vite.config.ts`**: `vite.config.ts` remains auditor-governed, importing `{ plugins } from './vite.plugins.ts'`.
- **Automated AST Migration via `npm run auditor:fix`**: Inline plugins detected in `vite.config.ts` (`vite-plus-inline-plugins-detected`) are automatically moved to `vite.plugins.ts`. The AST engine automatically relocates local plugin helper functions (`isPluginFunctionDeclaration`), associated variables, and purges unused Vite+ types (`type Plugin`, `type HmrContext`) from `vite.config.ts`, completely preventing `no-unused-vars` and resolving `TS2321` deterministically.
- **PreToolUse Hook Invariance Mandate**: Root `AGENTS.md` explicitly forbids attempting to bypass or evade hooks via proxy scripts.

### 2.2 Typing Third-Party Vite Plugins Cleanly in `vite.plugins.ts` (Avoiding `TS2321` & Loose Casts)

When third-party Vite plugins (such as `vite-plugin-pwa`, `@vitejs/plugin-basic-ssl`, or legacy Rollup plugins) bundle their own internal `@types/vite` definitions that diverge slightly from `vite-plus`, exporting an untyped `export const plugins = [...]` array can re-trigger `TS2321` (`Excessive stack depth comparing types 'Plugin<any>' and 'Plugin<any>'`), while casting individual plugins as `as unknown` or `as any` violates `@francogp/domain-type` and `typescript/no-explicit-any`.

**Canonical Typing Pattern in `vite.plugins.ts`**:
Annotate the exported `plugins` constant explicitly as `PluginOption[]` imported from `'vite-plus'` (which is the exact contract generated by the Auditor's AST plugin extractor):

```typescript
import { vitePrecompressPlugin } from '@francogp/auditor';
import vue from '@vitejs/plugin-vue';
import type { PluginOption } from 'vite-plus';

export const plugins: PluginOption[] = [
  vue(),
  vitePrecompressPlugin({
    server: 'nginx',
    spa: true,
    report: 'summary',
    threshold: 512
  })
];
```

If a third-party plugin factory returns a structurally incompatible legacy `Plugin` overload, wrap it in a small typed helper returning `PluginOption` inside `vite.plugins.ts` rather than touching `vite.config.ts` or using `any`.

---

## 3. Categorical Prohibition on Manual Satellite Configuration Plans

AI agents, developers, and architectural planning workflows (`/plan`, `/brainstorming`, `/architecture`, `/code-review`) are **STRICTLY AND CATEGORICALLY PROHIBITED** from:

- Creating work plans or task lists that propose manual edits to satellite configurations (`.fallowrc.json`, `vite.config.ts`, `.stylelintrc.json`, etc.).
- Calling `write_file` or `edit_file` on satellite configuration files.
- Asking the user for permission to edit satellite configuration files directly.
- Bypassing, evading, or creating proxy scripts in `scratch/`, brain directories, or temporary paths to mutate satellite configuration files.

### Permitted vs Prohibited Matrix

| Action                                           | Status            | Canonical Path                                                               |
| ------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------- |
| Manually editing `.fallowrc.json`                | ❌ **PROHIBITED** | Run `npm run auditor:fix`                                                    |
| Proposing in `/plan` to alter `.fallowrc.json`   | ❌ **PROHIBITED** | Plan must instruct running `npm run auditor:fix`                             |
| Manually modifying `vite.config.ts` blocks       | ❌ **PROHIBITED** | Run `npm run auditor:fix` (via `validate_vite_plus_config`)                  |
| Manually modifying `.stylelintrc.json`           | ❌ **PROHIBITED** | Run `npm run auditor:fix` (via `validate_stylelint_config`)                  |
| Adding/editing Vite plugins in `vite.plugins.ts` | ✅ **PERMITTED**  | Edit `vite.plugins.ts` directly (100% developer/AI owned)                    |
| Running proxy scripts to bypass safety hooks     | ❌ **PROHIBITED** | Violates PreToolUse Hook Invariance Mandate                                  |
| Adding an exemption path to `audit.config.ts`    | ✅ **PERMITTED**  | Edit `.auditor/audit.config.ts` (consult human first if altering boundaries) |
| Running official auto-fixers                     | ✅ **MANDATORY**  | `npm run auditor:fix`                                                        |

---

## 4. The 3-Step Canonical Workflow for Configuration Adjustments

Whenever a developer or AI agent encounters a legitimate architectural requirement that affects a satellite tool (for example, configuring an exempt directory, adding a custom domain alias, or tuning nesting depth):

```mermaid
flowchart TD
    A["1. Need Architectural Adjustment?"] --> B{"Requires Policy / Exemption Change?"}
    B -- Yes --> C["Consult Programmer via ask_question<br/>(Explain pros, cons, and trade-offs)"]
    C --> D["Declare Change in .auditor/audit.config.ts<br/>(The SOLE Single Source of Truth)"]
    B -- No / Diagnostic Warning --> E["Run npm run auditor:fix<br/>(Auditor syncs & repairs all satellites)"]
    D --> E
    E --> F["Verify with npm run auditor:lint & npm test"]
```

### Step 1: Consult the Human Programmer (if altering governance)

If the change alters architecture boundaries, rules, or exemptions, present a technical justification with pros and cons via `ask_question`.

### Step 2: Edit ONLY `.auditor/audit.config.ts`

Declare the desired change in the appropriate section of `.auditor/audit.config.ts`. Never touch any satellite file.

### Step 3: Run `npm run auditor:fix`

The Auditor's setup suites (`phase: 'setup'`) execute in deterministic order (`resolveFixOrderWeight < 200`), reading `.auditor/audit.config.ts` and synchronizing `.fallowrc.json`, `vite.config.ts`, `.stylelintrc.json`, and `tsconfig.json` automatically.

### 4.1 Granular File-Scoped Linter Overrides (`vitePlusConfig.lint.overrides`) vs. Global Rule Disablement

Inline suppression directives (`eslint-disable`, `oxlint-disable`) are strictly forbidden across the repository (`oxlint-forbidden-suppression`), and disabling a strict rule globally in `vitePlusConfig.lint.rules` weakens safety for unrelated modules.

When a specific module intentionally implements an architectural contract that triggers a non-anti-castration rule — for example, a fluent database query builder (`src/db/proxyQuery.ts`, `src/db/sqliteQueryBuilder.ts`) implementing `PromiseLike<T>` (`.then()`) and triggering `unicorn/no-thenable` — use a narrow **file-scoped override** in `.auditor/audit.config.ts`:

1. **Consult the Human Programmer (`ask_question`)**: Explain why the rule triggers on that architectural pattern and request approval for a file-scoped override.
2. **Declare `vitePlusConfig.lint.overrides` in `.auditor/audit.config.ts`**:

```typescript
vitePlusConfig: {
  enabled: true,
  lint: {
    enabled: true,
    overrides: [
      {
        files: ['src/db/proxyQuery.ts', 'src/db/sqliteQueryBuilder.ts'],
        rules: {
          'unicorn/no-thenable': 'off'
        }
      }
    ]
  }
}
```

3. **Run `npm run auditor:fix`**: Projects the narrow override into `vite.config.ts` while keeping `unicorn/no-thenable: 'error'` enforced everywhere else. Never disable core Anti-Castration rules (`no-explicit-any`, `ban-ts-comment`, `@francogp/domain-type/*`).

---

## 5. Upstream Evolution vs Local Patching

If a satellite tool requires a new configuration property or option that `@francogp/auditor` does not currently synchronize:

1. **HALT and DO NOT patch the local satellite file**. Local patches are volatile and will be overwritten or flagged on the next audit run.
2. Report the enhancement to the human programmer to implement the projection in the appropriate setup suite inside `@francogp/auditor` upstream.
3. Once updated upstream, the host project consumes the new feature cleanly via `npm run auditor:update`.

---

## 6. Mandatory Third-Party Satellite Config Explanation Contract

To prevent external tool suites from being integrated without proper configuration governance, every sub-auditor or extension that declares `usesThirdPartyTool: true` is contractually required to declare `explainSatelliteConfig` in its constructor `thirdPartyToolPolicy`:

```ts
thirdPartyToolPolicy: {
  toolName: 'Stylelint',
  fallbackBehavior: 'violation',
  fallbackRuleId: 'stylelint-issue',
  explainSatelliteConfig: () => ({
    configFile: '.stylelintrc.json',
    ssotKey: 'stylelint',
    undeclaredEntryRuleId: 'stylelint-undeclared-config-entry',
    configSuiteId: 'validate_stylelint_config'
  })
}
```

If the third-party tool has no external satellite configuration file (such as `npm audit` in `validate_package_hygiene`), it must declare `explainSatelliteConfig: undefined` explicitly.

Omitting `explainSatelliteConfig` causes `BaseAuditor` and `auditorContractConformance` to fail loudly during instantiation with a blocking runtime error (`throw new Error(...)`).
