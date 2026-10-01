# Trace Ingestion & Bug Triage Guide

This reference document details the operational protocols for ingesting, parsing, and triaging bug reports and execution traces across TypeScript and Node.js applications.

---

## 1. Trace Sources & Extraction Protocols

Bugs arrive through three distinct channels: Vitest automated test suite failures, calculation / parser tolerance anomalies, or manual/verbal developer reports.

### A. Vitest Test Suite Failures

When automated tests fail (`npm run test`, `npm run test:unit`, `npm run test:node`):

1. **Failure Artifacts (`scratch/test-results/`)**:
   - Inspect console output, error assertion deltas, and failure stack traces.
2. **Trace Analysis**:
   - For calculation errors: verify expected vs received numeric values and check delta against `TOLERANCE = 0.011`.
   - For store/component tests: check Vue reactivity, Pinia actions, and DOM selector state.

### B. Formula Calculation & Parser Desyncs

When a fuzzer or replayer crashes (`npm run billing:verify` or `npm run test`):

1. **Calculation Input Snapshot**:
   - Extract the static case parameters:
     - `tariffId`: Canonical tariff ID being evaluated.
     - `kwh`: Consumed active energy and reactive energy readings.
     - `period`: Billing month and year.
     - `reading`: Meter input values and power factors.
2. **Loud Calculation Error**:
   - Read the exact un-truncated error message or tolerance delta to isolate the failing formula step.

### C. Manual or Verbal Bug Reports

When a user reports a bug verbally without a stack trace (e.g. *"Residential tariff fixed charge is miscalculating on Tier 2"*):

1. **Pre-Execution Check**: DO NOT immediately change code.
2. **Request Minimal Context**: Prompt the user for the 3 minimal missing items:
   - **Step-by-step reproduction sequence**: What inputs were provided?
   - **Tariff & Category context**: Tariff ID, voltage level, customer category.
   - **Observed behavior vs Expected behavior**: Exact calculation result vs official invoice amount.

### D. Database & Persistence Failures (Supabase Triage)

When a failure involves storage, SQL migrations, schemas, query builders, or persistence roundtrips:

1. **Identify the Storage Boundary**:
   - Remote Supabase / PostgreSQL (Local Docker or Remote host).
   - Dynamic client connector (`src/logic/db/supabase.ts`).
2. **Determine Failure Category**:
   - **PostgreSQL-Specific Pitfalls**: Undeclared PL/pgSQL variables, missing RLS policies, double-stringified JSONB scalars, or unique constraint conflicts.
   - **Connection Pitfalls**: Supabase host unreachable or invalid anon key.
3. **Inspect Active Database Traces**:
   - Check `scratch/audits/latest_audit.json` for persistence auditor warnings.
   - Extract raw SQL statement, error code, and error details.

---

## 2. DOX Contract Mapping (`dox-navigator`)

Before touching any code or formulating hypotheses, identify the authoritative contract governing the failing component:

1. **Walk the DOX Hierarchy**:
   - From repository root `AGENTS.md`, navigate down to the owning directory:
     - Billing engine & formula logic: `src/logic/AGENTS.md`
     - Global stores: `src/stores/AGENTS.md`
     - UI views: `src/views/AGENTS.md`
     - Persistence & Supabase: `supabase/AGENTS.md` / `src/logic/db/AGENTS.md`
2. **Consult DOX Guidelines**:
   - Verify `AGENTS.md` for 1:1 legacy calculation precision, zero fallbacks, and `/domain-type-first`.

---

## 3. Pre-Fix Fallback Audit

Before writing tests or modifying `src/`, inspect the execution path:
- Search for masking fallbacks (`||`, `??`, default assignments, or `.catch(() => true)`).
- If present, remove them immediately so that the test harness and engine fail fast and loudly with an explicit, traceable error message.
