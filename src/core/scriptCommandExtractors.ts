/**
 * src/core/scriptCommandExtractors.ts
 *
 * AST & SYNTAX-AWARE SCRIPT COMMAND EXTRACTORS (Node.js 26+)
 * Extracts npm and npx invocations from executable scripts and CI/CD pipelines
 * using specialized AST parsers (unbash for Shell, yaml for GitHub Actions,
 * TypeScript Compiler AST for maintenance scripts, Dockerfile parser, and PowerShell/Batch lexical parser).
 */

import path from 'node:path';
import { parse as parseBash } from 'unbash';
import { parseDocument, visit } from 'yaml';
import ts from 'typescript';
import {
  cleanTarget,
  isPlaceholder,
  extractCommandsFromLine,
  NPM_RUN_REGEX,
  NPX_REGEX,
  type ExtractedCommand,
  type CommandInvocationType
} from './npmCommandUtils.ts';
import { safeJsonParse } from './safeUtils.ts';
import { normalizePosixPath } from './safePath.ts';

const SHELL_PREFIX_RUNNERS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'sudo',
  'command',
  'builtin',
  'env',
  'exec',
  'nohup',
  'time'
]);

const PROCESS_RUNNER_NAMES: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'execSync',
  'exec',
  'spawnSync',
  'spawn',
  'execFileSync',
  'execFile',
  'runCommand',
  'runCli',
  'runProcess',
  'runScript',
  'execa',
  'execaSync',
  'execaCommand',
  '$'
]);

const LOG_CMDLETS =
  /^\s*(?:Write-Host|Write-Output|Write-Warning|Write-Error|Write-Verbose|Write-Debug|Write-Information|echo|@echo)\b/i;

function pushCleanCommand(
  rawTarget: string | undefined,
  type: CommandInvocationType,
  lineNum: number,
  rawText: string,
  out: ExtractedCommand[]
): void {
  if (!rawTarget || isPlaceholder(rawTarget)) return;
  const target = cleanTarget(rawTarget);
  if (!target || target.startsWith('-') || isPlaceholder(target)) return;

  out.push({ lineNum, rawText, type, target });
}

function inspectNpmFamilyTokens(
  bin: string,
  words: readonly string[],
  lineNum: number,
  rawText: string,
  out: ExtractedCommand[]
): void {
  if ((bin === 'pnpm' || bin === 'yarn') && words[0] === 'dlx') {
    const target = words.slice(1).find((w) => !w.startsWith('-'));
    pushCleanCommand(target, 'npx', lineNum, rawText, out);
    return;
  }

  let idx = 0;
  while (idx < words.length && words[idx]!.startsWith('-')) {
    const flag = words[idx]!;
    // Script flag parsing
    if (flag === '--prefix' || flag === '-C' || flag === '--workspace' || flag === '-w') {
      idx += 2;
    } else {
      idx++;
    }
  }
  if (idx >= words.length) return;

  const sub = words[idx]!;
  if (sub === 'run' || sub === 'run-script') {
    const targetWord = words.slice(idx + 1).find((w) => !w.startsWith('-'));
    pushCleanCommand(targetWord, 'npm-run', lineNum, rawText, out);
    return;
  }

  if (!sub.startsWith('-') && !/[=<>&|!]/.test(sub)) {
    pushCleanCommand(sub, 'npm-direct', lineNum, rawText, out);
  }
}

function inspectNpxFamilyTokens(
  words: readonly string[],
  lineNum: number,
  rawText: string,
  out: ExtractedCommand[]
): void {
  let idx = 0;
  while (idx < words.length && words[idx]!.startsWith('-')) {
    const flag = words[idx]!;
    if (flag === '--package' || flag === '-p') {
      idx += 2;
    } else {
      idx++;
    }
  }
  if (idx >= words.length) return;

  pushCleanCommand(words[idx], 'npx', lineNum, rawText, out);
}

export function inspectCommandTokens(
  bin: string,
  words: readonly string[],
  lineNum: number,
  rawText: string,
  out: ExtractedCommand[]
): void {
  const packageManagerBins: ReadonlySet<string> = new Set(['npm', 'pnpm', 'bun', 'yarn']);
  if (packageManagerBins.has(bin)) {
    inspectNpmFamilyTokens(bin, words, lineNum, rawText, out);
    return;
  }
  if (bin === 'npx' || bin === 'bunx') {
    inspectNpxFamilyTokens(words, lineNum, rawText, out);
  }
}

