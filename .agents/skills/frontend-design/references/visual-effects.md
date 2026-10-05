# Visual Effects Reference

> Modern CSS effect principles and techniques - learn the concepts, create variations. **No fixed values to copy - understand the patterns.**

---

## 1. Premium Shell Principles

### What Makes Premium Shell Work

```text
Key Properties:
├── Solid high-contrast background (opaque)
├── Premium gradients (depth & volume)
├── Sharp, shining borders (1px-2px solid)
└── Deep shadows & relief (box-shadow)
```

### The Pattern (Customize Values)

```css
.shell-premium {
  /* Solid background: premium deep colors */
  background: Linear-Gradient(180deg, Rgba(255, 255, 255, 0.05) 0%, Rgba(255, 255, 255, 0) 100%), var(--bg-dark);

  /* Relief: double border pattern */
  border: 1px solid Rgba(255, 255, 255, 0.15);
  box-shadow:
    0 10px 40px Rgba(0, 0, 0, 0.6),
    inset 0 1px 1px Rgba(255, 255, 255, 0.05);

  /* Radius: sharp or rounded but solid */
  border-radius: YOUR_RADIUS;
}
```

### When to Use Premium Shell

- ✅ High-fidelity management screens (Configuration Simulator, Transaction Verification)
- ✅ Floating analytical cards and metric panels
- ✅ Summary status badges
- ❌ Simple flat content (unnecessary volume)

### When NOT to Use

- Low-performance budget views
- Minimalist text logs
- Flat retro-only content

---

## 2. Neomorphism Principles

### What Makes Neomorphism Work

```text
Key Concept: Soft, extruded elements using DUAL shadows
├── Light shadow (from light source direction)
├── Dark shadow (opposite direction)
└── Background matches surrounding (same color)
```

### The Pattern

```css
.neo-raised {
  /* Background MUST match parent */
  background: SAME_AS_PARENT;

  /* Two shadows: light direction + dark direction */
  box-shadow:
    OFFSET OFFSET BLUR rgba(light-color),
    -OFFSET -OFFSET BLUR rgba(dark-color);

  /* OFFSET: typically 6-12px */
  /* BLUR: typically 12-20px */
}

.neo-pressed {
  /* Inset creates "pushed in" effect */
  box-shadow:
    inset OFFSET OFFSET BLUR rgba(dark-color),
    inset -OFFSET -OFFSET BLUR rgba(light-color);
}
```

### Accessibility Warning

⚠️ **Low contrast** - use sparingly, ensure clear boundaries

### When to Use

- Decorative elements
- Subtle interactive states
- Minimalist UI with flat colors

---

## 3. Shadow Hierarchy Principles

### Concept: Shadows Indicate Elevation

```text
Higher elevation = larger shadow
├── Level 0: No shadow (flat on surface)
├── Level 1: Subtle shadow (slightly raised)
├── Level 2: Medium shadow (cards, buttons)
├── Level 3: Large shadow (modals, dropdowns)
└── Level 4: Deep shadow (floating elements)
```

### Shadow Properties to Adjust

```css
box-shadow: OFFSET-X OFFSET-Y BLUR SPREAD COLOR;

/* Offset: direction of shadow */
/* Blur: softness (larger = softer) */
/* Spread: size expansion */
/* Color: typically black with low opacity */
```

### Principles for Natural Shadows

1. **Y-offset larger than X** (light comes from above)
2. **Low opacity** (5-15% for subtle, 15-25% for pronounced)
3. **Multiple layers** for realism (ambient + direct)
4. **Blur scales with offset** (larger offset = larger blur)

### Dark Mode Shadows

- Shadows less visible on dark backgrounds
- May need to increase opacity
- Or use glow/highlight instead

---

## 4. Gradient Principles

### Types and When to Use

| Type       | Pattern                      | Use Case                      |
| :--------- | :--------------------------- | :---------------------------- |
| **Linear** | Color A → Color B along line | Backgrounds, buttons, headers |
| **Radial** | Center → outward             | Spotlights, focal points      |
| **Conic**  | Around center                | Pie charts, creative effects  |

### Creating Harmonious Gradients

```text
Good Gradient Rules:
├── Use ADJACENT colors on wheel (analogous)
├── Or same hue with different lightness
├── Avoid complementary (can look harsh)
└── Add middle stops for smoother transitions
```

