---
name: scss-best-practices
description: MANDATORY governance and best practices for SCSS, SASS, stylesheets, CSS architecture, and styling across Vue SFC and modern web applications. Governs modern Dart Sass 2.0+ architecture (@use, @forward, sass:math, elimination of @import), nesting limits (<= 3), modern CSS standards (logical properties, oklch, color-mix, clamp fluid tokens, container queries), GSAP animation coordination (zero CSS transitions or transform: !important on GSAP nodes), GPU acceleration (will-change, layer promotion, mobile dvh/dvw), responsive mixins, and BEM/scoped hygiene. Use whenever writing, refactoring, reviewing, or debugging SCSS files (.scss, .sass) or Vue <style lang="scss"> blocks, or when the user mentions styles, SCSS, Sass, CSS architecture, or styling rules.
license: MIT
metadata:
  author: Franco Gastón Pellegrini
  organization: FrancoGP Core Architecture
  date: October 2026
---

# SCSS Best Practices & CSS Architecture

Comprehensive standard for modern SCSS/SASS stylesheets, combining **Dart Sass 2.0+ modular architecture**, **modern CSS standards** (logical properties, `oklch`, `clamp`), **Vue SFC scoped hygiene**, and **GPU/GSAP motion coordination**.

---

## 🏛️ Core Principles

1. **Dart Sass 2.0+ First**: Eradicate `@import` completely; use `@use` and `@forward` with namespacing. Use built-in modules (`sass:math`, `sass:string`, `sass:color`).
2. **Intrinsic & Modern CSS Over Scripts**: Prefer a single self-adapting declaration (`clamp()`, container queries, subgrid) over endless media query breakpoint ladders.
3. **Logical Properties Over Directional**: Use `margin-block`, `margin-inline`, `padding-block`, `padding-inline` instead of physical `top`, `bottom`, `left`, `right`.
4. **GSAP Animation Sovereignty**: Never mix CSS `transition` or `transform: ... !important` on elements animated by GSAP.
5. **Strict Nesting Ceiling**: Maximum **3 levels** of SCSS nesting. Deeper nesting causes specificity runaway and unmaintainable cascades.
6. **Reactive Tokens (CSS Custom Properties + SCSS)**: Manage dynamic themes via native CSS variables (`var(--token)`), augmented by SCSS mixins and functions.

---

## 1. Modern Dart Sass 2.0+ Architecture

### Eradication of `@import`

The legacy `@import` directive is deprecated and removed in Dart Sass 3.0. Always use `@use` and `@forward`:

```scss
// ❌ FORBIDDEN: Deprecated global pollution
@import "abstracts/variables";
@import "abstracts/mixins";

// ✅ MANDATORY: Namespaced module loading
@use "sass:math";
@use "@/styles/tokens/colors" as colors;
@use "@/styles/core/mixins" as *; // Only wildcard core ubiquitous utilities
```

### Module Built-ins (`math`, `string`, `color`)

Global functions (`random()`, `round()`, `percentage()`, `lighten()`, `darken()`) trigger deprecation warnings:

```scss
// ❌ FORBIDDEN
$width: percentage(0.5);
$tint: lighten(#3498db, 10%);

// ✅ MANDATORY
@use "sass:math";
@use "sass:color";

$width: math.percentage(0.5);
$tint: color.scale(#3498db, $lightness: 10%);
```

---

## 2. Dart Sass Safety & Compilation Traps

### CSS Function Collisions (The Sass Trap)

Dart Sass built-ins can collide with standard CSS functions (`scale`, `translateY`, `grayscale`, `linear-gradient`), treating them as internal color operations.

* **Capitalization Protocol**: To output literal CSS without Sass interception, write standard CSS functions in lowercase if the project uses a Vite automation plugin (`vite-plugin-sass-traps.ts`). When writing raw SCSS without auto-traps, capitalize or interpolate:
  * `transform: Scale(1.05);` or `transform: scale(#{$ratio});`
  * `filter: Grayscale(0.8);` or `filter: grayscale(#{0.8});`
  * `background: Linear-Gradient(...);`

### Vue `<style lang="scss">` Requirement

SCSS syntax, mixins, and interpolation `#{}` ONLY compile if the `<style>` tag declares `lang="scss"`:

