# Verification & Repair Loop Protocol

This reference document defines the closed-loop execution rules, iteration limits, and regression verification gates for the systematic debugging workflow.

---

## 1. The Closed-Loop Repair Cycle

```mermaid
flowchart TD
    Reproduce["1. Reproduce: Run Unit Test (Confirm RED)"] --> Diagnose["2. Pre-Fix Audit & Fix src/"]
    Diagnose --> VerifyUnit["3. Run Unit Test -> GREEN?"]
    VerifyUnit -- "No (Still RED)" --> AttemptCheck{"Attempts < 5?"}
    AttemptCheck -- "Yes" --> Increment["Increment Attempt Counter"] --> Diagnose
    AttemptCheck -- "No (5 Reached)" --> AbortBlocked["Halt: Emit Blocked Status Report"]
    VerifyUnit -- "Yes (GREEN)" --> RunNodeRegression["4. Run Regression Suite: npm test"]
    RunNodeRegression -- "Fail" --> Diagnose
    RunNodeRegression -- "Pass (0 Regressions)" --> CheckTier3{"E2E / Integration Affected?"}
    CheckTier3 -- "No" --> LintAndDox["5. Lint & DOX Pass: npm run lint && npm run audit:md"]
    CheckTier3 -- "Yes" --> RunPlaywright["5. Run E2E: npm run test:e2e"]
    RunPlaywright -- "Pass" --> CleanZeroPass["6. Step 6B: Verification Pass"]
    CleanZeroPass -- "Pass" --> LintAndDox
    LintAndDox --> Done(["Bug Fully Certified & Fixed!"])
```

---

## 2. Iteration Counter & Escalation Cap (5-Attempt Limit)

To prevent infinite loops and token waste:

1. **Attempt Tracking**: Maintain an explicit attempt counter (`attempt = 1..5`).
2. **Cap Reached (Attempt 5 Failure)**:
   - If after 5 distinct repair attempts the reproduction test does not turn GREEN or new regressions persist, execution MUST IMMEDIATELY HALT.
3. **Blocked Status Report**: Emit a clear structured report:
   ```markdown
   ### 🛑 Debugging Blocked: Max Iterations Reached (5/5)

   **Bug Under Investigation**: [Brief summary]
   **Failing Test**: `tests/node/.../reproduce_xxx.test.ts`

   **Hypotheses & Fixes Attempted**:
   1. *Attempt 1*: [Summary of approach and resulting error]
   2. *Attempt 2*: [Summary]
   3. *Attempt 3*: [Summary]
   4. *Attempt 4*: [Summary]
   5. *Attempt 5*: [Summary]

   **Current Blocker**: [Why the root cause resists repair]
   **Next Steps / User Input Requested**: [Specific architectural question or recommendation]
   ```

---

## 3. Post-GREEN Regression Verification Pipeline

Once Tier 1 turns GREEN, verify all layers sequentially:

### Step 1: Full Node Unit Regression Check
Run the complete test suite to guarantee 0 regressions across the codebase:
```bash
npm test
```
If any unrelated test fails, it is an empirical regression caused by the edit in `src/`. Re-enter the repair loop immediately.

**Database-Specific Step 1 Pass**:
If the bug touched persistence, database migrations, or SQL schemas:
1. Confirm the reproduction test runs and passes GREEN against the configured database engine.
2. Validate SQL migration syntax and schema integrity:
   ```bash
   npm run audit:family:persistence
   ```

### Step 2: UI & Component Interaction Verification
If the bug affected UI, GSAP animations, or view interactions:
1. Run component and view tests:
   ```bash
   npm test
   ```

### Step 3: Fast Quality Gate & DOX Pass
1. **Fast Development Lint**:
   ```bash
   npm run lint
   ```
   Ensures domain types, vue-tsc type checking, ESLint, and markdownlint pass cleanly.
2. **Documentation & DOX Audit**:
   ```bash
   npm run audit:md
   ```
3. **DOX Lesson Update (`dox-navigator`)**:
   Update the nearest owning `AGENTS.md` file with the lesson learned, contract clarification, or invariant established by this fix.