### Gradient Syntax Pattern

```css
.gradient {
  background: linear-gradient(
    DIRECTION,
    /* angle or to-keyword */ COLOR-STOP-1,
    /* color + optional position */ COLOR-STOP-2 /* ... more stops */
  );
}

/* DIRECTION examples: */
/* 90deg, 135deg, to right, to bottom right */
```

### Mesh Gradients

```text
Multiple radial gradients overlapped:
├── Each at different position
├── Each with transparent falloff
├── **Mandatory for "Wow" factor in Hero sections**
└── Creates organic, colorful effect (Search: "Aurora Gradient CSS")
```

---

## 5. Border Effects Principles

### Gradient Borders

```text
Technique: Pseudo-element with gradient background
├── Element has padding = border width
├── Pseudo-element fills with gradient
└── Mask or clip creates border effect
```

### Animated Borders

```text
Technique: Rotating gradient or conic sweep
├── Pseudo-element larger than content
├── Animation rotates the gradient
└── Overflow hidden clips to shape
```

### Glow Borders

```css
/* Multiple box-shadows create glow */
box-shadow:
  0 0 SMALL-BLUR COLOR,
  0 0 MEDIUM-BLUR COLOR,
  0 0 LARGE-BLUR COLOR;

/* Each layer adds to the glow */
```

### 6. Interactive Depth Preservation (3D Buttons)

When animating or styling active states (`.active`) for 3D elements:

- **Shadow Integrity**: DO NOT remove the bottom shadow ("dark surface") of a 3D button when selected.
- **Selection Cues**: Use high-contrast borders (2px white) and outer glows (`box-shadow`) to signal activation while keeping the 3D volume intact.
- **Transformation**: Match the physical press by reducing the shadow size (e.g. from 4px to 2px) and translating the element downward (`TranslateY(2px)`), but never flattening it completely.

---

## 6. Glow Effects Principles

### Text Glow

```css
text-shadow:
  0 0 BLUR-1 COLOR,
  0 0 BLUR-2 COLOR,
  0 0 BLUR-3 COLOR;

/* Multiple layers = stronger glow */
/* Larger blur = softer spread */
```

### Element Glow

```css
box-shadow:
  0 0 BLUR-1 COLOR,
  0 0 BLUR-2 COLOR;

/* Use color matching element for realistic glow */
/* Lower opacity for subtle, higher for neon */
```

### Pulsing Glow Animation (GSAP Mandate)

```typescript
// Drive pulsing glow via GSAP rather than CSS @keyframes:
gsap.to(elementRef.value, {
  boxShadow: '0 0 25px var(--glow-color)',
  duration: 1.5,
  repeat: -1,
  yoyo: true,
  ease: 'sine.inOut'
});
```

### 4. Dynamic Variable Binding (Generic SCSS)

To keep SCSS generic and reusable across different contexts (e.g., varying status categories), bind dynamic variables in the template:

```text
<div :style="{ '--glow-color': getStatusColor(status) }" class="dynamic-glow">
```

In SCSS:

```scss
.dynamic-glow {
  box-shadow: 0 0 15px var(--glow-color, $yellow);
}
```

---

## 7. Overlay Techniques

### Gradient Overlay on Images

```text
Purpose: Improve text readability over images
Pattern: Gradient from transparent to opaque
Position: Where text will appear
```

```css
.overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(DIRECTION, transparent PERCENTAGE, rgba(0, 0, 0, OPACITY) 100%);
}
```

### Colored Overlay

```css
/* Blend mode or layered gradient */
background: linear-gradient(YOUR-COLOR-WITH-OPACITY), url('image.jpg');
```

---

## 8. Atmospheric & Cycle Aesthetics

Principles for creating dynamic, realistic environments (weather, day/night cycles).

### 1. High-Contrast Particles (Weather)

To keep weather particles (sand, snow, rain) visible against varying map backgrounds:

- **Saturated Colors**: Use more intense hues in your SVGs than the map itself (e.g., golden orange for sand).
- **Contour Definition**: Apply `Drop-shadow()` and `Contrast()` filters to particles. This creates a sharp "edge" that prevents them from blending into daytime backgrounds.
- **Context-Aware Visibility**: Environmental effects (weather particles, emojis, overlays) and atmospheric filters (color tints) MUST be hidden for locked or restricted UI components. Overloading locked content with complex atmosphere increases cognitive load and obscures the "locked" status.

