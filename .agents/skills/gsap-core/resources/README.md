# GSAP skills — reference examples

Minimal demos that follow the skills exactly: transforms, autoAlpha, timelines, ScrollTrigger, and framework-specific patterns (useGSAP in React, onMount/onUnmount with gsap.context in Vue/Nuxt).

## Vanilla (HTML + JS)

- [resources/vanilla/](vanilla/) — single HTML page + ES module.
- Uses GSAP from CDN (ESM). Open with a local server that supports ES modules.
- Patterns: `gsap.to()` with `x`/`autoAlpha`, `gsap.timeline()` with defaults and position parameter, ScrollTrigger on the timeline.

## React

- [resources/react/](react/) — Vite + React + `@gsap/react`.
- Patterns: `useGSAP()` with `scope: containerRef`, refs for targets, no selectors without scope; cleanup is automatic on unmount.

These examples are intended as reference implementations for AI agents and for quick manual verification of the skill patterns.

## Vue

- [resources/vue/](vue/) — Vite + Vue 3 + `<script setup>`.
- Patterns: `gsap.context(() => {}, scope)` via `<script setup>`, `onMounted`/`onUnmounted` cleanup, ScrollTrigger on timeline, autoAlpha, stagger.

## Nuxt

- [resources/nuxt/](nuxt/) — Nuxt 4 with GSAP re-usable composable.
- Patterns: GSAP as reusable composable (`useGSAP.ts`), for gsap access, lazy-loading plugins, `gsap.context(() => {}, scope)` cleanup.
