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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RelaxationCode } from './configRatchet.ts';
import { tryOrNull, safeStatSync, safeReadFileSync, safeJsonParse } from './safeUtils.ts';

export interface TranscriptVerificationResult {
  readonly verified: boolean;
  readonly tamperingDetected: boolean;
  readonly transcriptPath?: string;
  readonly userPrompt?: string;
  readonly reason?: string;
}

export interface TranscriptVerifierOptions {
  readonly transcriptPath?: string;
  readonly brainDir?: string;
}

export interface TranscriptStep {
  readonly step_index?: number;
  readonly source?: string;
  readonly type?: string;
  readonly content?: string;
  readonly tool_calls?: readonly {
    readonly name?: string;
    readonly args?: Record<string, unknown>;
  }[];
}

/**
 * Discovers candidate transcript.jsonl files under Antigravity's brain storage.
 * Returns paths sorted by last modified time (newest first).
 */
export function discoverTranscriptFiles(customBrainDir?: string): string[] {
  const brainDir =
    customBrainDir ??
    process.env.ANTIGRAVITY_BRAIN_DIR ??
    process.env.GEMINI_BRAIN_DIR ??
    path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

  if (!fs.existsSync(brainDir)) return [];

  const candidates: { path: string; mtime: number }[] = [];
  const entries = tryOrNull(() => fs.readdirSync(brainDir, { withFileTypes: true })) ?? [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const transcriptPath = path.join(
      brainDir,
      entry.name,
      '.system_generated',
      'logs',
      'transcript.jsonl'
    );
    const stat = safeStatSync(transcriptPath);
    if (stat) {
      candidates.push({ path: transcriptPath, mtime: stat.mtimeMs });
    }
  }

  return candidates.sort((a, b) => b.mtime - a.mtime).map((c) => c.path);
}

