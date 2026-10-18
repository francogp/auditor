# Motion & UI Animation Governance Guide (`auditor-motion`)

The `auditor-motion` CLI and `MotionRefactorEngine` provide automated detection and deterministic remediation for UI animation hygiene and timing rules governed by `validate_gsap_animations`.

---

## 🎯 Architecture & Guiding Principles

Modern UI animation architecture requires:

1. **Zero Raw Browser Timers in UI Components**: Raw `setTimeout` and `setInterval` bypass test runners that accelerate time via `gsap.globalTimeline.timeScale(100)`, causing flakiness or timeout failures in automated UI tests.
2. **GPU Acceleration Over Layout Thrashing**: Animating layout properties (`top`, `left`, `width`, `height`, `margin*`) forces browser reflows and repaints on every frame (dropping 60 FPS). Animations MUST use GPU-accelerated transforms (`x`, `y`, `scaleX`, `scaleY`) or explicitly declare statement-level exceptions (`// layout-ok: <reason>`).
3. **Canonical Modern Eases**: GSAP v3 requires canonical string eases (`'power1.out'`, `'back.inOut'`) instead of legacy object instances (`Power1.easeOut`).

---

## 🛠️ CLI Tool Usage (`auditor-motion`)

```bash
# Direct CLI invocation
npx auditor-motion <command> [options]

# Via package script
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

## 🛡️ Escape Hatches

When raw browser timers or layout properties are genuinely required (e.g. low-level hardware debouncing or layout constraints), apply statement-level comments:

- `// timer-ok: debouncing window resize events`
- `// layout-ok: SVG container width animation`
