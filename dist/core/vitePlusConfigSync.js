import { getAuditConfig } from "./auditConfigLoader.js";
import "./auditConfig.js";
import path from "node:path";
import fs from "node:fs";
import childProcess from "node:child_process";
//#region src/core/vitePlusConfigSync.ts
/**
* packages/auditor/src/core/vitePlusConfigSync.ts
*
* CANONICAL VITE+ (vp) CONFIGURATION BUILDER & SYNCHRONIZER (Node.js 26+ Native)
* Generates and synchronizes vite.config.ts from .auditor/audit.config.ts (SSoT).
* Eradicates standalone ESLint, Vitest, and tsdown configs in favor of unified Vite+.
*/
const LEGACY_CONFIG_FILES = [
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.ts",
	".eslintrc.js",
	".eslintrc.cjs",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	"vitest.config.ts",
	"vitest.config.js",
	"vitest.config.mjs",
	"tsdown.config.ts",
	"tsdown.config.js",
	"tsconfig.build.json",
	".oxlintrc.json",
	".oxfmtrc.json"
];
/**
* Scans for legacy ESLint configuration files and extracts globalIgnores entries.
*/
function findLegacyEslintIgnores(projectRoot) {
	for (const candidate of [
		"eslint.config.js",
		"eslint.config.mjs",
		"eslint.config.ts",
		".eslintrc.json"
	]) {
		const candidatePath = path.resolve(projectRoot, candidate);
		if (!fs.existsSync(candidatePath)) continue;
		try {
			const raw = fs.readFileSync(candidatePath, "utf-8");
			const match = /(?:globalIgnores\s*\(\s*\[([\s\S]*?)\]\s*\)|ignores\s*:\s*\[([\s\S]*?)\])/m.exec(raw);
			const capturedArray = match ? match[1] || match[2] : null;
			if (!capturedArray) continue;
			const globs = [];
			const stringRegex = /['"]([^'"]+)['"]/g;
			let m;
			while ((m = stringRegex.exec(capturedArray)) !== null) if (m[1]) globs.push(m[1]);
			if (globs.length > 0) return globs;
		} catch {}
	}
	return [];
}
/**
* Resolves all canonical ignore globs derived from audit.config.ts (SSoT).
* Evaluates paths.ignoreGlobs, paths.ignoredDirs, paths.ignoredPatterns,
* test roots (when paths.includeTestsInCodeAudit === false), legacy ESLint
* globalIgnores, and target-specific exclusions (lint or fmt).
*/
function resolveAuditConfigIgnoreGlobs(config, target = "lint", projectRoot) {
	const baseIgnores = [
		"dist/**",
		"dev-dist/**",
		"node_modules/**",
		"scratch/**",
		"tmp/**",
		".agents/**",
		"coverage/**",
		"**/*.d.ts"
	];
	if (target === "fmt") baseIgnores.push("package-lock.json");
	const projectIgnores = config.paths?.ignoreGlobs ?? [];
	const dirIgnores = (config.paths?.ignoredDirs ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
	const patternIgnores = config.paths?.ignoredPatterns ?? [];
	const exemptFiles = config.paths?.exemptFiles ?? [];
	const testIgnores = [];
	if (target === "lint" && config.paths?.includeTestsInCodeAudit === false) {
		const testRoots = config.paths.testRoots ?? ["tests"];
		const e2eRoots = config.paths.e2eRoots ?? [];
		const integrationRoots = config.paths.integrationRoots ?? [];
		for (const r of [
			...testRoots,
			...e2eRoots,
			...integrationRoots
		]) {
			const glob = r.endsWith("/**") ? r : `${r}/**`;
			testIgnores.push(glob);
		}
		testIgnores.push("**/*.spec.ts", "**/*.test.ts", "**/*.simulation.ts");
	}
	const degradationIgnores = (config.coverage?.acknowledgedDegradations ?? []).map((d) => d.glob);
	const coverageExemptIgnores = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
	const testCoverageExemptIgnores = config.testCoverage?.exemptGlobs ?? [];
	const dataDemoIgnores = [];
	if (target === "lint") {
		const dataRoots = (config.paths?.dataRoots ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
		const demoRoots = (config.paths?.demoRoots ?? []).map((d) => d.endsWith("/**") ? d : `${d}/**`);
		dataDemoIgnores.push(...dataRoots, ...demoRoots);
	}
	const legacyIgnores = projectRoot ? findLegacyEslintIgnores(projectRoot) : [];
	const specificTargetIgnores = target === "lint" ? config.vitePlusConfig?.lint?.ignorePatterns ?? [] : config.vitePlusConfig?.fmt?.ignorePatterns ?? [];
	return Array.from(/* @__PURE__ */ new Set([
		...baseIgnores,
		...projectIgnores,
		...dirIgnores,
		...patternIgnores,
		...exemptFiles,
		...degradationIgnores,
		...coverageExemptIgnores,
		...testCoverageExemptIgnores,
		...dataDemoIgnores,
		...testIgnores,
		...legacyIgnores,
		...specificTargetIgnores
	]));
}
function buildCanonicalVitePlusConfig(auditConfig, projectRoot) {
	const isLibrary = auditConfig.packageDistribution?.enabled !== false;
	const coverageThreshold = auditConfig.testCoverage?.threshold ?? 80;
	const packSection = isLibrary ? `  pack: {
    entry: ['src/index.ts', 'src/cli/*.ts', 'src/suites/**/*.ts'],
    unbundle: true,
    dts: true,
    publint: true,
    attw: { profile: 'esm-only' },
    outExtensions: () => ({ js: '.js', dts: '.d.ts' })
  },\n` : "";
	const fmtCfg = auditConfig.vitePlusConfig?.fmt;
	const singleQuote = fmtCfg?.singleQuote ?? true;
	const semi = fmtCfg?.semi ?? true;
	const trailingComma = fmtCfg?.trailingComma ?? "none";
	const printWidth = fmtCfg?.printWidth ?? 100;
	const sortPackageJson = fmtCfg?.sortPackageJson ?? true;
	const tabWidthLine = fmtCfg?.tabWidth !== void 0 ? `\n    tabWidth: ${fmtCfg.tabWidth},` : "";
	const useTabsLine = fmtCfg?.useTabs !== void 0 ? `\n    useTabs: ${fmtCfg.useTabs},` : "";
	const lintCfg = auditConfig.vitePlusConfig?.lint;
	const typeAware = lintCfg?.typeAware ?? true;
	const typeCheck = lintCfg?.typeCheck ?? true;
	let categoriesSection = "";
	if (lintCfg?.categories && Object.keys(lintCfg.categories).length > 0) categoriesSection = `\n    categories: {\n${Object.entries(lintCfg.categories).map(([k, v]) => `      '${k}': '${v}'`).join(",\n")}\n    },`;
	let overridesSection = "";
	if (lintCfg?.overrides && lintCfg.overrides.length > 0) overridesSection = `,\n    overrides: [\n${lintCfg.overrides.map((ov) => {
		return `      {\n        files: ${JSON.stringify(ov.files)},\n        rules: {\n${Object.entries(ov.rules).map(([k, v]) => `        '${k}': ${JSON.stringify(v)}`).join(",\n")}\n        }\n      }`;
	}).join(",\n")}\n    ]`;
	const stagedCfg = auditConfig.vitePlusConfig?.staged;
	let stagedRules = "{ '*': 'vp check --fix' }";
	if (stagedCfg) {
		const rulesObj = "rules" in stagedCfg && stagedCfg.rules ? stagedCfg.rules : stagedCfg;
		if (Object.keys(rulesObj).length > 0) stagedRules = JSON.stringify(rulesObj, null, 4).replace(/\n/g, "\n  ");
	}
	const mergedLintIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "lint", projectRoot);
	const lintIgnoreStr = JSON.stringify(mergedLintIgnores, null, 6).replace(/\n/g, "\n    ");
	const mergedFmtIgnores = resolveAuditConfigIgnoreGlobs(auditConfig, "fmt", projectRoot);
	const fmtIgnoreStr = JSON.stringify(mergedFmtIgnores, null, 6).replace(/\n/g, "\n    ");
	let extraRulesStr = "";
	if (auditConfig.vitePlusConfig?.extraLintRules) {
		const entries = Object.entries(auditConfig.vitePlusConfig.extraLintRules).map(([k, v]) => `      '${k}': '${v}'`);
		if (entries.length > 0) extraRulesStr = ",\n" + entries.join(",\n");
	}
	const testRoots = auditConfig.paths?.testRoots ?? ["tests"];
	const testIncludeStr = JSON.stringify(testRoots.map((r) => `${r}/**/*.{test,spec}.ts`), null, 6).replace(/\n/g, "\n    ");
	const srcRoots = auditConfig.paths?.srcRoots ?? ["src"];
	const srcIncludeStr = JSON.stringify(srcRoots.map((r) => `${r}/**/*.ts`), null, 8).replace(/\n/g, "\n      ");
	const cliRoots = auditConfig.paths?.cliRoots ?? ["src/cli"];
	const excludeStr = JSON.stringify([...cliRoots.map((r) => `${r}/**`), ...testRoots.map((r) => `${r}/**`)], null, 8).replace(/\n/g, "\n      ");
	return `import { defineConfig } from 'vite-plus';

export default defineConfig({
${packSection}  lint: {
    options: {
      typeAware: ${typeAware},
      typeCheck: ${typeCheck}
    },${categoriesSection}
    jsPlugins: ['@francogp/auditor/domain-type-plugin'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never'
        }
      ],
      '@francogp/domain-type/no-double-cast-unknown': 'error',
      '@francogp/domain-type/no-legacy-date': 'error'${extraRulesStr}
    },
    ignorePatterns: ${lintIgnoreStr}${overridesSection}
  },
  fmt: {
    singleQuote: ${singleQuote},
    semi: ${semi},
    trailingComma: '${trailingComma}',
    printWidth: ${printWidth},
    sortPackageJson: ${sortPackageJson},
    ignorePatterns: ${fmtIgnoreStr}${tabWidthLine}${useTabsLine}
  },
  test: {
    environment: 'node',
    include: ${testIncludeStr},
    coverage: {
      provider: 'v8',
      reportsDirectory: 'scratch/coverage',
      include: ${srcIncludeStr},
      exclude: ${excludeStr},
      thresholds: {
        lines: ${coverageThreshold},
        functions: ${coverageThreshold},
        branches: ${coverageThreshold},
        statements: ${coverageThreshold}
      }
    }
  },
  staged: ${stagedRules}
});
`;
}
function skipQuote(content, index, quote) {
	let i = index + 1;
	while (i < content.length && content[i] !== quote) {
		if (content[i] === "\\") i++;
		i++;
	}
	return i;
}
function skipLineComment(content, index) {
	const nextNewline = content.indexOf("\n", index);
	return nextNewline === -1 ? content.length : nextNewline;
}
function skipBlockComment(content, index) {
	const nextClose = content.indexOf("*/", index);
	return nextClose === -1 ? content.length : nextClose + 1;
}
function findClosingBraceIndex(content, startBraceIndex) {
	let depth = 0;
	for (let i = startBraceIndex; i < content.length; i++) {
		const ch = content[i];
		const next = content[i + 1];
		if (ch === "/" && next === "/") {
			i = skipLineComment(content, i + 2);
			continue;
		}
		if (ch === "/" && next === "*") {
			i = skipBlockComment(content, i + 2);
			continue;
		}
		if (ch === "'" || ch === "\"" || ch === "`") {
			i = skipQuote(content, i, ch);
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}
function extractObjectPropertyBlock(fileContent, propName) {
	const regex = new RegExp(`(^|\\s)${propName}\\s*:\\s*\\{`, "m");
	const exportMatch = /export\s+default\s+defineConfig/m.exec(fileContent);
	const searchStart = exportMatch ? exportMatch.index : 0;
	const scopedContent = fileContent.slice(searchStart);
	let match = regex.exec(scopedContent);
	let effectiveOffset = searchStart;
	if (!match) {
		match = regex.exec(fileContent);
		effectiveOffset = 0;
	}
	if (!match) return null;
	const prefixLen = match[1]?.length ?? 0;
	const propStartIndex = effectiveOffset + match.index + prefixLen;
	const braceIndex = fileContent.indexOf("{", propStartIndex);
	if (braceIndex === -1) return null;
	const closingIndex = findClosingBraceIndex(fileContent, braceIndex);
	return closingIndex !== -1 ? fileContent.slice(propStartIndex, closingIndex + 1) : null;
}
function injectBeforeClosingBrace(content, startBraceIndex, block) {
	const closingIndex = findClosingBraceIndex(content, startBraceIndex);
	if (closingIndex === -1) return null;
	const before = content.slice(0, closingIndex).trimEnd();
	return `${before}${before.endsWith(",") ? "\n" : ",\n"}  ${block}\n${content.slice(closingIndex)}`;
}
function findTargetObjectStart(content) {
	const exportMatch = /export\s+default\s+defineConfig/m.exec(content);
	const searchStart = exportMatch ? exportMatch.index : 0;
	const configContent = content.slice(searchStart);
	const directMatch = /defineConfig\s*\(\s*\{/m.exec(configContent);
	if (directMatch) return searchStart + configContent.indexOf("{", directMatch.index);
	const arrowMatch = /=>\s*\(\s*\{/m.exec(configContent);
	if (arrowMatch) return searchStart + configContent.indexOf("{", arrowMatch.index);
	const returnMatch = /return\s*\{/m.exec(configContent);
	if (returnMatch) return searchStart + configContent.indexOf("{", returnMatch.index);
	return -1;
}
function injectBlockBeforeConfigEnd(content, block) {
	const startBraceIndex = findTargetObjectStart(content);
	if (startBraceIndex !== -1) {
		const injected = injectBeforeClosingBrace(content, startBraceIndex, block);
		if (injected) return injected;
	}
	const lastClose = Math.max(content.lastIndexOf("});"), content.lastIndexOf("})"));
	if (lastClose !== -1) {
		let before = content.slice(0, lastClose).trimEnd();
		let postBlock = "";
		if (before.endsWith("};")) {
			before = before.slice(0, -2).trimEnd();
			postBlock = "\n};";
		} else if (before.endsWith("}")) {
			before = before.slice(0, -1).trimEnd();
			postBlock = "\n}";
		}
		const separator = before.endsWith(",") ? "\n" : ",\n";
		return `${before}${separator}  ${block}${postBlock}\n${content.slice(lastClose)}`;
	}
	return content;
}
function findLegacyTestBlock(projectRoot) {
	for (const vitestCandidate of [
		"vitest.config.ts",
		"vitest.config.js",
		"vitest.config.mjs"
	]) {
		const candidatePath = path.resolve(projectRoot, vitestCandidate);
		if (fs.existsSync(candidatePath)) try {
			const extracted = extractObjectPropertyBlock(fs.readFileSync(candidatePath, "utf-8"), "test");
			if (extracted) return extracted;
		} catch {}
	}
	try {
		const extracted = extractObjectPropertyBlock(childProcess.execSync("git show HEAD:vitest.config.ts", {
			cwd: projectRoot,
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			encoding: "utf-8"
		}), "test");
		if (extracted) return extracted;
	} catch {}
	return null;
}
function scaffoldInitialViteConfig(viteConfigPath, config, legacyTestBlock, projectRoot) {
	const canonicalContent = buildCanonicalVitePlusConfig(config, projectRoot);
	let finalContent = canonicalContent;
	if (legacyTestBlock) {
		const defaultTestBlock = extractObjectPropertyBlock(canonicalContent, "test");
		if (defaultTestBlock) finalContent = canonicalContent.replace(defaultTestBlock, legacyTestBlock);
	}
	fs.writeFileSync(viteConfigPath, finalContent, "utf-8");
	return {
		modified: true,
		content: finalContent
	};
}
function ensureTestBlock(content, legacyTestBlock, config) {
	if (!/(^|\s)test\s*:\s*\{/m.test(content)) {
		if (legacyTestBlock) return {
			content: injectBlockBeforeConfigEnd(content, legacyTestBlock),
			modified: true
		};
		const testRoots = config.paths?.testRoots ?? ["tests"];
		const testIncludeStr = JSON.stringify(testRoots.map((r) => `${r}/**/*.{test,spec}.ts`), null, 4).replace(/\n/g, "\n    ");
		const coverageThreshold = config.testCoverage?.threshold ?? 80;
		return {
			content: injectBlockBeforeConfigEnd(content, `test: {
    environment: 'node',
    include: ${testIncludeStr},
    coverage: {
      provider: 'v8',
      reportsDirectory: 'scratch/coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'tests/**'],
      thresholds: {
        lines: ${coverageThreshold},
        functions: ${coverageThreshold},
        branches: ${coverageThreshold},
        statements: ${coverageThreshold}
      }
    }
  }`),
			modified: true
		};
	}
	const testBlock = extractObjectPropertyBlock(content, "test");
	if (!testBlock) return {
		content,
		modified: false
	};
	const testRoots = config.paths?.testRoots ?? ["tests"];
	const missingRoots = [];
	for (const root of testRoots) {
		const pattern = `${root}/**/*.{test,spec}.ts`;
		const simple = `${root}/**/*.test.ts`;
		if (!testBlock.includes(`'${pattern}'`) && !testBlock.includes(`"${pattern}"`) && !testBlock.includes(`'${simple}'`) && !testBlock.includes(`"${simple}"`) && !testBlock.includes(`'${root}/**`) && !testBlock.includes(`"${root}/**`)) missingRoots.push(pattern);
	}
	if (missingRoots.length === 0) return {
		content,
		modified: false
	};
	let updatedBlock = testBlock;
	if (testBlock.includes("include: [")) {
		const formatted = missingRoots.map((r) => `      '${r}'`).join(",\n");
		updatedBlock = testBlock.replace(/include:\s*\[/, `include: [\n${formatted},`);
	} else {
		const formatted = missingRoots.map((r) => `'${r}'`).join(", ");
		const braceIndex = testBlock.indexOf("{");
		if (braceIndex !== -1) updatedBlock = testBlock.slice(0, braceIndex + 1) + `\n    include: [${formatted}],` + testBlock.slice(braceIndex + 1);
	}
	if (updatedBlock !== testBlock) return {
		content: content.replace(testBlock, updatedBlock),
		modified: true
	};
	return {
		content,
		modified: false
	};
}
const STRICT_RULE_CHECKS = [
	"@typescript-eslint/no-explicit-any",
	"@typescript-eslint/ban-ts-comment",
	"@typescript-eslint/consistent-type-assertions",
	"@francogp/domain-type/no-double-cast-unknown",
	"@francogp/domain-type/no-legacy-date"
];
function applyStrictRule(content, rule, canonicalOverride) {
	const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const existingRuleRegex = new RegExp(`['"]${escaped}['"]\\s*:\\s*(['"][^'"]+['"]|\\[[^\\]]+\\])`, "m");
	const match = existingRuleRegex.exec(content);
	const canonicalValue = canonicalOverride ?? (rule === "@typescript-eslint/consistent-type-assertions" ? "['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }]" : "'error'");
	if (!match) {
		if (content.includes("rules: {")) return {
			content: content.replace(/rules:\s*\{/, `rules: {\n      '${rule}': ${canonicalValue},`),
			modified: true
		};
		return {
			content,
			modified: false
		};
	}
	if (/['"](?:off|warn|0|1)['"]/.test(match[1] ?? "")) return {
		content: content.replace(existingRuleRegex, `'${rule}': ${canonicalValue}`),
		modified: true
	};
	return {
		content,
		modified: false
	};
}
function ensureLintOptions(content, config) {
	const typeAware = config.vitePlusConfig?.lint?.typeAware ?? true;
	const typeCheck = config.vitePlusConfig?.lint?.typeCheck ?? true;
	const lintBlock = extractObjectPropertyBlock(content, "lint");
	if (lintBlock && !lintBlock.includes("options:")) {
		const braceIndex = lintBlock.indexOf("{");
		if (braceIndex !== -1) {
			const updatedLintBlock = lintBlock.slice(0, braceIndex + 1) + `\n    options: {\n      typeAware: ${typeAware},\n      typeCheck: ${typeCheck}\n    },` + lintBlock.slice(braceIndex + 1);
			return {
				content: content.replace(lintBlock, updatedLintBlock),
				modified: true
			};
		}
	}
	return {
		content,
		modified: false
	};
}
function ensureLintPlugins(content) {
	if (content.includes("@francogp/auditor/domain-type-plugin")) return {
		content,
		modified: false
	};
	if (content.includes("jsPlugins: [")) return {
		content: content.replace(/jsPlugins:\s*\[/, "jsPlugins: ['@francogp/auditor/domain-type-plugin', "),
		modified: true
	};
	if (content.includes("lint: {")) return {
		content: content.replace(/lint:\s*\{/, "lint: {\n    jsPlugins: ['@francogp/auditor/domain-type-plugin'],"),
		modified: true
	};
	return {
		content,
		modified: false
	};
}
function applyConfiguredRule(content, rule, targetValue) {
	const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const existingRuleRegex = new RegExp(`(['"]${escaped}['"]\\s*:\\s*)(['"][^'"]+['"]|\\[[^\\]]+\\])`, "m");
	const match = existingRuleRegex.exec(content);
	if (!match) {
		if (content.includes("rules: {")) return {
			content: content.replace(/rules:\s*\{/, `rules: {\n      '${rule}': ${targetValue},`),
			modified: true
		};
		return {
			content,
			modified: false
		};
	}
	if (match[2]?.trim() !== targetValue.trim()) return {
		content: content.replace(existingRuleRegex, `$1${targetValue}`),
		modified: true
	};
	return {
		content,
		modified: false
	};
}
function serializeLintOverrides(overrides) {
	return `[\n${overrides.map((ov) => {
		return `      {\n        files: ${JSON.stringify(ov.files)},\n        rules: {\n${Object.entries(ov.rules ?? {}).map(([k, v]) => `        '${k}': ${typeof v === "string" ? `'${v}'` : JSON.stringify(v)}`).join(",\n")}\n        }\n      }`;
	}).join(",\n")}\n    ]`;
}
function ensureLintOverrides(content, config) {
	const overrides = config.vitePlusConfig?.lint?.overrides;
	if (!overrides || overrides.length === 0) return {
		content,
		modified: false
	};
	const lintBlock = extractObjectPropertyBlock(content, "lint");
	if (!lintBlock) return {
		content,
		modified: false
	};
	const serialized = serializeLintOverrides(overrides);
	if (lintBlock.includes("overrides: [")) {
		const existingOverridesMatch = /(^|\s)overrides:\s*\[[\s\S]*?\n\s*\]/m.exec(lintBlock);
		if (existingOverridesMatch) {
			const targetOverridesStr = `overrides: ${serialized}`;
			if (existingOverridesMatch[0].trim() !== targetOverridesStr.trim()) {
				const updatedBlock = lintBlock.replace(existingOverridesMatch[0], `\n    ${targetOverridesStr}`);
				return {
					content: content.replace(lintBlock, updatedBlock),
					modified: true
				};
			}
		}
		return {
			content,
			modified: false
		};
	}
	const closingBraceIndex = lintBlock.lastIndexOf("}");
	if (closingBraceIndex === -1) return {
		content,
		modified: false
	};
	const beforeClose = lintBlock.slice(0, closingBraceIndex).trimEnd();
	const updatedBlock = `${beforeClose}${beforeClose.endsWith(",") ? "\n" : ",\n"}    overrides: ${serialized}\n  ${lintBlock.slice(closingBraceIndex)}`;
	return {
		content: content.replace(lintBlock, updatedBlock),
		modified: true
	};
}
function ensureLintRules(content, config) {
	let updated = content;
	let modified = false;
	for (const rule of STRICT_RULE_CHECKS) {
		const res = applyStrictRule(updated, rule);
		if (res.modified) {
			updated = res.content;
			modified = true;
		}
	}
	if (config.vitePlusConfig?.extraLintRules) for (const [ruleName, ruleLevel] of Object.entries(config.vitePlusConfig.extraLintRules)) {
		const res = applyStrictRule(updated, ruleName, `'${ruleLevel}'`);
		if (res.modified) {
			updated = res.content;
			modified = true;
		}
	}
	if (config.vitePlusConfig?.lint?.rules) for (const [ruleName, ruleLevel] of Object.entries(config.vitePlusConfig.lint.rules)) {
		const valStr = typeof ruleLevel === "string" ? `'${ruleLevel}'` : JSON.stringify(ruleLevel);
		const res = applyConfiguredRule(updated, ruleName, valStr);
		if (res.modified) {
			updated = res.content;
			modified = true;
		}
	}
	return {
		content: updated,
		modified
	};
}
function ensureLintBlock(content, auditConfig, projectRoot) {
	const config = auditConfig ?? getAuditConfig(projectRoot);
	if (!/(^|\s)lint\s*:\s*\{/m.test(content)) {
		const extractedLint = extractObjectPropertyBlock(buildCanonicalVitePlusConfig(config, projectRoot), "lint");
		if (extractedLint) return {
			content: injectBlockBeforeConfigEnd(content, extractedLint),
			modified: true
		};
	}
	let updated = content;
	let modified = false;
	const optStep = ensureLintOptions(updated, config);
	if (optStep.modified) {
		updated = optStep.content;
		modified = true;
	}
	const pluginStep = ensureLintPlugins(updated);
	if (pluginStep.modified) {
		updated = pluginStep.content;
		modified = true;
	}
	const rulesStep = ensureLintRules(updated, config);
	if (rulesStep.modified) {
		updated = rulesStep.content;
		modified = true;
	}
	const ignoreStep = ensureIgnorePatterns(updated, "lint", config, projectRoot);
	if (ignoreStep.modified) {
		updated = ignoreStep.content;
		modified = true;
	}
	const overridesStep = ensureLintOverrides(updated, config);
	if (overridesStep.modified) {
		updated = overridesStep.content;
		modified = true;
	}
	return {
		content: updated,
		modified
	};
}
function ensureIgnorePatterns(content, blockName, config, projectRoot) {
	const globsToEnsure = resolveAuditConfigIgnoreGlobs(config, blockName, projectRoot);
	const block = extractObjectPropertyBlock(content, blockName);
	if (!block) return {
		content,
		modified: false
	};
	const missingGlobs = globsToEnsure.filter((g) => !block.includes(`'${g}'`) && !block.includes(`"${g}"`));
	if (missingGlobs.length === 0) return {
		content,
		modified: false
	};
	let updatedBlock = block;
	if (block.includes("ignorePatterns: [")) {
		const formatted = missingGlobs.map((g) => `      '${g}'`).join(",\n");
		updatedBlock = block.replace(/ignorePatterns:\s*\[/, `ignorePatterns: [\n${formatted},`);
	} else {
		const formatted = missingGlobs.map((g) => `      '${g}'`).join(",\n");
		const braceIndex = block.indexOf("{");
		if (braceIndex !== -1) updatedBlock = block.slice(0, braceIndex + 1) + `\n    ignorePatterns: [\n${formatted}\n    ],` + block.slice(braceIndex + 1);
	}
	if (updatedBlock !== block) return {
		content: content.replace(block, updatedBlock),
		modified: true
	};
	return {
		content,
		modified: false
	};
}
function ensureFmtAndStagedBlocks(content, auditConfig, projectRoot) {
	const config = auditConfig ?? getAuditConfig(projectRoot);
	let updated = content;
	let modified = false;
	if (!/(^|\s)fmt\s*:\s*\{/m.test(updated)) {
		const extractedFmt = extractObjectPropertyBlock(buildCanonicalVitePlusConfig(config, projectRoot), "fmt");
		if (extractedFmt) {
			updated = injectBlockBeforeConfigEnd(updated, extractedFmt);
			modified = true;
		}
	}
	const fmtIgnoreStep = ensureIgnorePatterns(updated, "fmt", config, projectRoot);
	if (fmtIgnoreStep.modified) {
		updated = fmtIgnoreStep.content;
		modified = true;
	}
	if (!updated.includes("staged:")) {
		const extractedStaged = extractObjectPropertyBlock(buildCanonicalVitePlusConfig(config, projectRoot), "staged");
		if (extractedStaged) {
			updated = injectBlockBeforeConfigEnd(updated, extractedStaged);
			modified = true;
		}
	}
	return {
		content: updated,
		modified
	};
}
function syncViteConfigWithAuditConfig(projectRoot, auditConfig) {
	const config = auditConfig ?? getAuditConfig(projectRoot);
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	const legacyTestBlock = findLegacyTestBlock(projectRoot);
	if (!fs.existsSync(viteConfigPath)) return scaffoldInitialViteConfig(viteConfigPath, config, legacyTestBlock, projectRoot);
	let content = fs.readFileSync(viteConfigPath, "utf-8");
	let modified = false;
	if (!content.includes("from 'vite-plus'")) {
		content = content.replace(/from\s+['"]vite['"]/g, "from 'vite-plus'");
		modified = true;
	}
	const testStep = ensureTestBlock(content, legacyTestBlock, config);
	content = testStep.content;
	if (testStep.modified) modified = true;
	const lintStep = ensureLintBlock(content, config, projectRoot);
	content = lintStep.content;
	if (lintStep.modified) modified = true;
	const fmtStagedStep = ensureFmtAndStagedBlocks(content, config, projectRoot);
	content = fmtStagedStep.content;
	if (fmtStagedStep.modified) modified = true;
	if (modified) fs.writeFileSync(viteConfigPath, content, "utf-8");
	return {
		modified,
		content
	};
}
function cleanLegacyConfigFiles(projectRoot) {
	const viteConfigPath = path.resolve(projectRoot, "vite.config.ts");
	if (!fs.existsSync(viteConfigPath)) return [];
	let viteContent = "";
	try {
		viteContent = fs.readFileSync(viteConfigPath, "utf-8");
	} catch {
		return [];
	}
	const hasTest = /(^|\s)test\s*:\s*\{/m.test(viteContent);
	const hasLint = /(^|\s)lint\s*:\s*\{/m.test(viteContent);
	const hasPack = /(^|\s)pack\s*:\s*\{/m.test(viteContent);
	const removed = [];
	for (const legacy of LEGACY_CONFIG_FILES) {
		if (legacy.startsWith("vitest") && !hasTest) continue;
		if ((legacy.startsWith("eslint") || legacy.startsWith(".eslintrc")) && !hasLint) continue;
		if (legacy.startsWith("tsdown") && !hasPack) continue;
		const fullPath = path.resolve(projectRoot, legacy);
		if (fs.existsSync(fullPath)) try {
			fs.rmSync(fullPath, { force: true });
			removed.push(legacy);
		} catch {}
	}
	return removed;
}
function rewriteImportsToVitePlus(projectRoot, dirs = [
	"src",
	"scripts",
	"tests"
]) {
	let rewrittenCount = 0;
	function walk(dir) {
		if (!fs.existsSync(dir)) return;
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "dev-dist") walk(fullPath);
			} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".vue") || entry.name.endsWith(".js"))) try {
				const raw = fs.readFileSync(fullPath, "utf-8");
				let updated = raw;
				if (updated.includes("from 'vitest'")) updated = updated.replace(/from\s+['"]vitest['"]/g, "from 'vite-plus/test'");
				if (updated.includes("import('vitest')")) updated = updated.replace(/import\(['"]vitest['"]\)/g, "import('vite-plus/test')");
				if (updated.includes("from 'vite'")) updated = updated.replace(/from\s+['"]vite['"]/g, "from 'vite-plus'");
				if (updated !== raw) {
					fs.writeFileSync(fullPath, updated, "utf-8");
					rewrittenCount++;
				}
			} catch {}
		}
	}
	for (const dirName of dirs) walk(path.resolve(projectRoot, dirName));
	return rewrittenCount;
}
function migrateNodeVersion(projectRoot) {
	const legacyNvmrc = path.resolve(projectRoot, ".nvmrc");
	const nodeVersionPath = path.resolve(projectRoot, ".node-version");
	let migrated = false;
	if (fs.existsSync(legacyNvmrc)) {
		const nvmrcContent = fs.readFileSync(legacyNvmrc, "utf-8").trim();
		if (nvmrcContent) {
			fs.writeFileSync(nodeVersionPath, `${nvmrcContent}\n`, "utf-8");
			migrated = true;
		}
		try {
			fs.rmSync(legacyNvmrc, { force: true });
		} catch {}
	} else if (!fs.existsSync(nodeVersionPath)) {
		const pkgPath = path.resolve(projectRoot, "package.json");
		if (fs.existsSync(pkgPath)) try {
			const nodeEngine = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).engines?.node;
			if (typeof nodeEngine === "string") {
				const m = nodeEngine.match(/\d+\.\d+\.\d+/);
				if (m) {
					fs.writeFileSync(nodeVersionPath, `${m[0]}\n`, "utf-8");
					migrated = true;
				}
			}
		} catch {}
	}
	return migrated;
}
function getVitePlusDefaultExcludeGlobs(projectRoot) {
	return resolveAuditConfigIgnoreGlobs(getAuditConfig(projectRoot), "lint", projectRoot);
}
const LEGACY_DEPS_TO_REMOVE = [
	"eslint",
	"@eslint/js",
	"typescript-eslint",
	"@typescript-eslint/eslint-plugin",
	"@typescript-eslint/parser",
	"eslint-formatter-codeframe",
	"eslint-plugin-unused-imports",
	"eslint-plugin-vue",
	"eslint-plugin-regexp",
	"globals",
	"vue-eslint-parser",
	"vitest"
];
function removeLegacyDependencies(pkg) {
	let modified = false;
	for (const dep of LEGACY_DEPS_TO_REMOVE) {
		if (pkg.devDependencies && dep in pkg.devDependencies) {
			delete pkg.devDependencies[dep];
			modified = true;
		}
		if (pkg.dependencies && dep in pkg.dependencies) {
			delete pkg.dependencies[dep];
			modified = true;
		}
	}
	return modified;
}
const REQUIRED_VITE_PLUS_SCRIPTS = {
	check: "vp check",
	"check:fix": "vp check --fix",
	fmt: "vp fmt",
	"fmt:check": "vp fmt --check"
};
function updateVitePlusScripts(scripts) {
	let modified = false;
	for (const [sName, sCmd] of Object.entries(scripts)) if (typeof sCmd === "string" && /\beslint\b/.test(sCmd)) {
		if (sName === "lint") {
			scripts[sName] = "vp check";
			modified = true;
		} else if (sName === "lint:fix") {
			scripts[sName] = "vp check --fix";
			modified = true;
		}
	}
	for (const [key, cmd] of Object.entries(REQUIRED_VITE_PLUS_SCRIPTS)) if (!scripts[key]) {
		scripts[key] = cmd;
		modified = true;
	}
	return modified;
}
function syncPackageJsonForVitePlus(projectRoot) {
	const pkgPath = path.resolve(projectRoot, "package.json");
	if (!fs.existsSync(pkgPath)) return false;
	let pkg;
	try {
		pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	} catch {
		return false;
	}
	let modified = false;
	pkg.devDependencies = pkg.devDependencies ?? {};
	if (!pkg.dependencies?.["vite-plus"] && !pkg.devDependencies["vite-plus"]) {
		pkg.devDependencies["vite-plus"] = "^1.2.0";
		modified = true;
	}
	if (removeLegacyDependencies(pkg)) modified = true;
	pkg.scripts = pkg.scripts ?? {};
	if (updateVitePlusScripts(pkg.scripts)) modified = true;
	if (modified) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
	return modified;
}
function syncVSCodeSettings(projectRoot, auditConfig) {
	const vscConfig = (auditConfig ?? getAuditConfig(projectRoot)).vitePlusConfig?.vscode;
	if (vscConfig?.enabled === false) return false;
	const vscodeDir = path.resolve(projectRoot, ".vscode");
	fs.mkdirSync(vscodeDir, { recursive: true });
	let modified = false;
	const extPath = path.resolve(vscodeDir, "extensions.json");
	let extJson = {};
	if (fs.existsSync(extPath)) try {
		extJson = JSON.parse(fs.readFileSync(extPath, "utf-8"));
	} catch {
		extJson = {};
	}
	const recommendations = [...extJson.recommendations ?? []];
	const unwantedRecommendations = [...extJson.unwantedRecommendations ?? []];
	if (!recommendations.includes("oxc.oxc-vscode")) {
		recommendations.push("oxc.oxc-vscode");
		modified = true;
	}
	const unwanted = vscConfig?.unwantedRecommendations ?? ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"];
	for (const unw of unwanted) if (!unwantedRecommendations.includes(unw)) {
		unwantedRecommendations.push(unw);
		modified = true;
	}
	if (modified || !fs.existsSync(extPath)) {
		extJson.recommendations = recommendations;
		extJson.unwantedRecommendations = unwantedRecommendations;
		fs.writeFileSync(extPath, JSON.stringify(extJson, null, 2) + "\n", "utf-8");
	}
	const settingsPath = path.resolve(vscodeDir, "settings.json");
	let settingsJson = {};
	if (fs.existsSync(settingsPath)) try {
		settingsJson = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
	} catch {
		settingsJson = {};
	}
	const defFormatter = vscConfig?.defaultFormatter ?? "oxc.oxc-vscode";
	if (settingsJson["editor.defaultFormatter"] !== defFormatter) {
		settingsJson["editor.defaultFormatter"] = defFormatter;
		modified = true;
	}
	if (vscConfig?.formatOnSave !== false && settingsJson["editor.formatOnSave"] !== true) {
		settingsJson["editor.formatOnSave"] = true;
		modified = true;
	}
	if (modified || !fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, JSON.stringify(settingsJson, null, 2) + "\n", "utf-8");
	return modified;
}
function repairVitePlusProject(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const viteConfigSync = syncViteConfigWithAuditConfig(projectRoot, config);
	const rewrittenFiles = rewriteImportsToVitePlus(projectRoot);
	const nodeVersionMigrated = migrateNodeVersion(projectRoot);
	const packageJsonUpdated = syncPackageJsonForVitePlus(projectRoot);
	const vscodeSync = syncVSCodeSettings(projectRoot, config);
	return {
		removedConfigs: cleanLegacyConfigFiles(projectRoot),
		rewrittenFiles,
		viteConfigSync,
		nodeVersionMigrated,
		packageJsonUpdated,
		vscodeSync
	};
}
//#endregion
export { LEGACY_CONFIG_FILES, STRICT_RULE_CHECKS, buildCanonicalVitePlusConfig, cleanLegacyConfigFiles, extractObjectPropertyBlock, findLegacyEslintIgnores, getVitePlusDefaultExcludeGlobs, migrateNodeVersion, repairVitePlusProject, resolveAuditConfigIgnoreGlobs, rewriteImportsToVitePlus, syncPackageJsonForVitePlus, syncVSCodeSettings, syncViteConfigWithAuditConfig };
