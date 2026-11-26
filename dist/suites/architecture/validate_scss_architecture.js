import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { GSAP_SCSS_ANIMATION_RULES, MODERN_SCSS_RULES, SCSS_ANIMATION_RULES, UNIVERSAL_SCSS_ANIMATION_RULES, analyzeModernScss } from "../../analyzers/scssModernAnalyzer.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { hasPackageDependency } from "../../core/packageJson.js";
import { stripCommentsAndStrings } from "../../core/scannerUtils.js";
import { parseVueSfc as parseVueSfcBlocks } from "../../core/vueSfcParser.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_scss_architecture.ts
enableCompileCache();
const SCSS_ARCHITECTURE_RULES = [
	"raw-css-in-sfc",
	"scss-deep-selector-abuse",
	"non-standard-spacing-unit",
	"missing-theme-token-usage",
	"excessive-scss-nesting",
	...MODERN_SCSS_RULES,
	...SCSS_ANIMATION_RULES
];
const SCANNABLE_EXTS = /* @__PURE__ */ new Set([
	".scss",
	".vue",
	".css"
]);
var ValidateScssArchitectureAuditor = class extends FileScanAuditor {
	hasGsap;
	gsapNotApplicableMarked = false;
	constructor(options = {}) {
		const scssRoots = resolveFileScanRoots(options);
		const scssConfig = getAuditConfig(scssRoots.effectiveRoot);
		const hasGsap = hasPackageDependency(scssRoots.effectiveRoot, "gsap");
		super({
			ruleFixers: {},
			fixableRuleIds: [...MODERN_SCSS_RULES],
			id: "validate_scss_architecture",
			name: "SCSS Architecture & Distinctive Design Validator",
			description: "SCSS architecture, tokenization, and distinctive styling",
			family: "architecture",
			packageName: "SCSSArch",
			icon: "🎨",
			configKey: "scssArchitecture.enabled",
			defaultConfig: {
				enabled: true,
				maxNestingDepth: 3,
				scopedMaxNestingDepth: 4,
				allowPixelArtSpacing: false,
				allowedSpacingUnits: [],
				allowScopedColors: false,
				exemptPaths: []
			},
			criticalConfig: {},
			requiredPermissions: [],
			usesThirdPartyTool: false,
			roots: scssRoots.targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: SCSS_ARCHITECTURE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SCSS_ARCHITECTURE_RULES, "hygiene"),
			ruleDescriptions: {
				"raw-css-in-sfc": "<style> tag missing lang=\"scss\"",
				"scss-deep-selector-abuse": "Abuse or nesting of :deep()",
				"non-standard-spacing-unit": "Arbitrary spacing outside token scale",
				"missing-theme-token-usage": "Hardcoded color without theme token",
				"excessive-scss-nesting": "SCSS nesting exceeds 3 levels",
				"scss-viewport-overflow-and-dvh": "100vw overflow or static 100vh unit",
				"scss-overflow-clip-margin-trap": "overflow-clip-margin without clip",
				"scss-prefer-user-invalid": "Use :user-invalid instead of :invalid",
				"scss-focus-outline-removal": "Focus outline removed without fallback",
				"typography-unclamped-viewport-font": "Unclamped vw/vh font-size breaks zoom",
				"scss-flexbox-dead-properties": "Dead justify-self in flex container",
				"scss-universal-expensive-selectors": "Expensive property on universal * rule",
				"dark-mode-color-scheme-missing": "Dark mode missing root color-scheme",
				"scss-transition-all": "Avoid transition: all",
				"scss-layout-property-animation": "Avoid animating layout CSS properties",
				"scss-will-change-in-keyframes": "Avoid will-change inside @keyframes",
				"scss-gsap-transform-important": "Avoid transform !important with GSAP",
				"scss-gsap-smooth-scroll": "Avoid root scroll-behavior: smooth",
				"scss-gsap-stagger-for-loop": "Use GSAP stagger instead of @for delay",
				"scss-gsap-auto-alpha-candidate": "Use GSAP autoAlpha instead of CSS",
				"scss-gsap-svg-stroke-animation": "Use DrawSVGPlugin for stroke-dashoffset"
			},
			ruleRemediations: {
				"raw-css-in-sfc": "📖 REMEDIATION GUIDE: raw-css-in-sfc\n1. Root Cause: A `<style>` tag was found in a Vue SFC without the `lang=\"scss\"` attribute. Framework architecture standardizes the SCSS preprocessor across all components.\n2. Diagnosis: Locate the `<style>` tag in the Vue component.\n3. Canonical Solution: Add `lang=\"scss\"` (and `scoped` where appropriate): `<style lang=\"scss\" scoped>`.\n4. Example / Auto-fix command:\n   ❌ Incorrect: `<style scoped>`\n   ✅ Correct:   `<style lang=\"scss\" scoped>`",
				"scss-deep-selector-abuse": "📖 REMEDIATION GUIDE: scss-deep-selector-abuse\n1. Root Cause: Nested `:deep()` was used within another `:deep()` (`:deep(.a :deep(.b))`), or multiple chained compound selectors were passed into `:deep()`. This breaks style encapsulation.\n2. Diagnosis: Locate the CSS rule with `:deep()` at the reported line.\n3. Canonical Solution: Apply `:deep()` once at the root level of the target child selector: `:deep(.target-class)`.\n4. Example / Auto-fix command:\n   ❌ Abuse:     `:deep(.parent) :deep(.child)`\n   ✅ Canonical: `:deep(.parent .child)`",
				"non-standard-spacing-unit": "📖 REMEDIATION GUIDE: non-standard-spacing-unit\n1. Root Cause: An arbitrary pixel spacing value was used (e.g. `margin: 13px`, `padding: 27px`) that does not align with modular design tokens (multiples of 4px/8px).\n2. Diagnosis: Inspect the margin, padding, or gap property at the reported line.\n3. Canonical Solution:\n   a) Replace the value with a design token: `var(--spacing-md)` or `$spacing-4`.\n   b) Round to the nearest canonical grid multiple (e.g. 12px or 16px instead of 13px).\n4. Example / Auto-fix command:\n   ❌ Arbitrary: `padding: 15px;`\n   ✅ On-grid:   `padding: var(--space-4, 16px);`",
				"missing-theme-token-usage": "📖 REMEDIATION GUIDE: missing-theme-token-usage\n1. Root Cause: A hardcoded color literal (`#fff`, `rgb(...)`, `#1e293b`) was found instead of theme tokens or CSS variables. Hardcoded colors prevent dynamic theming (Dark/Light mode).\n2. Diagnosis: Locate the literal color at the reported line.\n3. Canonical Solution: Replace the color with the corresponding semantic theme variable (e.g. `var(--color-surface)`, `var(--color-primary-text)`).\n4. Example / Auto-fix command:\n   ❌ Hardcoded: `background-color: #0f172a; color: #ffffff;`\n   ✅ Tokenized: `background-color: var(--color-bg-primary); color: var(--color-text-primary);`",
				"excessive-scss-nesting": "📖 REMEDIATION GUIDE: excessive-scss-nesting\n1. Root Cause: SCSS rules were nested beyond 3 levels deep, inflating selector specificity and harming maintainability.\n2. Diagnosis: Examine nested braces in the stylesheet.\n3. Canonical Solution: Flatten SCSS rules using BEM methodology or direct class selectors.\n4. Example / Auto-fix command:\n   ❌ Deep nesting: `.card { .header { .title { span { color: red; } } } }`\n   ✅ Flattened:    `.card__title-highlight { color: var(--color-danger); }`",
				"scss-viewport-overflow-and-dvh": "📖 REMEDIATION GUIDE: scss-viewport-overflow-and-dvh\n1. Root Cause: `width: 100vw` includes vertical scrollbar width (causing horizontal scrollbars), and `100vh` ignores dynamic mobile browser toolbars.\n2. Diagnosis: Inspect the viewport unit declaration at the reported line.\n3. Canonical Solution: Use `width: 100%` (or `100dvw`) and `100dvh` for vertical viewport sizing. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Legacy: `width: 100vw; min-height: 100vh;`\n   ✅ Modern: `width: 100%; min-height: 100dvh;`",
				"scss-overflow-clip-margin-trap": "📖 REMEDIATION GUIDE: scss-overflow-clip-margin-trap\n1. Root Cause: `overflow-clip-margin` was declared on an element without `overflow: clip`. Browsers ignore `overflow-clip-margin` when `overflow: hidden` is used.\n2. Diagnosis: Inspect the CSS rule block containing `overflow-clip-margin`.\n3. Canonical Solution: Pair `overflow-clip-margin` with `overflow: clip`. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Ignored: `overflow: hidden; overflow-clip-margin: 8px;`\n   ✅ Working: `overflow: clip; overflow-clip-margin: 8px;`",
				"scss-prefer-user-invalid": "📖 REMEDIATION GUIDE: scss-prefer-user-invalid\n1. Root Cause: The `:invalid` pseudo-class matches required empty inputs immediately on page load before the user interacts with the form.\n2. Diagnosis: Locate the `:invalid` selector in the stylesheet.\n3. Canonical Solution: Replace `:invalid` with `:user-invalid` so error styling activates only after user interaction. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Premature: `input:invalid { border-color: var(--danger); }`\n   ✅ Modern:    `input:user-invalid { border-color: var(--danger); }`",
				"scss-focus-outline-removal": "📖 REMEDIATION GUIDE: scss-focus-outline-removal\n1. Root Cause: `outline: none` or `outline: 0` was set on `:focus` or `:focus-visible` without a visible replacement focus ring, breaking keyboard navigation (WCAG 2.4.7).\n2. Diagnosis: Inspect the `:focus` rule at the reported line.\n3. Canonical Solution: Use `:focus:not(:focus-visible)` to hide mouse focus rings while preserving keyboard `:focus-visible` indicators. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Inaccessible: `.btn:focus { outline: none; }`\n   ✅ Accessible:   `.btn:focus:not(:focus-visible) { outline: none; }`",
				"typography-unclamped-viewport-font": "📖 REMEDIATION GUIDE: typography-unclamped-viewport-font\n1. Root Cause: `font-size` is defined solely in viewport units (`vw`/`vh`) without `clamp()` or `rem`, preventing text from scaling when users zoom to 200% (WCAG 1.4.4).\n2. Diagnosis: Inspect the `font-size` declaration.\n3. Canonical Solution: Wrap fluid typography in `clamp(minRem, calc(rem + vw), maxRem)`. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Zoom-locked: `font-size: 4vw;`\n   ✅ Accessible:  `font-size: clamp(1rem, calc(0.5rem + 4vw), 2.5rem);`",
				"scss-flexbox-dead-properties": "📖 REMEDIATION GUIDE: scss-flexbox-dead-properties\n1. Root Cause: `justify-self` is declared inside a Flexbox rule (`display: flex`). Per CSS Box Alignment, `justify-self` has no effect in Flexbox.\n2. Diagnosis: Locate `justify-self` in the flex rule block.\n3. Canonical Solution: Use `justify-content` on the flex container or `margin-inline-start: auto` on the flex item. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Dead property: `.row { display: flex; justify-self: center; }`\n   ✅ Effective:     `.row { display: flex; justify-content: center; }`",
				"scss-universal-expensive-selectors": "📖 REMEDIATION GUIDE: scss-universal-expensive-selectors\n1. Root Cause: An expensive layout or compositor property (`text-wrap: balance/pretty` or `will-change`) is applied to the universal selector `*`, degrading rendering performance.\n2. Diagnosis: Inspect the `*` rule in the stylesheet.\n3. Canonical Solution: Scope `text-wrap: balance` strictly to headings (`h1, h2, h3, h4, h5, h6`) and `will-change` only to active animated elements. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Expensive: `* { text-wrap: balance; }`\n   ✅ Scoped:    `h1, h2, h3, h4, h5, h6 { text-wrap: balance; }`",
				"dark-mode-color-scheme-missing": "📖 REMEDIATION GUIDE: dark-mode-color-scheme-missing\n1. Root Cause: The stylesheet defines `@media (prefers-color-scheme: dark)` rules but `:root` lacks `color-scheme: light dark`, leaving native scrollbars, form controls, and system UI surfaces in light mode.\n2. Diagnosis: Check the `:root` rule in the main stylesheet.\n3. Canonical Solution: Add `color-scheme: light dark;` to `:root`. Run `npm run auditor:fix`.\n4. Example / Auto-fix command:\n   ❌ Incomplete: `:root { --bg: #fff; }`\n   ✅ Complete:   `:root { color-scheme: light dark; --bg: #fff; }`",
				"scss-transition-all": "📖 REMEDIATION GUIDE: scss-transition-all\n1. Root Cause: `transition: all` forces the browser to watch and recalculate layout and paint properties across every style change.\n2. Diagnosis: Locate `transition: all` or `transition-property: all` at the reported line.\n3. Canonical Solution: Restrict CSS transitions to explicit compositor/color properties (`opacity`, `transform`, `color`, `background-color`) or orchestrate the animation in GSAP.\n4. Example:\n   ❌ Incorrect: `.card { transition: all 0.3s ease; }`\n   ✅ Correct:   `.card { transition: color 0.2s ease; } // or gsap.to(\".card\", { y: -4, duration: 0.3 })`",
				"scss-layout-property-animation": "📖 REMEDIATION GUIDE: scss-layout-property-animation\n1. Root Cause: Animating layout properties (`top`, `left`, `width`, `height`, `margin`, `padding`, `gap`) in CSS `transition` or `@keyframes` triggers expensive layout reflows on every frame.\n2. Diagnosis: Inspect the `transition` property list or `@keyframes` declaration at the reported line.\n3. Canonical Solution: Animate compositor transforms (`transform` / GSAP `x`, `y`, `scale`) and `opacity`, or use GSAP `Flip` for layout transitions.\n4. Example:\n   ❌ Incorrect: `@keyframes slide { from { left: 0; } to { left: 100px; } }`\n   ✅ Correct:   `gsap.to(\".panel\", { x: 100, duration: 0.4, ease: \"power2.out\" });`",
				"scss-will-change-in-keyframes": "📖 REMEDIATION GUIDE: scss-will-change-in-keyframes\n1. Root Cause: Declaring `will-change` inside `@keyframes` forces mid-animation GPU layer promotion and de-promotion, causing visual flicker and memory spikes.\n2. Diagnosis: Locate `will-change` inside the `@keyframes` block at the reported line.\n3. Canonical Solution: Remove `will-change` from `@keyframes`. Let GSAP manage `force3D: \"auto\"` or apply `will-change` sparingly on the active element class.\n4. Example:\n   ❌ Incorrect: `@keyframes pop { 0% { will-change: transform; transform: scale(0.9); } }`\n   ✅ Correct:   `gsap.from(\".pop\", { scale: 0.9, duration: 0.3, clearProps: \"transform\" });`",
				"scss-gsap-transform-important": "📖 REMEDIATION GUIDE: scss-gsap-transform-important\n1. Root Cause: `transform: ... !important` in CSS overrides GSAP inline `transform` matrices, silently breaking tweens and timelines.\n2. Diagnosis: Locate `transform: ... !important` outside `@media (prefers-reduced-motion: reduce)`.\n3. Canonical Solution: Remove `!important` and manage initial or state transforms with `gsap.set()` / `gsap.to()` inside `gsap.context()`.\n4. Example:\n   ❌ Incorrect: `.drawer.is-open { transform: translateX(0) !important; }`\n   ✅ Correct:   `gsap.to(\".drawer\", { x: 0, duration: 0.35, ease: \"power3.out\" });`",
				"scss-gsap-smooth-scroll": "📖 REMEDIATION GUIDE: scss-gsap-smooth-scroll\n1. Root Cause: `scroll-behavior: smooth` on `html`, `body`, or `:root` fights GSAP `ScrollTrigger` and `ScrollSmoother` velocity calculations and programmatic scroll jumps.\n2. Diagnosis: Locate `scroll-behavior: smooth` on root scroller selectors.\n3. Canonical Solution: Remove CSS root `scroll-behavior: smooth` and register GSAP `ScrollToPlugin` for animated anchor jumps.\n4. Example:\n   ❌ Incorrect: `html { scroll-behavior: smooth; }`\n   ✅ Correct:   `gsap.registerPlugin(ScrollToPlugin); gsap.to(window, { scrollTo: \"#section\", duration: 0.6 });`",
				"scss-gsap-stagger-for-loop": "📖 REMEDIATION GUIDE: scss-gsap-stagger-for-loop\n1. Root Cause: `@for` / `@each` loops emitting static `transition-delay` or `animation-delay` values duplicate work better handled by GSAP `stagger` and cannot adapt dynamically to filtered or reordered elements.\n2. Diagnosis: Inspect the `@for` or `@each` block generating `transition-delay` / `animation-delay`.\n3. Canonical Solution: Replace SCSS delay loops with `gsap.from(items, { opacity: 0, y: 16, stagger: 0.06 })`.\n4. Example:\n   ❌ Incorrect: `@for $i from 1 through 6 { .item:nth-child(#{$i}) { transition-delay: #{$i * 50}ms; } }`\n   ✅ Correct:   `gsap.from(\".item\", { autoAlpha: 0, y: 16, duration: 0.4, stagger: 0.05 });`",
				"scss-gsap-auto-alpha-candidate": "📖 REMEDIATION GUIDE: scss-gsap-auto-alpha-candidate\n1. Root Cause: Combining `opacity: 0`, `visibility: hidden` (or `pointer-events: none`), and a CSS `transition` on `opacity`/`visibility` in a GSAP project duplicates GSAP `autoAlpha` and risks conflicting transitions.\n2. Diagnosis: Locate the rule block combining `opacity: 0` with `visibility: hidden` / `pointer-events: none` and `transition`.\n3. Canonical Solution: Animate visibility reveals with GSAP `autoAlpha` (`gsap.set(el, { autoAlpha: 0 })` and `gsap.to(el, { autoAlpha: 1 })`).\n4. Example:\n   ❌ Incorrect: `.modal { opacity: 0; visibility: hidden; transition: opacity 0.3s, visibility 0.3s; }`\n   ✅ Correct:   `gsap.to(\".modal\", { autoAlpha: 1, duration: 0.3, ease: \"power2.out\" });`",
				"scss-gsap-svg-stroke-animation": "📖 REMEDIATION GUIDE: scss-gsap-svg-stroke-animation\n1. Root Cause: Animating `stroke-dashoffset` in CSS `transition` or `@keyframes` requires brittle hardcoded path lengths and breaks across SVG viewport scaling.\n2. Diagnosis: Inspect the `stroke-dashoffset` animation in `transition` or `@keyframes`.\n3. Canonical Solution: Register GSAP `DrawSVGPlugin` (`gsap.registerPlugin(DrawSVGPlugin)`) and animate `{ drawSVG: \"0% 100%\" }`.\n4. Example:\n   ❌ Incorrect: `@keyframes draw { from { stroke-dashoffset: 320; } to { stroke-dashoffset: 0; } }`\n   ✅ Correct:   `gsap.registerPlugin(DrawSVGPlugin); gsap.from(\".path\", { drawSVG: 0, duration: 0.8 });`"
			},
			ruleCapabilities: createRuleCapabilities(SCSS_ARCHITECTURE_RULES, LIGHT_RULE_CAPABILITIES),
			projectRoot: scssRoots.effectiveRoot,
			coverage: deriveCoverageFromRoots(scssRoots.targetRoots, SCANNABLE_EXTS, scssRoots.effectiveRoot),
			exemptPaths: scssConfig.scssArchitecture?.exemptPaths
		});
		this.hasGsap = hasGsap;
	}
	scanFile(relPath, content) {
		const isVueSfc = relPath.endsWith(".vue");
		const isScssFile = relPath.endsWith(".scss");
		const isCssFile = relPath.endsWith(".css");
		const isFix = this.isFixActive();
		const absFile = path.resolve(this.projectRoot, relPath);
		if (!this.hasGsap && !this.gsapNotApplicableMarked) {
			this.gsapNotApplicableMarked = true;
			for (const gsapRuleId of GSAP_SCSS_ANIMATION_RULES) this.markRuleNotApplicable(gsapRuleId, "gsap is not declared in package.json");
		}
		this.runSubAuditorSync("raw-css-in-sfc", () => {
			if (isVueSfc) this.auditRawCssInSfc(relPath, content);
		});
		if (isVueSfc) {
			const sfc = parseVueSfcBlocks(content);
			let updatedSfc = content;
			let sfcMutated = false;
			for (let i = sfc.styles.length - 1; i >= 0; i--) {
				const block = sfc.styles[i];
				this.auditStyleBlockRules(relPath, block.content, block.contentStartLine, block.isScoped, (fixedBlock) => {
					updatedSfc = updatedSfc.slice(0, block.contentStartIndex) + fixedBlock + updatedSfc.slice(block.contentStartIndex + block.content.length);
					sfcMutated = true;
				});
			}
			if (isFix && sfcMutated) fs.writeFileSync(absFile, updatedSfc, "utf-8");
		} else if (isScssFile || isCssFile) this.auditStyleBlockRules(relPath, content, 1, false, (fixedStyle) => {
			fs.writeFileSync(absFile, fixedStyle, "utf-8");
		});
	}
	auditStyleBlockRules(relPath, styleContent, startLine, isScoped, onFixed) {
		const isFix = this.isFixActive();
		this.runSubAuditorSync("scss-deep-selector-abuse", () => {
			this.auditScssDeepSelectorAbuse(relPath, styleContent, startLine);
		});
		this.runSubAuditorSync("non-standard-spacing-unit", () => {
			this.auditNonStandardSpacingUnit(relPath, styleContent, startLine);
		});
		this.runSubAuditorSync("missing-theme-token-usage", () => {
			this.auditMissingThemeTokenUsage(relPath, styleContent, startLine, isScoped);
		});
		this.runSubAuditorSync("excessive-scss-nesting", () => {
			this.auditExcessiveScssNesting(relPath, styleContent, startLine, isScoped);
		});
		const modernRes = analyzeModernScss(styleContent, startLine, isFix, { hasGsap: this.hasGsap });
		const activeRules = this.hasGsap ? [...MODERN_SCSS_RULES, ...SCSS_ANIMATION_RULES] : [...MODERN_SCSS_RULES, ...UNIVERSAL_SCSS_ANIMATION_RULES];
		for (const ruleId of activeRules) this.runSubAuditorSync(ruleId, () => {
			for (const finding of modernRes.findings) {
				if (finding.ruleId !== ruleId) continue;
				this.addViolation({
					ruleId: finding.ruleId,
					severity: "error",
					file: relPath,
					line: finding.line,
					message: finding.message,
					fixable: finding.fixable
				});
			}
		});
		if (isFix && modernRes.fixedContent !== void 0) onFixed(modernRes.fixedContent);
	}
	auditRawCssInSfc(relPath, content) {
		if (!relPath.endsWith(".vue")) return;
		const sfc = parseVueSfcBlocks(content);
		for (const block of sfc.styles) if (block.lang?.toLowerCase() !== "scss") this.addViolation({
			ruleId: "raw-css-in-sfc",
			severity: "error",
			message: "<style> block in SFC component missing mandatory lang=\"scss\" attribute",
			file: relPath,
			line: block.startLine
		});
	}
	auditScssDeepSelectorAbuse(relPath, content, lineOffset = 1) {
		const nestedDeepRegex = /:deep\([^)]*\)[^{};]*:deep\(/g;
		let nestedMatch;
		while ((nestedMatch = nestedDeepRegex.exec(content)) !== null) {
			const line = lineOffset + this.getLineNumber(content, nestedMatch.index) - 1;
			this.addViolation({
				ruleId: "scss-deep-selector-abuse",
				severity: "error",
				message: "Nested :deep() selector inside another :deep() in the same rule",
				file: relPath,
				line
			});
		}
		const complexDeepRegex = /:deep\(\s*([^)]+)\s*\)/g;
		let complexMatch;
		while ((complexMatch = complexDeepRegex.exec(content)) !== null) {
			const parts = (complexMatch[1] ?? "").trim().split(/\s+/).filter(Boolean);
			if (parts.length > 3) {
				const line = lineOffset + this.getLineNumber(content, complexMatch.index) - 1;
				this.addViolation({
					ruleId: "scss-deep-selector-abuse",
					severity: "error",
					message: `Overly complex selector chain inside :deep() (${parts.length} selectors > 3)`,
					file: relPath,
					line
				});
			}
		}
	}
	auditNonStandardSpacingUnit(relPath, content, lineOffset = 1) {
		const config = getAuditConfig(this.projectRoot);
		if (config.scssArchitecture?.allowPixelArtSpacing) return;
		const allowedUnits = new Set(config.scssArchitecture?.allowedSpacingUnits ?? []);
		const arbitrarySpacingRegex = /(?:margin(?:-(?:top|bottom|left|right|inline|block))?|padding(?:-(?:top|bottom|left|right|inline|block))?|gap|row-gap|column-gap)\s*:[^;]*?\b(1[13579]|2[13579]|3[13579]|7|9|13|17|23|27)px\b/gi;
		let match;
		while ((match = arbitrarySpacingRegex.exec(content)) !== null) {
			const val = match[1];
			const unitStr = `${val}px`;
			if (allowedUnits.has(unitStr) || allowedUnits.has(val)) continue;
			const line = lineOffset + this.getLineNumber(content, match.index) - 1;
			this.addViolation({
				ruleId: "non-standard-spacing-unit",
				severity: "error",
				message: `Arbitrary spacing value (${unitStr}) outside standard scale or without design token`,
				file: relPath,
				line
			});
		}
	}
	auditMissingThemeTokenUsage(relPath, content, lineOffset = 1, isScoped = false) {
		const config = getAuditConfig(this.projectRoot);
		if (isScoped && config.scssArchitecture?.allowScopedColors) return;
		const hardcodedColorRegex = /(?:color|background-color|background|border-color|fill|stroke)\s*:\s*([^;{}]*)/gi;
		let match;
		while ((match = hardcodedColorRegex.exec(content)) !== null) {
			const val = match[1] ?? "";
			if (val.includes("var(") || val.includes("$") || val.includes("transparent") || val.includes("currentColor") || val.includes("inherit")) continue;
			const hasHex = /#[0-9a-f]{3,8}\b/i.test(val);
			const hasRgb = /\brgba?\([^)]+\)/.test(val);
			if (hasHex || hasRgb) {
				const line = lineOffset + this.getLineNumber(content, match.index) - 1;
				this.addViolation({
					ruleId: "missing-theme-token-usage",
					severity: "error",
					message: "Hardcoded hex or rgb color without using design system token or variable",
					file: relPath,
					line
				});
			}
		}
	}
	processScssLineBraces(line, blockStack, maxAllowedDepth, onViolation) {
		for (let c = 0; c < line.length; c++) {
			const char = line[c];
			if (char === "{") {
				const isAtRule = line.slice(0, c).trim().startsWith("@");
				blockStack.push(isAtRule ? "atrule" : "selector");
				if (!isAtRule) {
					const selectorDepth = blockStack.filter((b) => b === "selector").length;
					if (selectorDepth > maxAllowedDepth) onViolation(selectorDepth);
				}
			} else if (char === "}") blockStack.pop();
		}
	}
	auditExcessiveScssNesting(relPath, content, lineOffset = 1, isScoped = false) {
		const config = getAuditConfig(this.projectRoot);
		const maxAllowedDepth = isScoped ? config.scssArchitecture?.scopedMaxNestingDepth ?? 4 : config.scssArchitecture?.maxNestingDepth ?? 3;
		const lines = stripCommentsAndStrings(content).split("\n");
		const blockStack = [];
		for (let i = 0; i < lines.length; i++) this.processScssLineBraces(lines[i], blockStack, maxAllowedDepth, (depth) => {
			this.addViolation({
				ruleId: "excessive-scss-nesting",
				severity: "error",
				message: `Excessive SCSS nesting (${depth} levels > ${maxAllowedDepth}); flatten selectors with BEM or semantic classes`,
				file: relPath,
				line: lineOffset + i
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScssArchitectureAuditor());
export { SCSS_ARCHITECTURE_RULES, ValidateScssArchitectureAuditor };