interface WordNode {
  readonly type?: string;
  readonly value?: string;
  readonly text?: string;
}

interface CommandNode {
  readonly type?: string;
  readonly pos?: number;
  readonly name?: WordNode;
  readonly suffix?: readonly WordNode[];
  readonly [key: string]: unknown;
}

function inspectBashCommandNode(
  node: CommandNode,
  content: string,
  rawLines: readonly string[],
  out: ExtractedCommand[]
): void {
  if (!node.name) return;
  let name = String(node.name.value ?? node.name.text ?? '');
  if (!name || isPlaceholder(name)) return;

  const rawSuffix = node.suffix || [];
  const wordNodes = rawSuffix.filter((s) => s && s.type === 'Word');
  const words = wordNodes.map((s) => String(s.value ?? s.text ?? '')).filter(Boolean);

  if (SHELL_PREFIX_RUNNERS.has(name)) {
    while (words.length > 0 && (words[0]!.startsWith('-') || words[0]!.includes('='))) {
      words.shift();
    }
    if (words.length > 0) {
      name = words.shift()!;
    }
  }

  const pos = typeof node.pos === 'number' ? node.pos : 0;
  const lineNum = (content.slice(0, pos).match(/\n/g) || []).length + 1;
  const rawText = rawLines[lineNum - 1]?.trim() || '';

  inspectCommandTokens(name, words, lineNum, rawText, out);
}

/**
 * Extracts npm and npx commands from shell scripts (.sh, .bash, .zsh) using unbash AST.
 */
export function extractCommandsFromShell(content: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  let ast: unknown;
  try {
    ast = parseBash(content);
  } catch {
    // Fallback to lexical extraction if unbash encounters unsupported shell syntax
    return extractCommandsLexically(content, '.sh');
  }

  const rawLines = content.split('\n');
  const visited = new Set<object>();

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    const record = node as Record<string, unknown>;
    if (record.type === 'Command' && record.name) {
      inspectBashCommandNode(record as CommandNode, content, rawLines, commands);
    }

    for (const k of Object.keys(record)) {
      const v = record[k];
      if (Array.isArray(v)) {
        for (const item of v) walk(item);
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }

    // Traverse unbash class prototype getters
    if (record.value && typeof record.value === 'object') walk(record.value);
    if (Array.isArray(record.parts)) {
      for (const p of record.parts) walk(p);
    }
    if (record.script && typeof record.script === 'object') walk(record.script);
    if (record.clause && typeof record.clause === 'object') walk(record.clause);
    if (record.then && typeof record.then === 'object') walk(record.then);
    if (record.else && typeof record.else === 'object') walk(record.else);
    if (record.body && typeof record.body === 'object') walk(record.body);
  }

  walk(ast);
  return commands;
}

function appendOffsetShellCommands(
  shellText: string,
  startLineNum: number,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const subCommands = extractCommandsFromShell(shellText);
  for (const sub of subCommands) {
    const actualLine = startLineNum + (sub.lineNum - 1);
    const rawText = rawLines[actualLine - 1]?.trim() || sub.rawText;
    commands.push({
      lineNum: actualLine,
      rawText,
      type: sub.type,
      target: sub.target
    });
  }
}

interface YamlPairNode {
  readonly key?: unknown;
  readonly value?: unknown;
}

function processYamlRunPair(
  pair: YamlPairNode,
  content: string,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const pairKey = pair.key as { value?: unknown; range?: readonly number[] } | undefined;
  const pairVal = pair.value as
    | { value?: unknown; type?: string; range?: readonly number[] }
    | undefined;

  if (pairKey?.value !== 'run' || !pairVal || typeof pairVal.value !== 'string') {
    return;
  }

  const keyRange = pairKey.range;
  const valRange = pairVal.range;
  const keyPos =
    Array.isArray(keyRange) && typeof keyRange[0] === 'number'
      ? keyRange[0]
      : Array.isArray(valRange) && typeof valRange[0] === 'number'
        ? valRange[0]
        : 0;

  const baseLineNum = (content.slice(0, keyPos).match(/\n/g) || []).length + 1;
  const isBlock = pairVal.type === 'BLOCK_LITERAL' || pairVal.type === 'BLOCK_FOLDED';
  const startLineNum = isBlock ? baseLineNum + 1 : baseLineNum;

  appendOffsetShellCommands(pairVal.value, startLineNum, rawLines, commands);
}