```vue
<!-- ✅ MANDATORY -->
<style lang="scss" scoped>
@use "@/styles/core/tools" as *;

.card {
  padding-block: clamp(8px, 2vw, 16px);
}
</style>
```

### Mixin Isolation in Production Builds

Vite HMR dev mode resolves global mixins across partials, but production builds compile each SCSS partial in **isolation**. If `_buttons.scss` uses a mixin from `_layout.scss`, it **must explicitly `@use` it locally**, otherwise `npm run build` will fail with `Undefined mixin`.

---

## 3. Modern CSS Standards & Logical Properties

Apply intrinsic, modern CSS techniques inside SCSS:

### Logical Properties

Always replace physical coordinates with inline and block properties:

* `margin-block-start` / `margin-block-end` instead of `margin-top` / `margin-bottom`.
* `padding-inline-start` / `padding-inline-end` instead of `padding-left` / `padding-right`.
* `inset-block` / `inset-inline` instead of `top`, `bottom`, `left`, `right`.

### Colors & Modern Color Space

* Favor `oklch()` for perceptually uniform colors and `color-mix()` for dynamic tints:

  ```scss
  color: oklch(0.7 0.15 250);
  background: color-mix(in oklch, var(--card-bg) 90%, transparent);
  ```

* For native variable opacity in SCSS, inject a corresponding RGB channel variable:

  ```scss
  background: Rgba(var(--accent-rgb), 0.3); // Safe reactive opacity
  ```

### Fluid Tokens (`clamp()`)

Replace rigid breakpoint ladders with self-adapting tokens:

```scss
// Single declaration replaces multiple media queries
font-size: clamp(0.875rem, 1vw + 0.75rem, 1.25rem);
gap: clamp(8px, 1.5vw, 24px);
```

### Overflow Control

* Use `overflow: clip` instead of `overflow: hidden` when you only want to cut off layout overflow without creating a scroll container. Keep `hidden` only when programmatic scrolling is required.

---

## 4. GSAP Animation Coordination

When building animated web interfaces, CSS and JavaScript animation engines must never fight for control:

1. **Zero CSS Transitions on GSAP Nodes**:
   Never write `transition: all ...` or `transition: transform ...` on elements animated by GSAP. The browser transition will fight the GSAP ticker, causing stuttering and double-easing.
2. **Prohibition of `transform: ... !important`**:
   `!important` on CSS transforms has higher specificity than GSAP runtime inline styles, completely freezing tweens. Use flexbox/grid for centering, never static `transform: translate(-50%, -50%) !important`.
3. **Initial Baseline State**:
   When animating filters or opacity via GSAP, declare the explicit baseline in SCSS to prevent one-frame transparent flickers:

   ```scss
   .animated-card {
     filter: brightness(1);
     will-change: filter, transform;
   }
   ```

4. **No Layout Animations**:
   Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`. Animate only `transform` (`x`, `y`, `scale`, `rotation`) and `opacity`.

---

## 5. Specificity, Nesting & Component Hygiene

### The 3-Level Nesting Limit

Excessive nesting creates specificity bloat and brittle selectors:

```scss
// ❌ FORBIDDEN: 4+ levels of nesting
.shop-modal {
  .inventory-grid {
    .item-card {
      .item-badge {
        color: red;
      }
    }
  }
}

