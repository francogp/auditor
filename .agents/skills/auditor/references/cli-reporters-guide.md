# Interactive Findings Reporter (`report_findings.ts`) & CLI Diagnostics

This reference provides the comprehensive CLI manual, filtering parameters, and diagnostic options supported by `@francogp/auditor` reporting tools.

---

## 1. Supported CLI Options & Flags

| Flag / Parameter | Description | Example Usage |
| :--- | :--- | :--- |
| `rules` / `by-rule` | Renders a consolidated Box-Drawing table of findings grouped and sorted by rule ID (`ruleId`) with `TOTAL CONSOLIDADO`. | `npm run auditor:rules` o `npm run auditor:findings rules` |
| `rule=<id>` / `ruleId=<id>` | Filters findings strictly by rule identifier or rule description. | `npm run auditor:findings rule=domain-naked-string-primitive` |
| `flat` / `raw` | Emits an exhaustive line-by-line list of findings (`file:line [ruleId] message`) without truncating to sample limits. | `npm run auditor:findings file=src/combat.ts flat` |
| `file=<path1>,<path2>` | Filters by one or more comma-separated file paths or substrings. | `npm run auditor:findings file=combat.ts,items.ts` |
| `partial` | Allows inspecting partial runs (non-blocking by default; warns with executed suite count). | `npm run auditor:findings partial dir=src/` |
| `breakdown` / `by-dir` / `dirs` | Renders a consolidated Box-Drawing table of findings grouped by directory/scope with `TOTAL CONSOLIDADO`. | `npm run auditor:findings breakdown` |
| `dir=<path>` / `folder=<path>` | Filters findings by directory or file path substring across both category breakdown tables and finding samples. | `npm run auditor:findings dir=src/` |
| `scope=<host\|packages\|all>` | Isolates application code (`host`) from reusable engine code (`packages`) in category tables and sample lists. | `npm run auditor:findings scope=host` |
| `category=<name>` / `<name>` | Filters by rule or category name. | `npm run auditor:findings category=seguridad` |
| `files` | Lists affected files sorted by error density with category banners and total sums. | `npm run auditor:findings category=cwe files top=10` |
| `stale` / `allow-stale` | Bypasses the freshness check for investigative read-only inspection. | `npm run auditor:findings breakdown stale` |
| `severity=<error\|warning\|all>` | Filters findings by severity level (`error`, `warning`, `all`). | `npm run auditor:findings severity=error` |
| `top=<N\|all>` | Limits displayed items (default: 20). | `npm run auditor:findings top=all` |
| `search=<term>` | Searches within finding messages and context snippets. | `npm run auditor:findings search=token` |
| `json` | Emits structured JSON including `breakdownByDir` and `files` maps. | `npm run auditor:findings json` |

---

## 2. Official NPM Reporter Scripts

All inspection routines MUST use the official NPM scripts declared in `package.json`. Creating ad-hoc scratch scripts (`scratch/analyze_...`) or executing `node -e` one-liners is **STRICTLY PROHIBITED**:

- `npm run auditor:rules` / `npm run auditor:by-rule`: Dedicated reporter grouping and sorting all findings by rule ID with `TOTAL CONSOLIDADO`.
- `npm run auditor:findings`: Primary findings reporter with full filtering capabilities (`rule=...`, `file=...`, `flat`, `dir=...`, `search=...`, `category=...`, `top=...`, `json`).
- `npm run auditor:by-file`: Hierarchical tree findings reporter grouped by file and line.
- `npm run auditor:errors`: Preset filtering strictly to errors (`severity=error`).
- `npm run auditor:warnings`: Preset filtering strictly to warnings (`severity=warning`).
- `npm run auditor:summary`: Compact summary overview of latest audit results.
- `npm run auditor:files`: Table of affected files sorted by violation count.
- `npm run auditor:update` / `auditor-update`: Dedicated CLI updater executing hermetic npm update, timestamp verification, and Box-Drawing summary table.
- `npm run auditor:version` / `auditor-version -v`: Displays the active package version, build timestamp, and ISO date metadata.
- `npm run auditor:coverage` / `auditor:test-coverage`: Istanbul/C8 test coverage report with threshold verification.
- `npm run auditor:coverage-map`: Full test coverage heatmap and uncovered file tracer.
- `npm run auditor:css`: Stylelint CSS/SCSS duplication and orphan token reporter.
- `npm run auditor:flags`: Feature flags status and dead code analyzer.
- `npm run auditor:guard`: Architectural boundary and dependency graph gating.
- `npm run auditor:similar`: Semantic and structural clone detection using local Fallow vector embeddings (Box-Drawing table, threshold filter `--threshold <N>`).
- `npm run auditor:review`: Graph-grounded architectural review brief for changed files against base branch via Fallow code-review graphs.
- `npm run auditor:dupes` / `auditor-dupes`: Dedicated clone discovery, Dirac micro-context extraction, and safe worktree refactoring CLI (`inspect <fingerprint>`, `apply <plan.json> --worktree`).
- `npm run auditor:magic` / `auditor-magic`: Polyglot magic numbers and design tokens discovery, Value-Clustering Super-Dirac compression, and AST refactoring CLI (`inspect --file=<path>`, `apply --plan=<plan.json>`).
- `npm run auditor:motion` / `auditor-motion`: UI animation governance and GSAP refactoring CLI (`discover`, `inspect --file=<path>`, `apply --plan=<plan.json> --worktree`).
- `npm run auditor:o1` / `auditor-o1`: O(1) data structure optimizer and linear search refactoring CLI (`discover`, `inspect --file=<path>`, `apply --plan=<plan.json> --worktree`).
- `npm run auditor:types` / `auditor-types`: Type assertions, loose any, and explicit return type refactoring CLI (`discover`, `inspect <file>`, `apply <plan.json> --worktree`).
- `npm run auditor:domain` / `auditor-domain`: Domain types, naked string parameters, and branded IDs refactoring CLI (`discover`, `inspect <file>`, `apply <plan.json> --worktree`).

---

## 3. Suite Execution States & Transparent `SKIP` Reporting

The auditor streaming runner (`streamingRunner.ts`) and summary tables display 4 explicit execution states:

| Status Badge | Color | Description |
| :--- | :--- | :--- |
| `✅ PASS` | Green | Suite completed successfully with 0 errors and 0 warnings. |
| `⚠️  WARN` | Yellow | Suite completed with warnings but 0 blocking errors. |
| `❌ FAIL` | Red | Suite encountered one or more blocking architectural violations (`severity: 'error'`). |
| `⏭️  SKIP` | Cyan | Suite was intentionally bypassed (via environment guard, configuration, or fast preset). Displays reason and suite thematic icon. |

### Vector Semantic Duplication Governance (`validate_similar_code`)

- **No CLI Skip Flags**: There is no CLI flag (`--skip-similar` or `--skip-similar-code`) to bypass similar-code vector analysis.
- **Fast Local Execution**: Executes on Candle CPU in ~2s leveraging persistent disk cache (`%LOCALAPPDATA%\fallow\similar-code` on Windows, `~/.cache/fallow/similar-code` on Linux).
- **Production Environment Guard (`AUDITOR_ENV=production` / `npm run build:deploy`)**: Bypassing vector analysis and test coverage is strictly and exclusively reserved for headless production builds, Docker containers, and remote CI/deploy workflows (e.g. GitHub Pages deploy). It is strictly forbidden in local development or interactive agent turns. When active in production, it transparently renders `⏭️  SKIP` with justification rather than masking as passed.
