import { executePlanFileReplacements, forEachSourceScriptLine, isSameFilePath } from "./refactorFileScanner.js";
import fs from "node:fs";
//#region src/core/refactor/motionRefactorEngine.ts
/**
* src/core/refactor/motionRefactorEngine.ts
*
* GSAP & UI ANIMATION GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
* Provides deterministic discovery, Dirac micro-context extraction,
* and automated plan-based remediation for UI timers and GSAP tween rules.
*/
const BANNED_TIMERS_REGEX = /\b(setTimeout|setInterval)\s*\(\s*([^,]+),\s*(\d+|\w+)\s*\)/g;
const CLEAR_TIMERS_REGEX = /\b(clearTimeout|clearInterval)\s*\(\s*([^)]+)\s*\)/g;
const LAYOUT_PROPERTIES = [
	{
		from: "left",
		to: "x"
	},
	{
		from: "top",
		to: "y"
	},
	{
		from: "right",
		to: "x"
	},
	{
		from: "bottom",
		to: "y"
	}
];
const LEGACY_EASE_MAP = {
	["Power0.easeNone"]: "'none'",
	["Power1.easeIn"]: "'power1.in'",
	["Power1.easeOut"]: "'power1.out'",
	["Power1.easeInOut"]: "'power1.inOut'",
	["Power2.easeIn"]: "'power2.in'",
	["Power2.easeOut"]: "'power2.out'",
	["Power2.easeInOut"]: "'power2.inOut'",
	["Power3.easeIn"]: "'power3.in'",
	["Power3.easeOut"]: "'power3.out'",
	["Power3.easeInOut"]: "'power3.inOut'",
	["Power4.easeIn"]: "'power4.in'",
	["Power4.easeOut"]: "'power4.out'",
	["Power4.easeInOut"]: "'power4.inOut'",
	["Back.easeIn"]: "'back.in'",
	["Back.easeOut"]: "'back.out'",
	["Back.easeInOut"]: "'back.inOut'",
	["Elastic.easeIn"]: "'elastic.in'",
	["Elastic.easeOut"]: "'elastic.out'",
	["Elastic.easeInOut"]: "'elastic.inOut'",
	["Bounce.easeIn"]: "'bounce.in'",
	["Bounce.easeOut"]: "'bounce.out'",
	["Bounce.easeInOut"]: "'bounce.inOut'",
	["Sine.easeIn"]: "'sine.in'",
	["Sine.easeOut"]: "'sine.out'",
	["Sine.easeInOut"]: "'sine.inOut'"
};
const MAX_MULTILINE_LOOKAHEAD_LINES = 15;
const DEFAULT_FALLBACK_DELAY_SEC = .5;
var MotionRefactorEngine = class {
	/**
	* Scans a file or directory to discover GSAP & UI timing violations.
	*/
	static discoverInFile(filePath) {
		const findings = [];
		forEachSourceScriptLine(filePath, (line, actualLine, i, lines) => {
			if (line.includes("// timer-ok:") || line.includes("// layout-ok:")) return;
			let timerMatch;
			BANNED_TIMERS_REGEX.lastIndex = 0;
			if ((timerMatch = BANNED_TIMERS_REGEX.exec(line)) !== null) {
				const fullMatch = timerMatch[0];
				const fnName = timerMatch[1];
				const callback = timerMatch[2];
				const delay = timerMatch[3];
				if (fullMatch && fnName && callback && delay) {
					const delayNum = Number(delay);
					const delaySec = !isNaN(delayNum) ? (delayNum / 1e3).toString() : `(${delay} / 1000)`;
					const suggested = fnName === "setTimeout" ? `gsap.delayedCall(${delaySec}, ${callback.trim()})` : `/* migrate to gsap ticker or timeline */`;
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "banned-ui-timer",
						originalSnippet: fullMatch,
						suggestedReplacement: suggested,
						explanation: `Avoid raw ${fnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
					});
				}
			} else if (/\b(setTimeout|setInterval)\b/.test(line)) {
				const fnName = line.includes("setInterval") ? "setInterval" : "setTimeout";
				let multilineDelaySec = null;
				for (let j = i + 1; j < Math.min(lines.length, i + MAX_MULTILINE_LOOKAHEAD_LINES); j++) {
					const subsequentLine = lines[j] ?? "";
					const delayMatch = /(?:}\s*,\s*|\bdelay\s*:\s*)(\d+(?:\.\d+)?)\s*\)?/.exec(subsequentLine);
					if (delayMatch && delayMatch[1]) {
						const delayNum = Number(delayMatch[1]);
						multilineDelaySec = !isNaN(delayNum) ? (delayNum / 1e3).toString() : `(${delayMatch[1]} / 1000)`;
						break;
					}
					if (subsequentLine.includes("});") || subsequentLine.includes("})")) break;
				}
				const suggested = fnName === "setTimeout" ? multilineDelaySec ? `gsap.delayedCall(${multilineDelaySec}, () => { ... })` : `gsap.delayedCall(${DEFAULT_FALLBACK_DELAY_SEC}, callback)` : `/* migrate to gsap ticker or timeline */`;
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "banned-ui-timer",
					ruleId: "gsap-banned-ui-timers",
					originalSnippet: fnName,
					suggestedReplacement: suggested,
					explanation: `Avoid raw ${fnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
				});
			}
			CLEAR_TIMERS_REGEX.lastIndex = 0;
			while ((timerMatch = CLEAR_TIMERS_REGEX.exec(line)) !== null) {
				const fullMatch = timerMatch[0];
				const timerId = timerMatch[2];
				if (!fullMatch || !timerId) continue;
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "banned-ui-timer",
					originalSnippet: fullMatch,
					suggestedReplacement: `${timerId.trim()}?.kill()`,
					explanation: `Killing GSAP tweens/delayedCalls directly prevents dangling unmounted timer callbacks.`
				});
			}
			for (const [legacyEase, canonicalEase] of Object.entries(LEGACY_EASE_MAP)) if (line.includes(legacyEase)) findings.push({
				file: filePath,
				line: actualLine,
				kind: "legacy-ease",
				ruleId: "gsap-legacy-ease-names",
				originalSnippet: legacyEase,
				suggestedReplacement: canonicalEase,
				explanation: `Modern GSAP v3 uses string eases (${canonicalEase}) rather than legacy object instances.`
			});
			for (const layoutProp of LAYOUT_PROPERTIES) if (new RegExp(`\\b${layoutProp.from}\\s*:`, "g").test(line)) findings.push({
				file: filePath,
				line: actualLine,
				kind: "layout-property",
				ruleId: "gsap-no-layout-properties",
				originalSnippet: `${layoutProp.from}:`,
				suggestedReplacement: `${layoutProp.to}:`,
				explanation: `Layout properties (${layoutProp.from}) trigger browser reflows; use GPU transform (${layoutProp.to}) or add '// layout-ok: <reason>'.`
			});
		});
		return findings;
	}
	/**
	* Generates a declarative MotionRefactorPlan from findings.
	*/
	static createPlan(planId, findings) {
		const files = [...new Set(findings.map((f) => f.file))];
		const timerReplacements = [];
		const propertyReplacements = [];
		const easeReplacements = [];
		const importInjections = [];
		for (const f of findings) if (f.kind === "banned-ui-timer") timerReplacements.push({
			file: f.file,
			line: f.line,
			originalCall: f.originalSnippet,
			replacementCall: f.suggestedReplacement
		});
		else if (f.kind === "layout-property") {
			const from = f.originalSnippet.replace(":", "").trim();
			const to = f.suggestedReplacement.replace(":", "").trim();
			propertyReplacements.push({
				file: f.file,
				line: f.line,
				fromProp: from,
				toProp: to
			});
		} else if (f.kind === "legacy-ease") easeReplacements.push({
			file: f.file,
			line: f.line,
			fromEase: f.originalSnippet,
			toEase: f.suggestedReplacement
		});
		for (const file of files) if (findings.some((f) => f.file === file && f.suggestedReplacement.includes("gsap."))) {
			const content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
			if (!content.includes("from 'gsap'") && !content.includes("from \"gsap\"")) importInjections.push({
				file,
				importStatement: "import gsap from 'gsap';"
			});
		}
		return {
			version: 1,
			planId,
			targetFiles: files,
			timerReplacements,
			propertyReplacements,
			easeReplacements,
			importInjections
		};
	}
	static applyPropertyReplacements(initialContent, relFile, fullPath, baseDir, reps) {
		if (!reps) return {
			content: initialContent,
			count: 0
		};
		let content = initialContent;
		let count = 0;
		for (const rep of reps) {
			if (!isSameFilePath(rep.file, relFile, baseDir) && !isSameFilePath(rep.file, fullPath, baseDir)) continue;
			const regex = new RegExp(`\\b${rep.fromProp}\\s*:`, "g");
			if (!regex.test(content)) continue;
			content = content.replace(regex, `${rep.toProp}:`);
			count++;
		}
		return {
			content,
			count
		};
	}
	static applyImportInjections(initialContent, relFile, fullPath, baseDir, injections) {
		if (!injections) return {
			content: initialContent,
			count: 0
		};
		let content = initialContent;
		let count = 0;
		for (const inj of injections) {
			if (!isSameFilePath(inj.file, relFile, baseDir) && !isSameFilePath(inj.file, fullPath, baseDir)) continue;
			if (content.includes(inj.importStatement)) continue;
			if (fullPath.endsWith(".vue")) content = content.replace(/(<script[^>]*>)/i, `$1\n${inj.importStatement}`);
			else content = `${inj.importStatement}\n${content}`;
			count++;
		}
		return {
			content,
			count
		};
	}
	/**
	* Applies a MotionRefactorPlan deterministically onto target files.
	*/
	static applyPlan(baseDir, plan) {
		const easeTextItems = plan.easeReplacements?.map((r) => ({
			file: r.file,
			original: r.fromEase,
			replacement: r.toEase
		}));
		const timerTextItems = plan.timerReplacements?.map((r) => ({
			file: r.file,
			original: r.originalCall,
			replacement: r.replacementCall
		}));
		return executePlanFileReplacements(baseDir, plan.targetFiles, [easeTextItems, timerTextItems], [(content, relFile, fullPath, bDir) => this.applyPropertyReplacements(content, relFile, fullPath, bDir, plan.propertyReplacements), (content, relFile, fullPath, bDir) => this.applyImportInjections(content, relFile, fullPath, bDir, plan.importInjections)]);
	}
};
//#endregion
export { MotionRefactorEngine };