// ✅ MANDATORY: Flattened BEM or component-scoped (max 3 levels)
.shop-modal {
  &__grid {
    display: grid;
  }
  &__badge {
    color: red;
  }
}
```

### Component Single Source of Truth (SSoT)

* Each component must have **ONE primary SCSS file** (e.g. `ItemCard.styles.scss`).
* Never redefine the same root selector across multiple stylesheets.
* Namespace component classes uniquely (e.g. `.pk-item-card` instead of generic `.card`).

### Z-Index Governance

* Never hardcode arbitrary integers (`z-index: 9999;`).
* Reference centralized design tokens or relative scales:

  ```scss
  z-index: var(--z-modal);
  z-index: calc(var(--z-base) + 2);
  ```

---

## 6. GPU Acceleration & Mobile Stability

### Layer Promotion & Will-Change

* Heavy cards, modals, and continuously animated elements must be promoted to compositor layers:

  ```scss
  @mixin gpu-layer {
    transform: translateZ(0);
    backface-visibility: hidden;
  }
  ```

* Use `will-change: transform, opacity` statically on the base selector, NEVER inside an active `@keyframes` rule.

### Dynamic Viewport Units (`dvh` / `dvw`)

* Never use `100vh` on mobile-targeted containers; the address bar triggers clipping or phantom scrollbars.
* Use `100dvh` (Dynamic Viewport Height) or `min-height: 100dvh`.

### Interaction Stability (Zero-TranslateY Ghosting)

* Avoid `transform: translateY(-2px)` on `:hover` in dense lists or cards. It causes micro-jittering and hover feedback loops.
* Prefer scale (`transform: scale(1.02)`), border-color transitions, or brightness shifts.

---

## 7. Typography, Descenders & Accessibility

### Descender Protection on Custom / Pixel Fonts

Fonts with tall ascenders and deep descenders (`g`, `j`, `p`, `q`, `y`) suffer from glyph clipping when line-height is cramped:

* **Mandatory Base Line-Height**: Set `line-height: 1.35` minimum for custom/pixel fonts.
* **Truncated Text Safety**: For single-line ellipsis, add `padding-bottom: 2px` or `line-height: 1.45` to prevent the baseline from cutting hooks.

### Accessible Interactions

* **Hover Safety**: Always guard hover states for pointer devices to avoid sticky hover states on mobile touchscreens:

  ```scss
  @media (hover: hover) and (pointer: fine) {
    .btn:hover {
      background: var(--btn-hover-bg);
    }
  }
  ```

* **Focus States**: Never write `outline: none`. Use `:focus-visible` with high-contrast outlines:

  ```scss
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  ```

* **Reduced Motion**: Wrap non-essential decorative animations in reduced-motion queries:

  ```scss
  @media (prefers-reduced-motion: no-preference) {
    .pulse-glow {
      animation: glow 2s infinite alternate;
    }
  }
  ```

---

## 8. Recommended Modular Folder Structure (7-1 Pattern)

Organize project-level stylesheets cleanly:

```text
styles/
├── abstracts/       # Variables, functions, mixins (no CSS output)
│   ├── _tokens.scss
│   ├── _functions.scss
│   └── _mixins.scss
├── base/            # Reset, typography, global defaults
│   ├── _reset.scss
│   └── _typography.scss
├── components/      # Standalone reusable UI components (or co-located in Vue SFC)
│   ├── _buttons.scss
│   └── _cards.scss
├── layouts/         # Layout shells, headers, grids, HUD
│   ├── _navigation.scss
│   └── _grid.scss
└── main.scss        # Aggregator importing partials with @use
```

---

## 📋 Verification Checklist for SCSS

Before completing any stylesheet or `<style lang="scss">` task:

* [ ] Does every file use `@use` / `@forward` instead of deprecated `@import`?
* [ ] Are nesting levels **<= 3**?
* [ ] Are directional properties replaced with logical properties (`inline`/`block`)?
* [ ] Are GSAP-animated elements free of CSS `transition` and `transform: !important`?
* [ ] Are full-screen heights using `dvh` instead of `vh`?
* [ ] Are hover rules wrapped in `@media (hover: hover) and (pointer: fine)`?
* [ ] Is `:focus-visible` styled without ever setting `outline: none`?
* [ ] Are custom font line-heights >= 1.35 with descender padding on truncated text?

---

## 🌐 Dynamic Language Governance (Zero Hardcoding)

* The agent MUST dynamically consult `.auditor/audit.config.ts` to determine the configured languages:
  * **AI Chat & Conversational Language (`config.documentation.chatLanguage`)**: Governs all interactive chat communication, user interviews, options matrices, `ask_question` dialogs. The agent converses strictly in the language resolved from `config.documentation.chatLanguage`.
  * **Documentation & File Writing Language (`config.documentation.language`)**: Governs code, code comments, commit messages, git tags, documentation files, markdown files, brain artifacts (`walkthrough.md`, `task.md`, `plan_safe_commit.md`), and DOX indices (`AGENTS.md`). The agent writes files strictly in the language resolved from `config.documentation.language`.
* **Zero Language Mixing & Zero Hardcoding**: Skills and agents MUST NEVER hardcode language names or assume fixed languages. The AI agent must dynamically resolve these settings from configuration and never confuse or conflate the chat communication language with the repository file writing language.
