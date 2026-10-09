# GPU Acceleration & Motion Coordination Reference

Technical manual for hardware-accelerated animations, compositor layer stability, and seamless GSAP ticker synchronization in SCSS.

---

## 1. Compositor Layer Promotion

Promoting elements to dedicated GPU layers avoids continuous CPU repaint cycles during animations and scrolling.

```scss
@mixin gpu-layer {
  transform: translateZ(0);
  backface-visibility: hidden;
}
```

### Golden Rules of Layer Promotion

1. **Never Promote Indiscriminately**: Managing 100+ overlapping GPU layers consumes excessive VRAM and causes "scroll-stop freezes" when the browser cleans up compositor memory. Apply layer promotion only to parent card containers or high-frequency animated nodes.
2. **Context-Aware `will-change`**:
   - Declare `will-change: transform, opacity` or `will-change: filter` statically on the element's base class.
   - **Never** declare `will-change` inside an active `@keyframes` rule. Doing so forces the compositor to destroy and re-create layers on every loop iteration, inducing severe stutter and texture flickering.
3. **Visibility vs Opacity**:
   - `visibility: hidden` destroys the GPU layer immediately; setting it back to `visible` causes a multi-frame re-paint freeze.
   - Use `opacity: 0; pointer-events: none;` to keep the layer warm in GPU memory for instant reappearance.

---

## 2. GSAP Synchronization & Conflict Prevention

When animating nodes in applications utilizing GSAP (GreenSock), CSS properties and JS tweens must adhere to clear boundaries:

| Practice | Status | Rationale |
| :--- | :--- | :--- |
| `transition: transform 0.3s` on GSAP node | ❌ FORBIDDEN | CSS transition intercepts GSAP 60fps tick updates, causing severe frame drops and double-easing. |
| `transform: translate(-50%, -50%) !important` | ❌ FORBIDDEN | CSS `!important` overrides inline styles injected by GSAP, freezing tweens silently. |
| Animating `top`, `left`, `margin`, `width` | ❌ FORBIDDEN | Triggers CPU reflow and re-layout on every frame. Use `transform: translate()` / `scale()`. |
| Declaring baseline `filter: brightness(1)` | ✅ MANDATORY | Prevents one-frame transparent flicker in Blink/WebKit browsers when starting GSAP filter tweens. |
| Capitalized filter values in GSAP | ✅ MANDATORY | If CSS transforms/filters are capitalized by Vite (`Brightness(1.5)`), GSAP must read and write matching casing to avoid DOM read mismatches. |

---

## 3. Shadow Performance & Density Rules

1. **`box-shadow` vs `filter: drop-shadow()`**:
   - `box-shadow` is processed by fixed-function GPU rasterizer hardware (extremely fast).
   - `filter: drop-shadow()` requires full per-pixel alpha mask analysis across the texture (expensive).
   - Use `box-shadow` for regular cards, buttons, dialogs, and glowing containers.
   - Reserve `drop-shadow()` strictly for non-rectangular visual assets (sprites, transparent PNGs, SVG icons).
2. **Density Rule in High-Item Lists**:
   - In grids with 30+ items (such as inventory or catalog cards), apply at most **one** `drop-shadow()` per item to prevent GPU fill-rate starvation.