export interface TranscriptToolCall {
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set(['write_file', 'edit_file']);

function hasShellTranscriptRedirection(normalizedCommand: string): boolean {
  // Shell redirection into transcript (e.g. `> transcript.jsonl`, `>> transcript.jsonl`, `1> transcript.jsonl`).
  // Excludes `=>`, `->`, and `>=` which are JavaScript operators inside node -e scripts.
  return /(?<![=>-])(?:>>?|1>|2>)\s*[^|&;"'\r\n]*transcript(?:_full)?\.jsonl/i.test(
    normalizedCommand
  );
}

function hasShellTranscriptFileDeletionOrWrite(normalizedCommand: string): boolean {
  // Shell / PowerShell write and delete cmdlets targeting transcript at command or pipeline start.
  return /(?:^|[;&|\r\n])\s*(?:remove-item|del|rm|erase|unlink|set-content|add-content|out-file|truncate)\b[^|&;\r\n]*transcript(?:_full)?\.jsonl/i.test(
    normalizedCommand
  );
}

function hasScriptTranscriptFileMutation(normalizedCommand: string): boolean {
  // Script / Node write operations mutating transcript (e.g. fs.writeFileSync('...transcript.jsonl', ...)).
  return /\b(?:writefile|writefilesync|appendfile|appendfilesync|createwritestream)\s*\([^)]*transcript(?:_full)?\.jsonl/i.test(
    normalizedCommand
  );
}

/**
 * Checks if a shell command attempted to write, redirect into, or delete transcript files.
 * Read-only commands (node reading via createReadStream, Get-Content, cat) do NOT constitute tampering.
 */
function isShellTranscriptMutation(commandLine: string): boolean {
  const normalizedCommand = commandLine.toLowerCase();
  const hasTranscript =
    normalizedCommand.includes('transcript.jsonl') ||
    normalizedCommand.includes('transcript_full.jsonl');
  if (!hasTranscript) return false;

  return (
    hasShellTranscriptRedirection(normalizedCommand) ||
    hasShellTranscriptFileDeletionOrWrite(normalizedCommand) ||
    hasScriptTranscriptFileMutation(normalizedCommand)
  );
}

/**
 * Checks if a model tool call attempted to write or mutate transcript files.
 * Read-only operations (read_file) and background task log reads (.system_generated/tasks/*.log)
 * are completely safe and do NOT constitute tampering.
 */
export function isTamperingToolCall(toolCall: TranscriptToolCall): boolean {
  const toolName = (toolCall.name ?? '').toLowerCase();
  const args = toolCall.args;
  if (!args) return false;

  // 1. Direct file write or edit mutation tools
  if (MUTATION_TOOL_NAMES.has(toolName)) {
    const rawPath = args.Path ?? args.path;
    const targetPath = (typeof rawPath === 'string' ? rawPath : '').toLowerCase();
    if (targetPath.includes('transcript.jsonl') || targetPath.includes('transcript_full.jsonl')) {
      return true;
    }
  }

  // 2. Shell command execution attempting to mutate transcript files
  if (toolName === 'run_command') {
    const rawCommand = args.CommandLine ?? args.commandLine;
    const commandLine = typeof rawCommand === 'string' ? rawCommand : '';
    if (isShellTranscriptMutation(commandLine)) {
      return true;
    }
  }

  return false;
}

function detectToolTampering(toolCalls: readonly TranscriptToolCall[]): boolean {
  for (const tc of toolCalls) {
    if (isTamperingToolCall(tc)) return true;
  }
  return false;
}

function resolveCandidateTranscriptPaths(options: TranscriptVerifierOptions): string[] {
  if (options.transcriptPath) return [options.transcriptPath];
  if (process.env.ANTIGRAVITY_TRANSCRIPT_PATH) return [process.env.ANTIGRAVITY_TRANSCRIPT_PATH];
  return discoverTranscriptFiles(options.brainDir);
}

interface TranscriptScanSummary {
  readonly tamperingDetected: boolean;
  readonly codeFoundInUserExplicit: boolean;
  readonly userPromptText: string;
}

function scanTranscriptLines(lines: readonly string[], cleanCode: string): TranscriptScanSummary {
  let codeFoundInUserExplicit = false;
  let userPromptText = '';
  let tamperingDetected = false;

  for (const line of lines) {
    const step = safeJsonParse<TranscriptStep>(line);
    if (!step) continue;

    if (
      step.source === 'MODEL' &&
      Array.isArray(step.tool_calls) &&
      detectToolTampering(step.tool_calls)
    ) {
      tamperingDetected = true;
    }

    if (step.source === 'USER_EXPLICIT' && step.type === 'USER_INPUT') {
      const stepContent = step.content ?? '';
      if (stepContent.includes(cleanCode)) {
        codeFoundInUserExplicit = true;
        userPromptText = stepContent.slice(0, 300);
      }
    }
  }

  return { tamperingDetected, codeFoundInUserExplicit, userPromptText };
}

/**
 * Type guard for boundary verification of untrusted inputs.
 */
export function isRelaxationCode(code: string): code is RelaxationCode {
  return /^RELAX-[0-9a-fA-F]{8}$/.test(code.trim());
}

/**
 * Verifies whether the specified relaxation code is authorized in the conversation transcript.
 */
export function verifyTranscriptAuthorization(
  relaxationCode: RelaxationCode,
  options: TranscriptVerifierOptions = {}
): TranscriptVerificationResult {
  const cleanCode = relaxationCode.trim();
  if (!cleanCode) {
    return { verified: false, tamperingDetected: false, reason: 'Empty relaxation code' };
  }

  const candidatePaths = resolveCandidateTranscriptPaths(options);
  if (candidatePaths.length === 0) {
    const isCi = Boolean(process.env.CI || process.env.CONTINUOUS_INTEGRATION);
    return {
      verified: false,
      tamperingDetected: false,
      reason: isCi
        ? 'Transcripts unavailable in headless CI/CD environment'
        : 'No Antigravity transcript.jsonl logs found'
    };
  }

  for (const transcriptPath of candidatePaths) {
    const content = safeReadFileSync(transcriptPath);
    if (!content) continue;

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const summary = scanTranscriptLines(lines, cleanCode);

    if (summary.tamperingDetected) {
      return {
        verified: false,
        tamperingDetected: true,
        transcriptPath,
        reason: 'Tampering detected: model attempted to mutate transcript logs'
      };
    }

    if (summary.codeFoundInUserExplicit) {
      return {
        verified: true,
        tamperingDetected: false,
        transcriptPath,
        userPrompt: summary.userPromptText
      };
    }
  }

  return {
    verified: false,
    tamperingDetected: false,
    reason: `Relaxation code '${cleanCode}' was not found in any USER_EXPLICIT transcript step`
  };
}
