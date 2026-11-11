# Purpose

Framework-agnostic, isomorphic runtime library (`@francogp/auditor/modals`) providing deterministic LIFO modal stack management, customizable `z-index` scale and monotonic layer allocation, customizable default motion presets and animation drivers, CSS custom property bridging, accessible DOM ID generation, Escape/backdrop/history dismissal routing, and priority-ordered modal sequence coordination without Node.js or UI framework coupling.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **100% Browser-Safe & Isomorphic Purity**: Zero `node:*` imports and zero external UI/animation framework dependencies (no Vue, Pinia, React, or GSAP imports). Must bundle cleanly in any client Vite application.
- **Customizable Defaults (Zero Hardcoding of Z-Index, Styles, or Motion)**: `CANONICAL_Z_LAYERS`, structural layout helpers (`resolveModalStructuralStyles`), and `DEFAULT_MODAL_MOTION_PRESETS` act strictly as overridable defaults. Consumers may supply custom `zLayers`, custom `baseZIndex`/`stepZIndex`/`ceilingZIndex`, per-modal `customZIndex`/`zIndexOffset`, custom `defaultMotion` or per-modal `motion` overrides, and custom `ModalAnimationDriver` implementations (including Web Animations API or dependency-injected GSAP).
- **Monotonic Z-Index Freeze During Exit Animations**: `activeTop` and `isSimplified` transfer immediately upon `close-start`, while exiting entries retain their frozen `zIndex` until `finalizeClose`, resetting `nextSlot` to `0` exclusively when the stack becomes completely empty (`stack-empty`).
- **Two-Step Backdrop Light-Dismiss Safety**: `createBackdropPointerGuard` requires both `pointerdown` and `pointerup` with the primary button on the backdrop of `activeTop`, preventing text-selection drags from dismissing modals.
- **Event-Driven Sequence Coordination (Zero Polling)**: `waitForClose` and `ModalSequenceQueue.waitUntilIdle` resolve strictly via in-memory event listeners without `setInterval` or sleep polling loops.

## Key Files

- [`index.ts`](./index.ts): Public barrel entrypoint exported at `@francogp/auditor/modals`.
- [`modalZLayers.ts`](./modalZLayers.ts): Default Z-layer scale (`CANONICAL_Z_LAYERS`), custom Z-layer resolver (`resolveModalZLayers`), CSS custom properties bridge (`resolveModalCssVars`), and accessible DOM ID builder (`resolveModalDomIds`).
- [`modalMotionPresets.ts`](./modalMotionPresets.ts): Customizable default motion presets (`DEFAULT_MODAL_MOTION_PRESETS`, `resolveModalMotionPreset`, `resolveModalPlacementMotionPreset`) and theme-agnostic structural style helper (`resolveModalStructuralStyles`).
- [`modalAnimationDrivers.ts`](./modalAnimationDrivers.ts): Pluggable animation driver contract (`ModalAnimationDriver`), WAAPI driver (`createWaapiModalDriver`), dependency-injected GSAP driver (`createGsapModalDriver`), and `ModalAnimationController`.
- [`modalInternalUtils.ts`](./modalInternalUtils.ts): Internal browser-safe collection utilities shared across modal modules.
- [`modalStackTypes.ts`](./modalStackTypes.ts): Domain-Type-First `as const` tuples, union types, snapshot contracts, and lifecycle event interfaces.
- [`modalStackManager.ts`](./modalStackManager.ts): O(1) `ModalStackManager` class and `createModalStack` factory governing stack order, custom Z-layer scales, singleton policies, dismissal guards, and exit animation handshakes.
- [`modalDomController.ts`](./modalDomController.ts): Optional DOM controller (`ModalDomController`), two-phase backdrop guard (`createBackdropPointerGuard`), and configurable history/mouse/keyboard back-navigation guard.
- [`modalSequenceQueue.ts`](./modalSequenceQueue.ts): Priority-ordered sequential modal/task runner (`ModalSequenceQueue`, `createModalSequenceQueue`) with zero-polling idle synchronization.

## Work Guidance

- Maintain strict `/domain-type-first` typing: derive all finite unions from `as const` tuples, enforce explicit member accessibility (`public`/`private`), declare explicit return types on all methods and exported functions, and avoid any `node:*` imports.
- Keep `getSnapshot()` reference-stable between state mutations so reactive consumers (`shallowRef`, `useSyncExternalStore`) incur zero redundant renders.

## Verification

- Run modal stack unit and canary suites: `vp test run tests/modal_stack_manager.test.ts tests/modal_dom_and_motion.test.ts tests/modal_sequence_queue.test.ts`
- Run fast source lint and type checks: `npm run auditor:lint`
- Verify DOX and Markdown contracts: `npm run auditor:md`

## Child DOX Index

- _This directory contains isomorphic modal stack governance modules with no subdirectories._
