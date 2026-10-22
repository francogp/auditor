import { tryOrNull } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
//#region src/core/versionAnalyzer.ts
/**
* src/core/versionAnalyzer.ts
*
* Intelligent heuristic engine for determining SemVer bumps (major, minor, patch)
* based on Git diff metrics, affected subsystems, and commit intent.
*/
const MAJOR_DIFF_LINES_THRESHOLD = 1e3;
const MAJOR_CORE_LINES_THRESHOLD = 500;
const MINOR_DIFF_LINES_THRESHOLD = 100;
const VERSION_BUMP_TYPES = [
	"major",
	"minor",
	"patch",
	"build"
];
const GIT_STATUS_FLAGS = [
	"A",
	"M",
	"D",
	"R",
	"?"
];
/**
* Extracts base SemVer major.minor.patch tuple from a version string.
*/
function parseBaseSemver(versionStr) {
	const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!match) return [
		1,
		0,
		0
	];
	return [
		parseInt(match[1], 10),
		parseInt(match[2], 10),
		parseInt(match[3], 10)
	];
}
/**
* Calculates the next SemVer base version given a bump type.
*/
function calculateNextBaseVersion(currentBase, bump) {
	const [major, minor, patch] = parseBaseSemver(currentBase);
	switch (bump) {
		case "major": return `${major + 1}.0.0`;
		case "minor": return `${major}.${minor + 1}.0`;
		case "patch": return `${major}.${minor}.${patch + 1}`;
		case "build": return `${major}.${minor}.${patch}`;
	}
}
/**
* Generates an elegant build timestamp ID (YYYYMMDD-HHmmss).
*/
function generateBuildId(customNow) {
	const now = customNow ?? Temporal.Now.zonedDateTimeISO();
	return {
		buildId: `${String(now.year)}${String(now.month).padStart(2, "0")}${String(now.day).padStart(2, "0")}-${String(now.hour).padStart(2, "0")}${String(now.minute).padStart(2, "0")}${String(now.second).padStart(2, "0")}`,
		buildDate: now.toString()
	};
}
function parseNumstatOutput(diffOutput, map) {
	const lines = diffOutput.trim().split("\n").filter((l) => l.trim().length > 0);
	for (const line of lines) {
		const parts = line.split("	");
		if (parts.length >= 3) {
			const ins = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
			const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
			const filePath = parts[2].trim();
			map.set(filePath, {
				path: filePath,
				status: "M",
				insertions: ins,
				deletions: del
			});
		}
	}
}
function countFileLines(filePath) {
	if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) try {
		return fs.readFileSync(filePath, "utf-8").split("\n").length;
	} catch {
		return 1;
	}
	return 0;
}
function parsePorcelainOutput(statusOutput, cwd, map) {
	const lines = statusOutput.trim().split("\n").filter((l) => l.trim().length > 0);
	for (const line of lines) {
		const statusCode = line.slice(0, 2).trim();
		const filePath = line.slice(3).trim();
		if (statusCode === "??" || statusCode === "A") {
			const ins = countFileLines(path.join(cwd, filePath));
			map.set(filePath, {
				path: filePath,
				status: "A",
				insertions: ins,
				deletions: 0
			});
		} else if (statusCode === "D") {
			const existing = map.get(filePath);
			if (existing) existing.status = "D";
			else map.set(filePath, {
				path: filePath,
				status: "D",
				insertions: 0,
				deletions: 1
			});
		}
	}
}
function aggregateSubsystemMetrics(changedFiles) {
	let insertions = 0;
	let deletions = 0;
	let hasCoreChanges = false;
	let hasNewFeatures = false;
	for (const file of changedFiles) {
		insertions += file.insertions;
		deletions += file.deletions;
		if (file.path.startsWith("src/core/") || file.path === "src/index.ts") hasCoreChanges = true;
		if (file.status === "A" && (file.path.startsWith("src/suites/") || file.path.startsWith("src/cli/") || file.path.startsWith(".agents/skills/") || file.path.startsWith("skills/"))) hasNewFeatures = true;
	}
	return {
		insertions,
		deletions,
		hasCoreChanges,
		hasNewFeatures
	};
}
/**
* Collects Git diff metrics from the current working tree and uncommitted changes.
*/
function collectGitDiffMetrics(cwd = process.cwd(), baseRef = "HEAD") {
	const changedFilesMap = /* @__PURE__ */ new Map();
	tryOrNull(() => {
		parseNumstatOutput(execSync(`git diff ${baseRef} --numstat`, {
			cwd,
			encoding: "utf-8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			]
		}), changedFilesMap);
	});
	tryOrNull(() => {
		parsePorcelainOutput(execSync("git status --porcelain", {
			cwd,
			encoding: "utf-8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			]
		}), cwd, changedFilesMap);
	});
	const changedFiles = Array.from(changedFilesMap.values());
	const agg = aggregateSubsystemMetrics(changedFiles);
	return {
		filesChanged: changedFiles.length,
		insertions: agg.insertions,
		deletions: agg.deletions,
		totalLinesChanged: agg.insertions + agg.deletions,
		hasCoreChanges: agg.hasCoreChanges,
		hasNewFeatures: agg.hasNewFeatures,
		hasBreakingChanges: false,
		changedFiles
	};
}
function readCurrentPackageVersion(cwd) {
	const pkgPath = path.join(cwd, "package.json");
	if (!fs.existsSync(pkgPath)) return "1.0.0";
	try {
		return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version ?? "1.0.0";
	} catch {
		return "1.0.0";
	}
}
function applyCommitMessageIntent(metrics, commitMessage) {
	if (!commitMessage) return;
	const msg = commitMessage.trim();
	if (msg.includes("BREAKING CHANGE:") || msg.includes("breaking:") || /^[a-z]+(?:\([a-z0-9_-]+\))?!:/.test(msg)) metrics.hasBreakingChanges = true;
	else if (/^feat(?:\([a-z0-9_-]+\))?:/.test(msg)) metrics.hasNewFeatures = true;
}
function evaluateBumpRationale(metrics) {
	if (metrics.hasBreakingChanges) return {
		recommendedBump: "major",
		rationale: "Cambio de ruptura (breaking change) declarado explícitamente en el commit."
	};
	if (metrics.hasCoreChanges && metrics.totalLinesChanged >= 500) return {
		recommendedBump: "major",
		rationale: `Refactorización profunda en el núcleo (src/core) con ${metrics.totalLinesChanged} líneas modificadas.`
	};
	if (metrics.totalLinesChanged >= 1e3) return {
		recommendedBump: "major",
		rationale: `Transformación arquitectónica de gran escala (${metrics.totalLinesChanged} líneas en ${metrics.filesChanged} archivos).`
	};
	if (metrics.hasNewFeatures) return {
		recommendedBump: "minor",
		rationale: "Nueva funcionalidad, suite o skill incorporada al repositorio."
	};
	if (metrics.totalLinesChanged >= 100 || metrics.changedFiles.some((f) => f.status === "A")) return {
		recommendedBump: "minor",
		rationale: `Ampliación de capacidades con ${metrics.totalLinesChanged} líneas modificadas y nuevos archivos.`
	};
	return {
		recommendedBump: "patch",
		rationale: `Ajustes menores, correcciones o mantenimiento (${metrics.totalLinesChanged} líneas en ${metrics.filesChanged} archivos).`
	};
}
/**
* Analyzes diff metrics and commit intent to suggest the optimal SemVer bump.
*/
function analyzeVersionBump(options = {}) {
	const cwd = options.cwd ?? process.cwd();
	const currentVersion = readCurrentPackageVersion(cwd);
	const [major, minor, patch] = parseBaseSemver(currentVersion);
	const baseVersion = `${major}.${minor}.${patch}`;
	const metrics = collectGitDiffMetrics(cwd, options.baseRef ?? "HEAD");
	applyCommitMessageIntent(metrics, options.commitMessage);
	const { recommendedBump, rationale } = evaluateBumpRationale(metrics);
	const { buildId, buildDate } = generateBuildId(options.customNow);
	return {
		currentVersion,
		baseVersion,
		recommendedBump,
		recommendedVersion: `${calculateNextBaseVersion(baseVersion, recommendedBump)}-build.${buildId}`,
		candidates: {
			major: `${calculateNextBaseVersion(baseVersion, "major")}-build.${buildId}`,
			minor: `${calculateNextBaseVersion(baseVersion, "minor")}-build.${buildId}`,
			patch: `${calculateNextBaseVersion(baseVersion, "patch")}-build.${buildId}`,
			build: `${baseVersion}-build.${buildId}`
		},
		buildId,
		buildDate,
		rationale,
		metrics
	};
}
//#endregion
export { GIT_STATUS_FLAGS, MAJOR_CORE_LINES_THRESHOLD, MAJOR_DIFF_LINES_THRESHOLD, MINOR_DIFF_LINES_THRESHOLD, VERSION_BUMP_TYPES, analyzeVersionBump, calculateNextBaseVersion, collectGitDiffMetrics, generateBuildId, parseBaseSemver };
