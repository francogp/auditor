# Interactive Findings Reporter (`report_findings.ts`) & CLI Diagnostics

This reference provides the comprehensive CLI manual, filtering parameters, and diagnostic options supported by `@francogp/auditor` reporting tools.

---

## 1. Supported CLI Options & Flags

| Flag / Parameter | Description | Example Usage |
| :--- | :--- | :--- |
| `partial` | Allows inspecting partial runs (e.g. `npm run auditor suites=audit_project`, `npm run auditor:lint`) without failing the full-audit completeness check. Displays an informative partial-mode warning banner with executed suite count. | `npm run auditor:findings partial dir=src/` |
| `breakdown` / `by-dir` / `dirs` | Renders a consolidated Box-Drawing table of findings grouped by directory/scope with `TOTAL CONSOLIDADO`. | `npm run auditor:findings breakdown` |
| `dir=<path>` / `folder=<path>` | Filters findings by directory or file path substring across both category breakdown tables and finding samples. | `npm run auditor:findings partial dir=src/` |
| `scope=<host\|packages\|all>` | Isolates application code (`host`) from reusable engine code (`packages`) in category tables and sample lists. | `npm run auditor:findings scope=host` |
| `category=<name>` / `<name>` | Filters by rule or category name. | `npm run auditor:findings category=seguridad` |
| `files` | Lists affected files sorted by error density with category banners and total sums. | `npm run auditor:findings category=cwe files top=10` |
| `stale` / `allow-stale` | Bypasses the 5-minute freshness check for investigative read-only inspection. | `npm run auditor:findings breakdown stale` |
| `severity=<error\|warning\|all>` | Filters findings by severity level (`error`, `warning`, `all`). | `npm run auditor:findings severity=error` |
| `top=<N\|all>` | Limits displayed items (default: 20). | `npm run auditor:findings top=all` |
| `search=<term>` | Searches within finding messages and context snippets. | `npm run auditor:findings search=token` |
| `json` | Emits structured JSON including `breakdownByDir` and `files` maps. | `npm run auditor:findings json` |

---

## 2. Official NPM Reporter Scripts

All inspection routines MUST use the official NPM scripts declared in `package.json`:
- `npm run auditor:update` / `auditor-update`: Dedicated CLI updater executing hermetic npm update, timestamp verification, and Box-Drawing summary table.
- `npm run auditor:version` / `auditor-version -v`: Displays the active package version, build timestamp, and ISO date metadata.
- `npm run auditor:findings`: Primary findings reporter with full filtering capabilities (`partial`, `dir=...`, `search=...`, `category=...`, `top=...`, `json`).
- `npm run auditor:errors`: Preset filtering strictly to errors (`severity=error`).
- `npm run auditor:warnings`: Preset filtering strictly to warnings (`severity=warning`).
- `npm run auditor:summary`: Compact summary overview of latest audit results.
- `npm run auditor:similar`: Semantic and structural clone detection using local Fallow vector embeddings (Box-Drawing table, threshold filter `--threshold <N>`).
- `npm run auditor:review`: Graph-grounded architectural review brief for changed files against base branch via Fallow code-review graphs.

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
- **Environment Variable Guard**: Bypassing vector analysis via `AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1` (or `AUDIT_SKIP_SIMILAR=1`) is strictly reserved for headless remote CI/deploy workflows (e.g. GitHub Pages deploy). It is strictly forbidden in local development or interactive agent turns. When active in remote CI, it transparently renders `⏭️  SKIP` with justification rather than masking as passed.