### 2. Realistic Cycle Transitions

Avoid "unnatural" color shifts during Dawn/Dusk:

- **The Golden Hour Rule**: Use `Sepia()` for warmth and `Saturate()` for vibrancy.
- **FORBIDDEN**: High `Hue-rotate()` values (e.g., >20deg) on full-color map images, as they shift blue spectra into green, making water look toxic/unnatural.
- **Differentiation**:
  - **Dawn**: Fresh, cool tones (low sepia, soft blue/violet hue shift).
  - **Dusk**: Warm, dense tones (high sepia, high saturation, orange hue shift).

---

## 8. Modern CSS Techniques

### Container Queries (Concept)

```text
Instead of viewport breakpoints:
├── Component responds to ITS container
├── Truly modular, reusable components
└── Syntax: @container (condition) { }
```

### :has() Selector (Concept)

```text
Parent styling based on children:
├── "Parent that has X child"
├── Enables previously impossible patterns
└── Progressive enhancement approach
```

### Scroll-Driven Animations (Concept)

```text
Animation progress tied to scroll:
├── Entry/exit animations on scroll
├── Parallax effects
├── Progress indicators
└── View-based or scroll-based timeline
```

---

## 9. Performance Principles

### GPU-Accelerated Properties

```text
CHEAP to animate (GPU):
├── transform (translate, scale, rotate)
└── opacity

EXPENSIVE to animate (CPU):
├── width, height
├── top, left, right, bottom
├── margin, padding
└── box-shadow (recalculates)
```

### will-change Usage

```css
/* Use sparingly, only for heavy animations */
.heavy-animation {
  will-change: transform;
}

/* Remove after animation if possible */
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable or minimize animations */
  /* Respect user preference */
}
```

---

## 10. Effect Selection Checklist

Before applying any effect:

- [ ] **Does it serve a purpose?** (not just decoration)
- [ ] **Is it appropriate for the context?** (brand, audience)
- [ ] **Have you varied from previous projects?** (avoid repetition)
- [ ] **Is it accessible?** (contrast, motion sensitivity)
- [ ] **Is it performant?** (especially on mobile)
- [ ] **Did you ask user preference?** (if style open-ended)

### Anti-Patterns

- ❌ Flat designs with zero volume (too basic)
- ❌ Transparent/Glassy backgrounds (unprofessional for this project)
- ❌ **Static/Flat designs with no depth (FAILED)**
- ❌ Effects that hurt readability
- ❌ Animations without purpose

---

## 11. Pixel-Perfect High-Contrast Outlines

Technique for maintaining razor-sharp legibility on small pixelated text/icons against vibrant or busy backgrounds.

### The 4-Direction Sharp Shadow

Instead of using `blur`, use 4 directional offsets to create a solid 1px "border" around text. This is critical for the "Hybrid Retro-Modern" aesthetic.

```css
.pixel-outline {
  /* 4-directional 1px offsets with 0 blur */
  text-shadow:
    1px 1px 0 rgba(0, 0, 0, 0.8),
    -1px -1px 0 rgba(0, 0, 0, 0.8),
    1px -1px 0 rgba(0, 0, 0, 0.8),
    -1px 1px 0 rgba(0, 0, 0, 0.8);

  /* For dark backgrounds, use a light shadow or semi-transparent gray */
}
```

### 12. Discovery & Silhouette Effects

For catalog or inventory-based UI (catalog items, audit cards), use high-contrast filters to differentiate states:

- **Silhouette (Inactive)**: Use `filter: brightness(0.4)` to mute unselected elements.
- **Outline Enhancement**: Apply a subtle `drop-shadow(0 0 1px rgba(255,255,255,0.2))` to keep forms defined against dark backgrounds.
- **Placeholder Opacity**: Placeholder cards should maintain a readable base opacity (0.7-0.8) to keep the grid structure visible.

### 13. Decoupled Visual Effects

To prevent performance-killing filter stacks, separate the core visual layer from decorative effects:

- **Core Layer**: Applied to base elements (clean borders, contrast).
- **Decorative Layer**: Applied to a parent wrapper (glows, elevation, scale animations).
- **Benefit**: Allows independent management of visual layers and prevents filter composition overhead.

---

> **Remember**: Effects enhance meaning. Choose based on purpose and context, not because it "looks cool."
