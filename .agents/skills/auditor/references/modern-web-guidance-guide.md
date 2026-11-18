# Modern Web Guidance Integration Guide (`/modern-web-guidance`)

`modern-web-guidance` is a **mandatory web development pillar** alongside `@francogp/auditor` for all HTML, CSS/SCSS, Vue SFC, Accessibility, Web Performance, Security, and client-side DOM/JS tasks, as well as whenever the user asks `/auditor` to audit or suggest improvements for web/UI codebases.

---

## 1. Plugin Availability & IDE Installation / Activation

Before running web/UI audits or improvements, verify whether `/modern-web-guidance` is available in your active skills/plugins (`~/.gemini/config/plugins/modern-web-guidance-plugin`):

1. **If the plugin is NOT installed**:
   - Search the Agent Marketplace with `search_marketplace` (`queries: ["modern-web-guidance", "modern web"]`) and present the `<plugin-card>` so the user can install it in one click.
   - Instruct the user that they can also install it manually in the IDE **Plugins Manager** (`Plugins` panel -> search `modern-web-guidance-plugin` -> **Install**).
2. **If the plugin is installed but disabled**:
   - Instruct the user to open the IDE **Plugins Manager**, locate `modern-web-guidance-plugin`, and toggle it **Enabled**.
3. **Fallback if the user wants to run the CLI immediately**:
   - Even before plugin activation, the CLI tools can be executed via `npm exec --yes -- modern-web-guidance@latest <subcommand>` (requires outbound network on first fetch; use `npm exec --offline -- modern-web-guidance@latest ...` if already cached). Never invoke npx.

---

## 2. Internal CLI Tools & Execution Rules (Zero `npx`)

In projects governed by `@francogp/auditor`, always invoke the `modern-web-guidance` CLI through `npm exec` (never npx):

### Tool 1: `search "<query>"` — Targeted Capability Discovery

Run **first** before writing or refactoring UI/web code. Use a **2–5 word action-oriented English query** for a single web platform capability, omitting framework/library names (`Vue`, `Pinia`, `Tailwind`) and app nouns:

```bash
npm exec --yes -- modern-web-guidance@latest search "light dismiss dialog"
npm exec --yes -- modern-web-guidance@latest search "responsive data table"
```

- Returns `[{ "id", "description" }, ...]`.
- If `search` returns `[]` or unrelated results, rephrase once with the concrete HTML/CSS/UI noun (e.g., `dialog`, `popover`, `table`, `form`) or fall back to `list`.

### Tool 2: `retrieve "<id1>,<id2>"` — Full Best-Practice Guides

Once `search` (or `legacy-scan`) identifies relevant `id`s, retrieve both the specific use-case guide(s) and applicable discipline guide(s) (`html`, `css`, `forms`, `accessibility`, `color`, `performance`, `security`):

```bash
npm exec --yes -- modern-web-guidance@latest retrieve "dialog,accessibility"
```

- If `retrieve` writes output > 9.5 KB to a temporary file, read that file in full with `read_file`.

### Tool 3: `list` — Broad Catalog Audit Fallback

Use `list` when `search` returns weak/empty results or during a broad UI audit to inspect all available guide IDs:

```bash
npm exec --yes -- modern-web-guidance@latest list
```

### Tool 4: `legacy-scan <path> --json` — Codebase Modernization Audit

Run **during broad web audits, open-ended codebase modernization, or improvement-advice requests** alongside `@francogp/auditor` scripts (`auditor`, `auditor:magic`, `auditor:motion`, `auditor:config`):

```bash
npm exec --yes -- modern-web-guidance@latest legacy-scan src --json
```

**Mandatory 4-Step Verification Loop for `legacy-scan`**:
1. **Scan**: Execute `legacy-scan <path> --json` on the target web directory (e.g. `src` or `src/components`).
2. **Verify**: Evaluate every finding against its `keepWhen` / `dropWhen` rubric; discard false positives (browser fallbacks, cross-file helpers, vendor code).
3. **Retrieve & Report**: Call `retrieve "<guide-id>"` for each verified finding and include it in your Improvement Plan / audit report alongside `@francogp/auditor` findings (noting that `legacy-scan` covers ~20% of the catalog with deterministic rules).
4. **Modernize & Re-scan**: When applying improvements, preserve required fallbacks from the retrieved guide and re-run `legacy-scan <path> --json` on modified files to confirm resolution.

---

## 3. Mandatory Integration with `/auditor` Workflows

| User Request / Auditor Trigger | Required `auditor` Scripts | Required `/modern-web-guidance` Actions |
| :--- | :--- | :--- |
| **Web / UI Audit** (`validate_accessibility`, `validate_web_performance`, `validate_component_styles`, `validate_html_validate`) | `npm run auditor` / `npm run auditor:next` | Run `search` + `retrieve` for any failing UI/CSS/DOM domain, or `legacy-scan src --json` for broad frontend audits. |
| **Improvement Advice & Refactoring** (`auditor:config`, `auditor:motion`, `auditor:magic`, "qué mejoras recomiendas") | `npm run auditor:config` / `auditor:magic discover` / `auditor:motion discover` | Run `legacy-scan src --json` + `search`/`retrieve` for relevant UI primitives (`dialog`, `popover`, `forms`, `performance`, `css`) so recommendations reflect modern Baseline Web standards. |
| **Building or Fixing Web UI** (`.vue`, `.html`, `.scss`, client `.ts`) | `npm run auditor:lint` | Run `search` + `retrieve` **first**, adapt vanilla HTML/CSS/JS patterns to Vue 3 (`showModal()` via template refs, `:root`/`@starting-style` unscoped), and respect Baseline fallback policies. |

### Response Disclosure Requirement

Whenever `/modern-web-guidance` shapes code or improvement advice, include a concise `### Modern Web Guidance` summary listing the applied `<id>`s (e.g., `dialog`, `css`, `accessibility`) and key rules/fallbacks applied, or state which topics were checked if none applied.
