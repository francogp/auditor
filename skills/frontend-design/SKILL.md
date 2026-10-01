---
name: frontend-design
description: Design thinking and decision-making for web UI. Use when designing components, layouts, color schemes, typography, or creating aesthetic interfaces. Teaches principles, not fixed values.
---

# Frontend Design System

> **Philosophy:** Every pixel has purpose. Restraint is luxury. User psychology drives decisions.
> **Core Principle:** THINK, don't memorize. ASK, don't assume.

---

## 🎯 Selective Reading Rule (MANDATORY)

**Read REQUIRED files always, OPTIONAL only when needed:**

| File | Status | When to Read |
| :--- | :--- | :--- |
| [ux-psychology.md](references/ux-psychology.md) | 🔴 **REQUIRED** | Always read first! |
| [color-system.md](references/color-system.md) | ⚪ Optional | Color/palette decisions |
| [typography-system.md](references/typography-system.md) | ⚪ Optional | Font selection/pairing |
| [visual-effects.md](references/visual-effects.md) | ⚪ Optional | Glassmorphism, shadows, gradients |
| [animation-guide.md](references/animation-guide.md) | ⚪ Optional | Animation needed |
| [motion-graphics.md](references/motion-graphics.md) | ⚪ Optional | Lottie, GSAP, 3D |
| [decision-trees.md](references/decision-trees.md) | ⚪ Optional | Context templates |

> 🔴 **ux-psychology.md = ALWAYS READ. Others = only if relevant.**

---

## ⚠️ CRITICAL: ASK BEFORE ASSUMING (MANDATORY)

> **STOP! If the user's request is open-ended, DO NOT default to your favorites.**

### When User Prompt is Vague, ASK

**Color not specified?** Ask:
> "What color palette do you prefer? (blue/green/orange/neutral/other?)"

**Style not specified?** Ask:
> "What style are you going for? (minimal/bold/retro/futuristic/organic?)"

**Layout not specified?** Ask:
> "Do you have a layout preference? (single column/grid/asymmetric/full-width?)"

### ⛔ DEFAULT TENDENCIES TO AVOID (ANTI-SAFE HARBOR)

| AI Default Tendency | Why It's Bad | Think Instead |
| :--- | :--- | :--- |
| **Bento Grids (Modern Cliché)** | Used in every AI design | Why does this content NEED a grid? |
| **Hero Split (Left/Right)** | Predictable & Boring | How about Massive Typography or Vertical Narrative? |
| **Mesh/Aurora Gradients** | The "new" lazy background | What's a radical color pairing? |
| **Glassmorphism** | AI's idea of "premium" | How about solid, high-contrast flat? |
| **Deep Cyan / Fintech Blue** | Safe harbor from purple ban | Why not Red, Black, or Neon Green? |
| **"Orchestrate / Empower"** | AI-generated copywriting | How would a human say this? |
| **Framed / Boxed Logos** | AI habit of wrapping logos in rounded bordered boxes with tinted backgrounds | Let logos breathe directly and cleanly on the background surface without artificial frames. |

---

## 1. Constraint Analysis (ALWAYS FIRST)

Before any design work, ANSWER THESE or ASK USER:

| Constraint | Question | Why It Matters |
| :--- | :--- | :--- |
| **Timeline** | How much time? | Determines complexity |
| **Content** | Ready or placeholder? | Affects layout flexibility |
| **Brand** | Existing guidelines? | May dictate colors/fonts |
| **Tech** | What stack? | Affects capabilities |
| **Audience** | Who exactly? | Drives all visual decisions |

---

## 2. UX Psychology Principles

### Core Laws (Internalize These)

| Law | Principle | Application |
| :--- | :--- | :--- |
| **Hick's Law** | More choices = slower decisions | Limit options, use progressive disclosure |
| **Fitts' Law** | Bigger + closer = easier to click | Size CTAs appropriately |
| **Miller's Law** | ~7 items in working memory | Chunk content into groups |
| **Von Restorff** | Different = memorable | Make CTAs visually distinct |
| **Serial Position** | First/last remembered most | Key info at start/end |

---

## 3. Layout Principles

### Golden Ratio (φ = 1.618)

