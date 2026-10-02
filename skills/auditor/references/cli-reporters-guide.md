# Interactive Findings Reporter (`report_findings.ts`) & CLI Diagnostics

This reference provides the comprehensive CLI manual, filtering parameters, and diagnostic options supported by `@francogp/auditor` reporting tools.

---

## 1. Supported CLI Options & Flags

| Flag / Parameter | Description | Example Usage |
| :--- | :--- | :--- |
| `partial` | Allows inspecting partial runs (e.g. `npm run audit suites=audit_project`, `npm run audit:lint`) without failing the full-audit completeness check. Displays an informative partial-mode warning banner with executed suite count. | `npm run audit:findings partial dir=src/` |
| `breakdown` / `by-dir` / `dirs` | Renders a consolidated Box-Drawing table of findings grouped by directory/scope with `TOTAL CONSOLIDADO`. | `npm run audit:findings breakdown` |
| `dir=<path>` / `folder=<path>` | Filters findings by directory or file path substring across both category breakdown tables and finding samples. | `npm run audit:findings partial dir=src/` |
| `scope=<host\|packages\|all>` | Isolates application code (`host`) from reusable engine code (`packages`) in category tables and sample lists. | `npm run audit:findings scope=host` |
| `category=<name>` / `<name>` | Filters by rule or category name. | `npm run audit:findings category=seguridad` |
| `files` | Lists affected files sorted by error density with category banners and total sums. | `npm run audit:findings category=cwe files top=10` |
| `stale` / `allow-stale` | Bypasses the 5-minute freshness check for investigative read-only inspection. | `npm run audit:findings breakdown stale` |
| `severity=<error\|warning\|all>` | Filters findings by severity level (`error`, `warning`, `all`). | `npm run audit:findings severity=error` |
| `top=<N\|all>` | Limits displayed items (default: 20). | `npm run audit:findings top=all` |
| `search=<term>` | Searches within finding messages and context snippets. | `npm run audit:findings search=token` |
| `skip-similar` / `--skip-similar` | Completely bypasses Fallow similar-code vector duplication analysis during GitHub Pages or CI builds (or via `AUDIT_SKIP_SIMILAR=1`), avoiding heavy AI model downloads and timeouts. | `npx auditor --skip-similar` |
| `json` | Emits structured JSON including `breakdownByDir` and `files` maps. | `npm run audit:findings json` |

---

## 2. Official NPM Reporter Scripts

All inspection routines MUST use the official NPM scripts declared in `package.json`:
- `npx auditor-update` / `npm run auditor:update`: Dedicated CLI updater executing hermetic npm update, timestamp verification, and Box-Drawing summary table.
- `npx auditor-version -v`: Displays the active package version, build timestamp, and ISO date metadata.
- `npm run audit:findings`: Primary findings reporter with full filtering capabilities (`partial`, `dir=...`, `search=...`, `category=...`, `top=...`, `json`).
- `npm run audit:errors`: Preset filtering strictly to errors (`severity=error`).
- `npm run audit:warnings`: Preset filtering strictly to warnings (`severity=warning`).
- `npm run audit:summary`: Compact summary overview of latest audit results.
- `npm run audit:similar`: Semantic and structural clone detection using local Fallow vector embeddings (Box-Drawing table, threshold filter `--threshold <N>`).
- `npm run audit:review`: Graph-grounded architectural review brief for changed files against base branch via Fallow code-review graphs.
