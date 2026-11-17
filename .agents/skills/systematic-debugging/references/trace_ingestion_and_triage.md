# Trace Ingestion & Bug Triage Guide

This reference document details the operational protocols for ingesting, parsing, and triaging bug reports and execution traces across TypeScript and Node.js applications.

---

## 1. Trace Sources & Extraction Protocols

Bugs arrive through three distinct channels: Vitest automated test suite failures, calculation / parser tolerance anomalies, or manual/verbal developer reports.

### A. Automated Test Suite Failures

When automated tests fail (`vp test run`, `npm test`, or `npm run test`):

1. **Failure Artifacts (`scratch/test-results/`)**:
   - Inspect console output, error assertion deltas, and failure stack traces.
2. **Trace Analysis**:
   - For calculation or assertion errors: verify expected vs received values and tolerance boundaries.
   - For store/component tests: check reactivity, state mutations, and DOM selector state.

### B. Algorithmic, Calculation & Parser Desyncs

When an algorithmic pipeline, fuzzer, or replay test crashes (`vp test run`, `npm test`, or specialized test script):

1. **Input Snapshot**:
   - Extract the static case parameters, inputs, configuration tokens, and payload states that led to the fault.
2. **Loud Calculation Error**:
   - Read the exact un-truncated error message or tolerance delta to isolate the failing pipeline step.

### C. Manual or Verbal Bug Reports

When a user reports a bug verbally without a stack trace (e.g. _"Permission calculation fixed quota is miscalculating on Tier 2"_):

1. **Pre-Execution Check**: DO NOT immediately change code.
2. **Request Minimal Context**: Prompt the user for the 3 minimal missing items:
   - **Step-by-step reproduction sequence**: What inputs were provided?
   - **Entity & Category context**: Entity ID, access level, category.
   - **Observed behavior vs Expected behavior**: Exact calculation result vs expected canonical value.

### D. Database & Persistence Failures (Supabase Triage)

When a failure involves storage, SQL migrations, schemas, query builders, or persistence roundtrips:

1. **Identify the Storage Boundary**:
   - Remote Supabase / PostgreSQL (Local Docker or Remote host) or local SQLite persistence.
   - Canonical persistence router or database client connector configured in the repository.
2. **Determine Failure Category**:
   - **PostgreSQL-Specific Pitfalls**: Undeclared PL/pgSQL variables, missing RLS policies, double-stringified JSONB scalars, or unique constraint conflicts.
   - **Connection Pitfalls**: Supabase host unreachable or invalid anon key.
3. **Inspect Active Database Traces**:
   - Check persistence auditor findings in `latest_audit.json` via official tools (`npm run auditor:findings category=persistence` or `npm run auditor:findings rule=<id>`).
   - Extract raw SQL statement, error code, and error details.

### E. Static Analysis & Auditor Rule Failures

When static verification or audit commands fail (`npm run auditor`, `npm run auditor:lint`):

1. **Strategic Phase Remediation**:
   - Run `npm run auditor:next` to focus exclusively on the earliest active strategic phase (`setup` -> `prune` -> `dedup` -> `contracts` -> `behavior` -> `hygiene` -> `polish`).
   - Postpones downstream findings to eradicate cascading false positives.
2. **Rule Guidance & Drill-Down**:
   - Run `npm run auditor:guide <ruleId>` (or `auditor guide <ruleId>`) to fetch canonical 4-section remediation steps.
   - Run `npm run auditor:findings rule=<ruleId>` or `npm run auditor:by-file` for detailed context.

### F. Playwright & Live Browser Failures

When diagnosing browser, E2E, or live UI bugs:

1. **Missing Browser Binary (`Executable doesn't exist`)**:
   - NEVER abandon Playwright or downgrade to JSDOM/Happy-DOM when Playwright reports a missing browser binary.
   - Run `npm run auditor:fix` (which detects `playwright-browser-missing` in `phase: 'setup'` and installs Chromium automatically) or run `npm exec -- playwright install chromium`. Never invoke npx.
2. **Trace & Artifact Extraction (`scratch/test-results/`)**:
   - Inspect `scratch/test-results/**/error-context.md` for accessibility DOM snapshots at failure time.
   - Inspect `scratch/test-results/**/trace.zip` and screenshots alongside `page.on('console')`, `page.on('pageerror')`, and `page.on('response')` (`status >= 400`).
3. **Active Live Inspection via `/playwright-cli`**:
   - For rapid interactive triage against a running dev server, use `/playwright-cli`:
     ```bash
     npm exec -- playwright-cli open http://localhost:5173
     npm exec -- playwright-cli snapshot
     npm exec -- playwright-cli console
     npm exec -- playwright-cli requests
     npm exec -- playwright-cli close
     ```
   - See [Playwright E2E & Browser Governance Guide](../../auditor/references/playwright-e2e-guide.md) for isolated reproduction templates.

---

## 2. DOX Contract Mapping (`dox-navigator`)

Before touching any code or formulating hypotheses, identify the authoritative contract governing the failing component:

1. **Walk the DOX Hierarchy**:
   - From repository root `AGENTS.md`, navigate down to the owning directory:
     - Core engine & formula logic: `src/logic/AGENTS.md`
     - Global stores: `src/stores/AGENTS.md`
     - UI views: `src/views/AGENTS.md`
     - Persistence & Supabase: `supabase/AGENTS.md` / `src/logic/db/AGENTS.md`
2. **Consult DOX Guidelines**:
   - Verify `AGENTS.md` for canonical calculation precision, zero fallbacks, and `/domain-type-first`.

---

## 3. Pre-Fix Fallback Audit

Before writing tests or modifying `src/`, inspect the execution path:

- Search for masking fallbacks (`||`, `??`, default assignments, or `.catch(() => true)`).
- If present, remove them immediately so that the test harness and engine fail fast and loudly with an explicit, traceable error message.