```text
Use for proportional harmony:
├── Content : Sidebar = roughly 62% : 38%
├── Each heading size = previous × 1.618 (for dramatic scale)
├── Spacing can follow: sm → md → lg (each × 1.618)
```

### 8-Point Grid Concept

```text
All spacing and sizing in multiples of 8:
├── Tight: 4px (half-step for micro)
├── Small: 8px
├── Medium: 16px
├── Large: 24px, 32px
└── XL: 48px, 64px, 80px
```

### Key Sizing Principles

| Element | Consideration |
| :--- | :--- |
| **Touch targets** | Minimum comfortable tap size |
| **Buttons** | Height based on importance hierarchy |
| **Inputs** | Match button height for alignment |
| **Cards** | Consistent padding, breathable |
| **Reading width** | 45-75 characters optimal |

---

## 4. Asynchronous Interaction Feedback

- **REQUIRED**: Any UI element that triggers an asynchronous operation (RPC, Database Save, Auth) **MUST** provide immediate visual feedback.
- **Patterns**:
  - Show a loading spinner or "Processing..." state on the button itself.
  - Display a toast notification *before* or *during* the save operation.

---

## 5. Color Principles

### 60-30-10 Rule

```text
60% → Primary/Background (calm, neutral base)
30% → Secondary (supporting areas)
10% → Accent (CTAs, highlights, attention)
```

---

## 6. Typography Principles

### Scale Selection

| Content Type | Scale Ratio | Feel |
| :--- | :--- | :--- |
| Dense UI | 1.125-1.2 | Compact, efficient |
| General web | 1.25 | Balanced (most common) |
| Editorial | 1.333 | Readable, spacious |
| Hero/display | 1.5-1.618 | Dramatic impact |

---

## 7. Anti-Patterns (What NOT to Do)

### ❌ Lazy Design Indicators

- Default system fonts without consideration
- Stock imagery that doesn't match
- Inconsistent spacing
- Too many competing colors
- Walls of text without hierarchy

---

> **Note**: Project-specific UI rules (Hybrid Retro-Modern, SASS filters, specific badge layouts) are defined in the UI/UX Standards Manual.

---

## 8. Flex Layout — Dynamic Panel & Toolbar Patterns

> These patterns apply specifically to toolbars, side panels, and control zones where height must be strictly controlled by the primary center column and side zones must never cause layout shift.

### 8.1 Height Containment with `height: 0` + `min-height: 100%`

In a flex-container with `align-items: stretch`, a child with `height: auto` **contributes its intrinsic height** to the container (can expand the parent). A child with `height: 0` does **not** contribute — the container height is determined by other siblings — but `min-height: 100%` stretches the child to fill whatever height the container ends up being.

```scss
// ✅ CORRECT — does NOT expand the parent, but fills it
.flex-child {
  height: 0;
  min-height: 100%;
  overflow-y: auto;
}

// ❌ WRONG — expands the parent to fit its content
.flex-child {
  height: auto;
  min-height: 100%;
}
```

> **When to use:** Any sidebar or zone in a dashboard where height must be controlled by a center column, NOT by the zone's own content.

---

### 8.2 Exact Width Formula for N Fixed-Size Cards

To calculate the `flex-basis` / `max-width` that fits exactly N cards in one row:

```
width = N × card_width + (N-1) × gap + padding_left + padding_right + scrollbar_width
```

**Example — 6 Fixed-width cards:**

- `6 × 115px` (cards) + `5 × 6px` (gaps) + `4px + 4px` (grid padding) + `17px` (scrollbar) = **745px**

```scss
.zone-cards {
  flex: 0 1 745px; // Never wider than 6 cards; shrinks if needed → wraps to 2nd row
  max-width: 745px;
}
```

---

### 8.3 Vertical-Only Scroll in Flex Zones

To enable vertical scrolling without horizontal scrollbar in a flex child zone:

```scss
.scrollable-zone {
  height: 0;           // Containment (see 8.1)
  min-height: 100%;    // Fill parent
  overflow-y: auto;    // Vertical scrollbar when content overflows
  overflow-x: hidden;  // Never show horizontal scrollbar
}
```

> **Never use `overflow: hidden`** on zones that need to scroll — it silently clips content without giving the user a way to reach it.