/**
 * Extracts npm and npx commands from GitHub Actions and YAML workflows using yaml parser + unbash.
 */
export function extractCommandsFromYaml(content: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  let doc: ReturnType<typeof parseDocument>;
  try {
    doc = parseDocument(content, { keepSourceTokens: true });
  } catch {
    // Fallback to lexical extraction if YAML parsing fails
    return extractCommandsLexically(content, '.yml');
  }

  const rawLines = content.split('\n');

  visit(doc, {
    Pair(_, pair) {
      processYamlRunPair(pair, content, rawLines, commands);
    }
  });

  return commands;
}

function parseExecJsonRun(
  body: string,
  startLine: number,
  rawLines: readonly string[],
  out: ExtractedCommand[]
): boolean {
  if (!body.startsWith('[') || !body.endsWith(']')) return false;
  const parsed = safeJsonParse<unknown>(body);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const bin = String(parsed[0]);
    const args = parsed.slice(1).map(String);
    inspectCommandTokens(bin, args, startLine, rawLines[startLine - 1]?.trim() || body, out);
    return true;
  }
  return false;
}

function parseHeredocRun(
  lines: readonly string[],
  idx: number,
  body: string,
  out: ExtractedCommand[]
): number {
  const markerMatch = body.match(/^<<-?\s*['"]?(\w+)['"]?/);
  if (!markerMatch) return idx;

  const marker = markerMatch[1]!;
  const scriptLines: string[] = [];
  const scriptStartLine = idx + 2;
  let cursor = idx;

  while (cursor + 1 < lines.length) {
    cursor++;
    if (lines[cursor]!.trim() === marker) break;
    scriptLines.push(lines[cursor]!);
  }

  appendOffsetShellCommands(scriptLines.join('\n'), scriptStartLine, lines, out);
  return cursor;
}

/**
 * Extracts npm and npx commands from Dockerfiles (RUN instructions) using unbash.
 */
export function extractCommandsFromDockerfile(content: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/^RUN\s+/i.test(trimmed)) continue;

    const startLine = i + 1;
    let body = trimmed.replace(/^RUN\s+/i, '');

    while (body.endsWith('\\') && i + 1 < lines.length) {
      body = body + '\n' + lines[++i];
    }

    if (parseExecJsonRun(body, startLine, lines, commands)) continue;

    if (body.startsWith('<<')) {
      i = parseHeredocRun(lines, i, body, commands);
      continue;
    }

    appendOffsetShellCommands(body, startLine, lines, commands);
  }

  return commands;
}

function maskQuotedStrings(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let masked = '';
  for (let c = 0; c < line.length; c++) {
    const char = line[c]!;
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      masked += ' ';
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      masked += ' ';
    } else if (inSingle || inDouble) {
      masked += ' ';
    } else {
      masked += char;
    }
  }
  return masked;
}

function stripScriptComment(line: string, isBatch: boolean): string | null {
  if (isBatch) {
    if (/^\s*(?:rem|::)\b/i.test(line)) return null;
    return line;
  }
  const hashIdx = line.indexOf('#');
  if (hashIdx !== -1) {
    return line.slice(0, hashIdx);
  }
  return line;
}

/**
 * Extracts npm and npx commands from PowerShell (.ps1) and Windows Batch (.bat, .cmd) scripts
 * using a sentence-level lexical parser with string masking and comment filtering.
 */
export function extractCommandsFromPowerShell(
  content: string,
  ext: string = '.ps1'
): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const cleanBlock = content.replace(/<#[\s\S]*?#>/g, (m) => ' '.repeat(m.length));
  const lines = cleanBlock.split('\n');
  const isBatch = ext === '.bat' || ext === '.cmd';
  const delimiter = isBatch ? /[;&|]/ : /[;|]/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const uncommented = stripScriptComment(rawLine, isBatch);
    if (uncommented === null) continue;

    const trimmed = uncommented.trim();
    if (!trimmed || LOG_CMDLETS.test(trimmed)) continue;

    const masked = maskQuotedStrings(uncommented);
    const statements = masked.split(delimiter);
    for (const stmt of statements) {
      const s = stmt.trim();
      if (!s || LOG_CMDLETS.test(s)) continue;

      extractCommandsFromLine(s, i + 1, commands, rawLine.trim());
    }
  }

  return commands;
}

function getCalleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function extractLiteralText(expr: ts.Expression | undefined): string | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  return null;
}

function getNodeLine(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function extractArrayTokens(expr: ts.Expression | undefined): string[] {
  if (!expr || !ts.isArrayLiteralExpression(expr)) return [];
  const tokens: string[] = [];
  for (const el of expr.elements) {
    const text = extractLiteralText(el);
    if (text !== null) tokens.push(text);
  }
  return tokens;
}

function handleSpawnCall(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const bin = extractLiteralText(node.arguments[0]);
  if (!bin) return;

  const args = extractArrayTokens(node.arguments[1]);
  const lineNum = getNodeLine(node, sf);
  const rawText = rawLines[lineNum - 1]?.trim() || '';

  inspectCommandTokens(bin, args, lineNum, rawText, commands);
}

function handleExecCall(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const cmdText = extractLiteralText(node.arguments[0]);
  if (!cmdText) return;

  appendOffsetShellCommands(cmdText, getNodeLine(node, sf), rawLines, commands);
}

function handleTaggedTemplate(
  node: ts.TaggedTemplateExpression,
  sf: ts.SourceFile,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const tag = getCalleeName(node.tag);
  if (!tag || !PROCESS_RUNNER_NAMES.has(tag)) return;
  if (!ts.isNoSubstitutionTemplateLiteral(node.template)) return;

  appendOffsetShellCommands(node.template.text, getNodeLine(node, sf), rawLines, commands);
}

function collectStringLiterals(
  node: ts.Node,
  out: { text: string; line: number }[],
  sf: ts.SourceFile
): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push({ text: node.text, line: getNodeLine(node, sf) });
  } else if (ts.isTemplateExpression(node)) {
    const line = getNodeLine(node, sf);
    const fullText = node.head.text + node.templateSpans.map((s) => ` ${s.literal.text}`).join('');
    out.push({ text: fullText, line });
  } else if (ts.isCallExpression(node)) {
    for (const arg of node.arguments) {
      collectStringLiterals(arg, out, sf);
    }
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectStringLiterals(node.left, out, sf);
    collectStringLiterals(node.right, out, sf);
  }
}

function isConsoleCall(node: ts.CallExpression): boolean {
  const expr = node.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    if (ts.isIdentifier(expr.expression) && expr.expression.text === 'console') {
      const method = expr.name.text;
      const consoleMethods: ReadonlySet<string> = new Set(['log', 'info', 'warn', 'error']);
      return consoleMethods.has(method);
    }
  }
  return false;
}

function isErrorInstantiation(node: ts.Node): boolean {
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text.endsWith('Error')
  ) {
    return true;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text.endsWith('Error')
  ) {
    return true;
  }
  return false;
}

function extractMatchingTargets(
  regex: RegExp,
  text: string,
  lineNum: number,
  rawLine: string,
  type: CommandInvocationType,
  commands: ExtractedCommand[]
): void {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const rawTarget = m[1]!;
    if (isPlaceholder(rawTarget)) continue;
    const target = cleanTarget(rawTarget);
    if (!target || isPlaceholder(target) || target.startsWith('-')) continue;
    commands.push({ lineNum, rawText: rawLine, type, target });
  }
}

function handleHelpOrDiagnosticLogs(
  node: ts.CallExpression | ts.NewExpression,
  sf: ts.SourceFile,
  rawLines: readonly string[],
  commands: ExtractedCommand[]
): void {
  const items: { text: string; line: number }[] = [];
  const args = node.arguments ?? [];
  for (const arg of args) {
    collectStringLiterals(arg, items, sf);
  }

  for (const item of items) {
    const rawLine = rawLines[item.line - 1]?.trim() || item.text;
    extractMatchingTargets(NPM_RUN_REGEX, item.text, item.line, rawLine, 'npm-run', commands);
    extractMatchingTargets(NPX_REGEX, item.text, item.line, rawLine, 'npx', commands);
  }
}

/**
 * Extracts npm and npx commands from TypeScript and JavaScript maintenance scripts
 * using TypeScript Compiler AST (inspecting process runner calls and CLI help/diagnostic logs).
 */
