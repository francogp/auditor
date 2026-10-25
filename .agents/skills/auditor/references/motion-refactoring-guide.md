# Motion & UI Animation Governance Guide (`auditor-motion`)

> [!IMPORTANT]
> **Distinction Between CI Quality Gate & Interactive Refactor Tool**:
>
> - **`validate_gsap_animations` & `validate_gsap_timelines` (`npm run auditor`)**: CI static verification suites. Audits mandatory UI animation rules in Phase 5 (`behavior`): no raw browser timers (`setTimeout`, `setInterval`) inside UI components/views, no layout-thrashing animations (`top`, `left`, `margin`), and no legacy GSAP easing objects. If CI passes with 0 errors, animation hygiene is intact.
> - **`auditor-motion` (`npm run auditor:motion`)**: Interactive refactoring engine (`BaseRefactorEngine`). Discovers opportunities across the entire codebase to migrate manual transitions to coordinated GSAP timelines, convert layout tweens to GPU transforms (`x`, `y`), and auto-inject `gsap.delayedCall()`.
> - `npm run auditor` **NEVER** runs `auditor:motion`. Candidate proposals in `auditor:motion discover` are elective improvements, not blocking CI failures. See [quality-gates-vs-refactor-engines.md](./quality-gates-vs-refactor-engines.md).

The `auditor-motion` CLI and `MotionRefactorEngine` provide automated detection and deterministic remediation for UI animation hygiene and timing rules governed by `validate_gsap_animations`.

---

## 🎯 Architecture & Guiding Principles

Modern UI animation architecture requires:

1. **Zero Raw Browser Timers in UI Components**: Raw `setTimeout` and `setInterval` bypass test runners that accelerate time via `gsap.globalTimeline.timeScale(100)`, causing flakiness or timeout failures in automated UI tests.
2. **GPU Acceleration Over Layout Thrashing**: Animating layout properties (`top`, `left`, `width`, `height`, `margin*`) forces browser reflows and repaints on every frame (dropping 60 FPS). Animations MUST use GPU-accelerated transforms (`x`, `y`, `scaleX`, `scaleY`), `Flip`, or recognized collapsible height transitions without comment escape hatches.
3. **Canonical Modern Eases**: GSAP v3 requires canonical string eases (`'power1.out'`, `'back.inOut'`) instead of legacy object instances (`Power1.easeOut`).

---

## 🛠️ CLI Tool Usage (`auditor-motion`)

```bash
# Direct CLI invocation (bin in node_modules/.bin)
auditor-motion <command> [options]

# Via package script
npm run auditor:motion <command>
npm run auditor:motion -- <command> [options]
```

### 1. `discover`: Scan Project for Violations

Scans `.ts`, `.js`, and `.vue` files for banned timers, layout properties, and legacy eases:

```bash
npm run auditor:motion discover
npm run auditor:motion discover -- --project ../pokeborrador
```

Renders a standardized 80-column Box-Drawing table with breakdown per file.

### 2. `inspect`: Generate Dirac Micro-Context

Inspects a specific file, extracts line-anchored snippets, and outputs a suggested declarative plan:

```bash
npm run auditor:motion inspect -- --file src/components/Modal.vue
```

### 3. `apply`: Deterministic Plan Execution

Applies a declarative refactoring plan file with optional verification inside an ephemeral Git Worktree:

```bash
# Dry-run / Direct apply
npm run auditor:motion apply -- --plan scratch/motion-plan.json

# Safe execution with Git Worktree verification (build/typecheck passes before modifying host files)
npm run auditor:motion apply -- --plan scratch/motion-plan.json --worktree
```

---

## 📋 Declarative Plan Format (`MotionRefactorPlan`)

```json
{
  "version": 1,
  "planId": "motion-plan-1792352000",
  "targetFiles": ["src/components/Modal.vue"],
  "timerReplacements": [
    {
      "file": "src/components/Modal.vue",
      "line": 42,
      "originalCall": "setTimeout(closeModal, 400)",
      "replacementCall": "gsap.delayedCall(0.4, closeModal)"
    }
  ],
  "propertyReplacements": [
    {
      "file": "src/components/Modal.vue",
      "line": 85,
      "fromProp": "left",
      "toProp": "x"
    }
  ],
  "easeReplacements": [
    {
      "file": "src/components/Modal.vue",
      "line": 86,
      "fromEase": "Power2.easeOut",
      "toEase": "'power2.out'"
    }
  ],
  "importInjections": [
    {
      "file": "src/components/Modal.vue",
      "importStatement": "import gsap from 'gsap';"
    }
  ]
}
```

---

## 🛡️ Zero Escape Hatches & Architectural Alternatives

Comment escape hatches (`// timer-ok:`, `// layout-ok:`) are permanently eradicated. Instead, use canonical architectural solutions:

1. **Timers outside UI**: Timers in background services, Node.js scripts, and CLI utilities are permitted natively (scoped strictly outside `componentsRoots`/`viewsRoots`). For UI component delays, use `gsap.delayedCall(delay, callback)` or `gsapSleep(delay)`.
2. **Layout Tweens vs Transforms**: Continuous animations must use GPU transforms (`x`, `y`, `scaleX`, `scaleY`) or `Flip`. For static setup, use `gsap.set()`. For collapsible accordions, use recognized zero-to-auto transitions (`height: 'auto'` <-> `height: 0` / `'0px'`).

---

## 5. Reaction Protocol: CI Error vs. Elective Motion Refactoring

### Scenario A: CI Quality Gate Error (`validate_gsap_animations`)

- **Trigger**: `npm run auditor` reports `gsap-banned-timer` or `gsap-banned-layout-property`.
- **Strategic Phase**: Phase 5 (`behavior`).
- **Action**: Formulate a **Correction Plan**. Replace `setTimeout` with `gsap.delayedCall(delay, cb)` or change `top/left` tweens to `y/x` transforms.
- **Verification**: `npm run auditor -- suite=validate_gsap_animations` -> Green.

### Scenario B: Elective UI Animation Modernization (`auditor:motion`)

- **Trigger**: User requests *"improve UI animations"*, *"replace component timers"*, or *"optimize animations to 60 FPS"*.
- **Pre-flight Invariant**: Verify `npm run auditor` is 100% green before proceeding.
- **Action**: Formulate an **Improvement Plan**. Run `auditor:motion discover`, inspect specific candidate files via `auditor:motion inspect --file <target>`, generate `scratch/motion-plan.json`, and apply with `--worktree`.

---

## 6. Concrete Plan Blueprints

### Correction Plan (CI Error: `gsap-banned-timer`)

````markdown
# Correction Plan: gsap-banned-timer in ToastNotification.vue

## 1. Diagnosis & Strategic Phase
- **Active Phase (`auditor:next`)**: `behavior` (Phase 5)
- **Suite**: `validate_gsap_animations`
- **Location**: `src/components/ToastNotification.vue:L52`
- **Violation**: Use of `setTimeout(() => isVisible.value = false, 3000)` inside a Vue component.

## 2. Canonical Solution
Replace with `gsap.delayedCall` to honor time-scaling in automated tests:

```ts
gsap.delayedCall(3, () => {
  isVisible.value = false;
});
```

## 3. Verification

`npm run auditor -- suite=validate_gsap_animations`
````

### Improvement Plan (Elective: `auditor:motion`)

````markdown
# Improvement Plan: Migration to GPU Transforms in Drawer.vue

## 1. Scope & Motivation
- **Tool**: `auditor-motion`
- **Objective**: Replace layout animation `left: -320px` to `left: 0` with hardware-accelerated `x: -320` to `x: 0` to prevent layout thrashing at 60 FPS.
- **Pre-flight CI Baseline**: 100% Green (0 errors, 0 warnings).

## 2. Candidate Catalog (Dirac Micro-Context)
| File | Line | Current Property | Proposed GPU Property | Proposed Ease |
| :--- | :--- | :--- | :--- | :--- |
| `src/components/Drawer.vue` | L85 | `left: '0px'` | `x: 0` | `'power2.out'` |

## 3. Declarative Plan (`scratch/motion-plan.json`)

```json
{
  "version": 1,
  "planId": "motion-plan-drawer-gpu",
  "targetFiles": ["src/components/Drawer.vue"],
  "propertyReplacements": [
    {
      "file": "src/components/Drawer.vue",
      "line": 85,
      "fromProp": "left",
      "toProp": "x"
    }
  ]
}
```

## 4. Sandbox Execution

`npm run auditor:motion apply --plan scratch/motion-plan.json --worktree`
````

---

## 7. Step-by-Step Tutorial & CLI Walkthrough

### Step 1: Discover Motion Hygiene Issues

```bash
npm run auditor:motion discover
```

Output displays:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                  auditor-motion: UI Motion Discovery Table                   │
├──────────────────────────────┬───────────┬─────────────┬─────────────────────┤
│ File                         │ Timers    │ Layout Props│ Legacy Eases        │
├──────────────────────────────┼───────────┼─────────────┼─────────────────────┤
│ src/components/Drawer.vue    │ 1 timer   │ 2 layout    │ 1 ease              │
│ src/views/BattleView.vue     │ 0 timer   │ 1 layout    │ 0 ease              │
└──────────────────────────────┴───────────┴─────────────┴─────────────────────┘
```

### Step 2: Inspect Specific Target File

```bash
npm run auditor:motion inspect -- --file src/components/Drawer.vue
```

Emits targeted Dirac micro-context with exact lines, proposed replacements, and plan snippet.

### Step 3: Apply Declarative Plan via Worktree Sandbox

```bash
npm run auditor:motion apply -- --plan scratch/motion-plan.json --worktree
```

The engine executes in an ephemeral worktree, verifies build and tests (`vp check && vp test`), and safely merges changes upon green verification.
