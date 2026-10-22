import { safeJsonParse, safeReadFileSync, safeStatSync, tryOrNull } from "./safeUtils.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
//#region src/core/transcriptAuthorizationVerifier.ts
/**
* src/core/transcriptAuthorizationVerifier.ts
*
* Verifies that a configuration relaxation code (e.g. RELAX-1a2b3c4d) was explicitly
* authorized by a human user through Antigravity's native conversation transcript.
*
* Security Properties:
* 1. Only steps with source: 'USER_EXPLICIT' and type: 'USER_INPUT' can authorize.
* 2. Scans for tampering: any tool call by source: 'MODEL' (edit_file, write_file,
*    run_command) referencing .system_generated or transcript.jsonl immediately marks
*    tamperingDetected = true and blocks authorization.
* 3. Works seamlessly on mobile (phone) and desktop Antigravity chat without external apps.
*/
/**
* Discovers candidate transcript.jsonl files under Antigravity's brain storage.
* Returns paths sorted by last modified time (newest first).
*/
function discoverTranscriptFiles(customBrainDir) {
	const brainDir = customBrainDir ?? process.env.ANTIGRAVITY_BRAIN_DIR ?? process.env.GEMINI_BRAIN_DIR ?? path.join(os.homedir(), ".gemini", "antigravity", "brain");
	if (!fs.existsSync(brainDir)) return [];
	const candidates = [];
	const entries = tryOrNull(() => fs.readdirSync(brainDir, { withFileTypes: true })) ?? [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const transcriptPath = path.join(brainDir, entry.name, ".system_generated", "logs", "transcript.jsonl");
		const stat = safeStatSync(transcriptPath);
		if (stat) candidates.push({
			path: transcriptPath,
			mtime: stat.mtimeMs
		});
	}
	return candidates.sort((a, b) => b.mtime - a.mtime).map((c) => c.path);
}
/**
* Checks if a model tool call attempted to write or edit transcript files or system logs.
*/
function isTamperingToolCall(toolCall) {
	const args = toolCall.args;
	if (!args) return false;
	const rawPath = args.Path ?? args.path;
	const targetPath = typeof rawPath === "string" ? rawPath : "";
	const rawCommand = args.CommandLine ?? args.commandLine;
	const serialized = `${targetPath} ${typeof rawCommand === "string" ? rawCommand : ""}`.toLowerCase();
	if (serialized.includes("transcript.jsonl") || serialized.includes("transcript_full.jsonl") || serialized.includes(".system_generated")) return true;
	return false;
}
function detectToolTampering(toolCalls) {
	for (const tc of toolCalls) if (isTamperingToolCall(tc)) return true;
	return false;
}
function resolveCandidateTranscriptPaths(options) {
	if (options.transcriptPath) return [options.transcriptPath];
	if (process.env.ANTIGRAVITY_TRANSCRIPT_PATH) return [process.env.ANTIGRAVITY_TRANSCRIPT_PATH];
	return discoverTranscriptFiles(options.brainDir);
}
function scanTranscriptLines(lines, cleanCode) {
	let codeFoundInUserExplicit = false;
	let userPromptText = "";
	let tamperingDetected = false;
	for (const line of lines) {
		const step = safeJsonParse(line);
		if (!step) continue;
		if (step.source === "MODEL" && Array.isArray(step.tool_calls) && detectToolTampering(step.tool_calls)) tamperingDetected = true;
		if (step.source === "USER_EXPLICIT" && step.type === "USER_INPUT") {
			const stepContent = step.content ?? "";
			if (stepContent.includes(cleanCode)) {
				codeFoundInUserExplicit = true;
				userPromptText = stepContent.slice(0, 300);
			}
		}
	}
	return {
		tamperingDetected,
		codeFoundInUserExplicit,
		userPromptText
	};
}
/**
* Type guard for boundary verification of untrusted inputs.
*/
function isRelaxationCode(code) {
	return /^RELAX-[0-9a-fA-F]{8}$/.test(code.trim());
}
/**
* Verifies whether the specified relaxation code is authorized in the conversation transcript.
*/
function verifyTranscriptAuthorization(relaxationCode, options = {}) {
	const cleanCode = relaxationCode.trim();
	if (!cleanCode) return {
		verified: false,
		tamperingDetected: false,
		reason: "Empty relaxation code"
	};
	const candidatePaths = resolveCandidateTranscriptPaths(options);
	if (candidatePaths.length === 0) return {
		verified: false,
		tamperingDetected: false,
		reason: Boolean(process.env.CI || process.env.CONTINUOUS_INTEGRATION) ? "Transcripts unavailable in headless CI/CD environment" : "No Antigravity transcript.jsonl logs found"
	};
	for (const transcriptPath of candidatePaths) {
		const content = safeReadFileSync(transcriptPath);
		if (!content) continue;
		const summary = scanTranscriptLines(content.split(/\r?\n/).filter((l) => l.trim().length > 0), cleanCode);
		if (summary.tamperingDetected) return {
			verified: false,
			tamperingDetected: true,
			transcriptPath,
			reason: "Tampering detected: model attempted to modify .system_generated or transcript logs"
		};
		if (summary.codeFoundInUserExplicit) return {
			verified: true,
			tamperingDetected: false,
			transcriptPath,
			userPrompt: summary.userPromptText
		};
	}
	return {
		verified: false,
		tamperingDetected: false,
		reason: `Relaxation code '${cleanCode}' was not found in any USER_EXPLICIT transcript step`
	};
}
//#endregion
export { discoverTranscriptFiles, isRelaxationCode, verifyTranscriptAuthorization };