export function extractCommandsFromTypeScript(
  content: string,
  filePath: string
): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const sf = ts.createSourceFile(path.basename(filePath), content, ts.ScriptTarget.Latest, true);
  const rawLines = content.split('\n');

  function visitNode(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = getCalleeName(node.expression);
      if (callee && PROCESS_RUNNER_NAMES.has(callee) && node.arguments.length > 0) {
        const spawnFamilyRunners: ReadonlySet<string> = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
        if (spawnFamilyRunners.has(callee)) {
          handleSpawnCall(node, sf, rawLines, commands);
        } else {
          handleExecCall(node, sf, rawLines, commands);
        }
      } else if (isConsoleCall(node)) {
        handleHelpOrDiagnosticLogs(node, sf, rawLines, commands);
        return;
      } else if (isErrorInstantiation(node)) {
        handleHelpOrDiagnosticLogs(node, sf, rawLines, commands);
        return;
      }
    } else if (ts.isNewExpression(node) && isErrorInstantiation(node)) {
      handleHelpOrDiagnosticLogs(node, sf, rawLines, commands);
      return;
    } else if (ts.isTaggedTemplateExpression(node)) {
      handleTaggedTemplate(node, sf, rawLines, commands);
    }

    ts.forEachChild(node, visitNode);
  }

  visitNode(sf);
  return commands;
}

function stripComments(line: string, ext: string): string {
  const lowerExt = ext.toLowerCase();

  const hashCommentExts: ReadonlySet<string> = new Set(['.sh', '.bash', '.zsh', '.ps1', '.yml', '.yaml', 'containerfile']);
  if (hashCommentExts.has(lowerExt) || lowerExt.includes('dockerfile')) {
    const hashIndex = line.indexOf('#');
    if (hashIndex !== -1) return line.slice(0, hashIndex);
    return line;
  }

  if (lowerExt === '.bat' || lowerExt === '.cmd') {
    const trimmed = line.trimStart();
    if (/^(?:rem|::)\b/i.test(trimmed)) return '';
    return line;
  }

  // Script file extensions
  if (lowerExt === '.ts' || lowerExt === '.js' || lowerExt === '.mjs' || lowerExt === '.cjs') {
    const slashIndex = line.indexOf('//');
    if (slashIndex !== -1) return line.slice(0, slashIndex);
    const trimmed = line.trimStart();
    if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return '';
    return line;
  }

  return line;
}

function extractCommandsLexically(content: string, ext: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const cleanLine = stripComments(rawLine, ext).trim();
    if (!cleanLine) continue;

    extractCommandsFromLine(cleanLine, i + 1, commands, rawLine.trim());
  }

  return commands;
}

/**
 * Extracts commands from an executable script or CI/CD configuration,
 * dispatching to the appropriate AST or structured parser based on file type.
 */
export function extractScriptCommands(content: string, filePath: string): ExtractedCommand[] {
  const normPath = normalizePosixPath(filePath);
  const ext = path.extname(normPath).toLowerCase();
  const baseName = path.basename(normPath).toLowerCase();

  // 1. Dockerfiles
  if (
    baseName === 'dockerfile' ||
    baseName.startsWith('dockerfile.') ||
    baseName === 'containerfile' ||
    normPath.endsWith('.dockerfile')
  ) {
    return extractCommandsFromDockerfile(content);
  }

  // 2. GitHub Actions and YAML workflows
  if (normPath.includes('.github/workflows/') || ext === '.yml' || ext === '.yaml') {
    return extractCommandsFromYaml(content);
  }

  // 3. Shell scripts (.sh, .bash, .zsh)
  // Shell script extensions
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh') {
    return extractCommandsFromShell(content);
  }

  // 4. PowerShell & Batch (.ps1, .bat, .cmd)
  // Windows script extensions
  if (ext === '.ps1' || ext === '.bat' || ext === '.cmd') {
    return extractCommandsFromPowerShell(content, ext);
  }

  // 5. TypeScript & JavaScript maintenance scripts (.ts, .js, .mjs, .cjs)
  // JavaScript script extensions
  if (ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return extractCommandsFromTypeScript(content, filePath);
  }

  // Fallback: line-by-line lexical extraction
  return extractCommandsLexically(content, ext);
}
