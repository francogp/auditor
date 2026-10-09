# Dart Sass 2.0+ Traps & Safe Compilation Reference

Technical reference for avoiding build crashes, warnings, and runtime regressions when compiling modern SCSS with Dart Sass and Vite.

---

## 1. CSS Function Collisions (The "X is not a color" Trap)

Dart Sass built-in color and math modules share names with standard CSS functions. When Sass parses lowercase `scale()`, `grayscale()`, or `invert()`, it attempts to evaluate them as Sass color manipulation functions:

| CSS Function | Sass Conflict | Error Symptom | Safe Output |
| :--- | :--- | :--- | :--- |
| `transform: scale(...)` | `color.scale()` | `Error: $color: ... is not a color` | `transform: Scale(...)` or `transform: scale(#{$v})` |
| `filter: grayscale(...)` | `color.grayscale()` | `Error: ... is not a color` | `filter: Grayscale(...)` or `filter: grayscale(#{0.8})` |
| `filter: invert(...)` | `color.invert()` | `Error: ... is not a color` | `filter: Invert(...)` or `filter: invert(#{1})` |
| `background: linear-gradient(...)` | Color parsing | Compilation crash in complex stops | `background: Linear-Gradient(...)` |

### Solution Hierarchy

1. **Automated Vite Plugin**: If the host project has `vite-plugin-sass-traps.ts`, developers write normal lowercase CSS, and Vite automatically capitalizes it during transform.
2. **Explicit Capitalization**: When writing raw SCSS without the plugin, capitalize the first letter (`Scale(1.05)`, `Grayscale(1)`, `Brightness(1.2)`).
3. **Interpolation `#{}`**: For dynamic or variable expressions, use interpolation: `transform: scale(#{$zoom});`.
4. **Forbidden**: Do NOT use `string.unquote()`. It adds boilerplate, harms readability, and creates lint warnings.

---

## 2. Deprecated Built-ins Migration

Dart Sass 2.0 has deprecated global helper functions. Using them prints loud warnings and will fail in Dart Sass 3.0:

```scss
// ❌ Deprecated (Dart Sass 1.x)
$rnd: random(100);
$round: round(10.4);
$ceil: ceil(10.1);
$pct: percentage(0.75);
$tint: lighten($color, 15%);
$shade: darken($color, 15%);

// ✅ Modern (Dart Sass 2.0+)
@use "sass:math";
@use "sass:color";

$rnd: math.random(100);
$round: math.round(10.4);
$ceil: math.ceil(10.1);
$pct: math.percentage(0.75);
$tint: color.scale($color, $lightness: 15%);
$shade: color.scale($color, $lightness: -15%);
```

---

## 3. Selector & Mixin Comma Trap

In Dart Sass, combining a CSS selector with an `@include` statement in a comma-separated list is invalid syntax and triggers fatal preprocessor 500 errors:

```scss
// ❌ FORBIDDEN: Preprocessor Syntax Error
&.is-active,
@include responsive(768px) {
  display: block;
}

// ✅ MANDATORY: Distinct rules
&.is-active {
  display: block;
}

@include responsive(768px) {
  display: block;
}
```

---

## 4. Production Build Mixin Isolation Trap

* **Dev vs Prod Behavior**: In Vite development mode (HMR), SCSS mixins and variables may accidentally resolve globally across files because modules are bundled dynamically in the browser runtime.
* **Production Build Failure**: The production bundler (`rollup` / `vite build`) processes each SCSS file or Vue SFC style block in strict isolation.
* **Rule**: If a partial (e.g. `_buttons.scss`) uses a mixin defined in another partial (e.g. `_layout.scss`), it **MUST** include `@use '@/styles/core/layout' as *;` locally at the top of the file, even if `npm run dev` appeared to work without it.
