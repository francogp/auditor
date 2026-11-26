/**
 * src/core/gsapMigrationGuides.ts
 *
 * Canonical remediation manuals for @francogp/domain-type/* Oxlint DOM-to-GSAP
 * migration rules, consumed by `npm run auditor:guide <ruleId>`.
 */

export const GSAP_DOM_MIGRATION_RULE_IDS = [
  '@francogp/domain-type/no-dom-intersection-reveal',
  '@francogp/domain-type/no-scroll-mousemove-style-mutation',
  '@francogp/domain-type/no-smooth-scroll-into-view'
] as const;

export type GsapDomMigrationRuleId = (typeof GSAP_DOM_MIGRATION_RULE_IDS)[number];

export interface GsapMigrationRuleGuide {
  readonly description: string;
  readonly remediation: string;
}

export const GSAP_MIGRATION_RULE_GUIDES: Readonly<
  Record<GsapDomMigrationRuleId, GsapMigrationRuleGuide>
> = {
  '@francogp/domain-type/no-dom-intersection-reveal': {
    description: 'Replace IntersectionObserver DOM reveal with ScrollTrigger',
    remediation:
      '📖 REMEDIATION GUIDE: @francogp/domain-type/no-dom-intersection-reveal\n' +
      '1. Root Cause: An IntersectionObserver callback mutates `classList.add/toggle` or `.style.*` to trigger scroll-reveal animations, bypassing GSAP timeline orchestration and `gsap.context()` lifecycle cleanup.\n' +
      '2. Diagnosis: Locate `new IntersectionObserver(...)` at the reported line in TypeScript/Vue.\n' +
      '3. Canonical Solution: Replace scroll-reveal observers with `ScrollTrigger.create` or `gsap.from(..., { scrollTrigger })` wrapped in `gsap.context()` (keep `IntersectionObserver` only for `.dataset.src`/`.dataset.loaded` lazy loading or analytics).\n' +
      '4. Example:\n' +
      '   ❌ Incorrect:\n' +
      '      const io = new IntersectionObserver((entries) => {\n' +
      '        entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-visible"));\n' +
      '      });\n' +
      '   ✅ Correct:\n' +
      '      const ctx = gsap.context(() => {\n' +
      '        gsap.from(".reveal", { autoAlpha: 0, y: 24, scrollTrigger: { trigger: ".reveal", once: true } });\n' +
      '      }, containerRef);'
  },
  '@francogp/domain-type/no-scroll-mousemove-style-mutation': {
    description: 'Replace scroll/pointer style mutation with GSAP quickTo',
    remediation:
      '📖 REMEDIATION GUIDE: @francogp/domain-type/no-scroll-mousemove-style-mutation\n' +
      '1. Root Cause: An inline `scroll`, `mousemove`, or `pointermove` listener mutates `element.style.*` or `style.setProperty(...)` directly on every event tick, causing layout/paint thrashing outside the GSAP ticker.\n' +
      '2. Diagnosis: Inspect the `addEventListener("scroll" | "mousemove" | "pointermove", ...)` handler at the reported line.\n' +
      '3. Canonical Solution: Use `gsap.quickTo()` for smooth pointer tracking or `ScrollTrigger` (`scrub: true`) for scroll-linked motion inside `gsap.context()`.\n' +
      '4. Example:\n' +
      '   ❌ Incorrect:\n' +
      '      window.addEventListener("mousemove", (e) => { cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });\n' +
      '   ✅ Correct:\n' +
      '      const xTo = gsap.quickTo(cursor, "x", { duration: 0.25, ease: "power3.out" });\n' +
      '      const yTo = gsap.quickTo(cursor, "y", { duration: 0.25, ease: "power3.out" });\n' +
      '      window.addEventListener("mousemove", (e) => { xTo(e.clientX); yTo(e.clientY); });'
  },
  '@francogp/domain-type/no-smooth-scroll-into-view': {
    description: 'Replace smooth scrollIntoView with GSAP ScrollToPlugin',
    remediation:
      '📖 REMEDIATION GUIDE: @francogp/domain-type/no-smooth-scroll-into-view\n' +
      '1. Root Cause: Native `element.scrollIntoView({ behavior: "smooth" })` fights GSAP `ScrollTrigger` and `ScrollSmoother` velocity/easing curves and cannot be interrupted or sequenced inside a GSAP timeline.\n' +
      '2. Diagnosis: Locate `.scrollIntoView({ behavior: "smooth" })` at the reported line.\n' +
      '3. Canonical Solution: Register `ScrollToPlugin` (`gsap.registerPlugin(ScrollToPlugin)`) and animate `gsap.to(window, { duration: 0.6, scrollTo: target, ease: "power2.out" })`.\n' +
      '4. Example:\n' +
      '   ❌ Incorrect:\n' +
      '      sectionEl.scrollIntoView({ behavior: "smooth" });\n' +
      '   ✅ Correct:\n' +
      '      gsap.registerPlugin(ScrollToPlugin);\n' +
      '      gsap.to(window, { duration: 0.6, scrollTo: { y: sectionEl, offsetY: 64 }, ease: "power2.out" });'
  }
};
