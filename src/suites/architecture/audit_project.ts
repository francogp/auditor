/**
 * scripts/audit_project.ts
 * 
 * STABLE PROJECT AUDIT ENGINE (Node.js 26+)
 * 
 * Final Safe Version: Context-aware GPU checking.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';
import { enableCompileCache } from 'node:module';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { BaseAuditor, MAX_AUDITOR_DESCRIPTION_LENGTH, CANONICAL_IGNORE_DIRS, isPathIgnored } from '../../core/auditorBase.ts';
import {
  type AuditRule,
  type Violation,
  type RuleDescriptor,
  matchesRule,
  auditRulesConfig as config
} from './audit_rules.ts';
import { loadAuditConfig, AUDITOR_DIR } from '../../core/auditConfig.ts';

enableCompileCache();

const AUDIT_EXTENSIONS = new Set(['.vue', '.scss', '.css', '.ts', '.js', '.md']); // runtime-set: Fast O(1) membership lookup set

async function getFilesToAudit(dir: string): Promise<string[]> {
  const files: string[] = []; // no-domain: Non-domain utility collection or data structure
  const pattern = `**/*{${Array.from(AUDIT_EXTENSIONS).join(',')}}`;
  
  for await (const entry of fs.glob(pattern, {
    cwd: dir,
    exclude: (p: string) => isPathIgnored(p)
  })) {
    files.push(path.resolve(dir, entry));
  }
  return files;
}

function prependRequiredImports(block: string, rules: AuditRule[]): string {
  let result = block;
  for (const rule of rules) {
    const importer = rule.addImport;
    if (importer && result.includes(importer.split(' ')[1]!) && !result.includes(importer)) {
      result = importer + '\n' + result;
    }
  }
  return result;
}

function auditVueScriptBlocks(params: {
  content: string;
  filePath: string;
  candidateRules: readonly AuditRule[];
  allStyleRules: readonly AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  const scriptBlocks = extractAllBlocks(content, 'script');
  const rules = params.candidateRules.filter(
    r => !params.allStyleRules.includes(r) && r !== config.functionCallsInTemplates
  );

  if (rules.length === 0) return { content, modified };

  for (let i = scriptBlocks.length - 1; i >= 0; i--) {
    const block = scriptBlocks[i]!;
    let newBlock = runRules(params.filePath, block.content, rules, params.violations, params.fix, block.startLine);

    if (params.fix && newBlock !== block.content) {
      newBlock = prependRequiredImports(newBlock, rules);
      content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
      modified = true;
    }
  }

  return { content, modified };
}

function auditVueTemplateBlocks(
  content: string,
  filePath: string,
  activeConfigRules: ReadonlySet<AuditRule> | undefined,
  violations: Violation[]
): void {
  const templateBlocks = extractAllBlocks(content, 'template');
  for (const block of templateBlocks) {
    const candidateTemplateRules: AuditRule[] = [
      config.functionCallsInTemplates
    ];
    const templateRules: AuditRule[] = activeConfigRules
      ? candidateTemplateRules.filter(r => activeConfigRules.has(r))
      : candidateTemplateRules;

    if (templateRules.length > 0) {
      runRules(filePath, block.content, templateRules, violations, false, block.startLine);
    }
  }
}

function auditLogicFile(params: {
  content: string;
  filePath: string;
  candidateRules: readonly AuditRule[];
  allStyleRules: readonly AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  const rules = params.candidateRules.filter(
    r => !params.allStyleRules.includes(r) && r !== config.functionCallsInTemplates
  );

  if (rules.length > 0) {
    const newBlock = runRules(params.filePath, content, rules, params.violations, params.fix, 0);
    if (params.fix && newBlock !== content) {
      content = prependRequiredImports(newBlock, rules);
      modified = true;
    }
  }

  return { content, modified };
}

function auditVueStyleBlocks(params: {
  content: string;
  filePath: string;
  styleRules: readonly AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  const styleBlocks = extractAllBlocks(content, 'style');

  for (let i = styleBlocks.length - 1; i >= 0; i--) {
    const block = styleBlocks[i]!;
    const newBlock = runRules(params.filePath, block.content, params.styleRules as AuditRule[], params.violations, params.fix, block.startLine);
    if (params.fix && newBlock !== block.content) {
      content = content.substring(0, block.startIdx) + newBlock + content.substring(block.endIdx);
      modified = true;
    }
  }

  return { content, modified };
}

function auditStyleFile(params: {
  content: string;
  filePath: string;
  styleRules: readonly AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  const newBlock = runRules(params.filePath, content, params.styleRules as AuditRule[], params.violations, params.violations.length > 0 ? false : params.fix, 0);
  if (params.fix && newBlock !== content) {
    content = newBlock;
    modified = true;
  }
  return { content, modified };
}

function auditLogicOrVueScript(params: {
  filePath: string;
  content: string;
  isVue: boolean;
  activeConfigRules?: ReadonlySet<AuditRule>;
  allStyleRules: AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  const allConfigRules: AuditRule[] = Object.values(config) as AuditRule[];
  const candidateRules = params.activeConfigRules
    ? allConfigRules.filter(r => params.activeConfigRules!.has(r))
    : allConfigRules;

  if (params.isVue) {
    const scriptRes = auditVueScriptBlocks({
      content,
      filePath: params.filePath,
      candidateRules,
      allStyleRules: params.allStyleRules,
      fix: params.fix,
      violations: params.violations
    });
    content = scriptRes.content;
    if (scriptRes.modified) modified = true;

    auditVueTemplateBlocks(content, params.filePath, params.activeConfigRules, params.violations);
  } else {
    const logicRes = auditLogicFile({
      content,
      filePath: params.filePath,
      candidateRules,
      allStyleRules: params.allStyleRules,
      fix: params.fix,
      violations: params.violations
    });
    content = logicRes.content;
    if (logicRes.modified) modified = true;
  }
  return { content, modified };
}

function auditStylesOrVueStyles(params: {
  filePath: string;
  content: string;
  isVue: boolean;
  styleRules: AuditRule[];
  fix: boolean;
  violations: Violation[];
}): { content: string; modified: boolean } {
  let { content } = params;
  let modified = false;
  if (params.isVue) {
    const styleRes = auditVueStyleBlocks({
      content,
      filePath: params.filePath,
      styleRules: params.styleRules,
      fix: params.fix,
      violations: params.violations
    });
    content = styleRes.content;
    if (styleRes.modified) modified = true;
  } else {
    const styleRes = auditStyleFile({
      content,
      filePath: params.filePath,
      styleRules: params.styleRules,
      fix: params.fix,
      violations: params.violations
    });
    content = styleRes.content;
    if (styleRes.modified) modified = true;
  }
  return { content, modified };
}

async function auditFile(
  filePath: string, 
  fix: boolean, 
  activeConfigRules?: ReadonlySet<AuditRule>
): Promise<Violation[]> {
  const violations: Violation[] = [];
  let content = await fs.readFile(filePath, 'utf-8');
  let modified = false;

  const isVue = filePath.endsWith('.vue');
  const isLogic = filePath.endsWith('.ts') || filePath.endsWith('.js');
  const isStyle = filePath.endsWith('.scss') || filePath.endsWith('.css');

  const ALL_STYLE_RULES: AuditRule[] = [
    config.viewport,
    config.noSassAtImport
  ];
  const STYLE_RULES: AuditRule[] = activeConfigRules
    ? ALL_STYLE_RULES.filter(r => activeConfigRules.has(r))
    : ALL_STYLE_RULES;

  if (isLogic || isVue) {
    const logicRes = auditLogicOrVueScript({ filePath, content, isVue, activeConfigRules, allStyleRules: ALL_STYLE_RULES, fix, violations });
    content = logicRes.content;
    if (logicRes.modified) modified = true;
  }

  if ((isStyle || isVue) && STYLE_RULES.length > 0) {
    const styleRes = auditStylesOrVueStyles({ filePath, content, isVue, styleRules: STYLE_RULES, fix, violations });
    content = styleRes.content;
    if (styleRes.modified) modified = true;
  }

  if (fix && modified) {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  return violations;
}

export function isInsideComment(content: string, index: number): boolean {
  // Check for Line Comment // ...
  const lastNewLine = content.lastIndexOf('\n', index);
  const lastLineComment = content.lastIndexOf('//', index);
  if (lastLineComment > lastNewLine) return true;

  // Check for Block Comment /* ... */
  const lastStartBlock = content.lastIndexOf('/*', index);
  const lastEndBlock = content.lastIndexOf('*/', index);
  if (lastStartBlock > lastEndBlock) return true;

  return false;
}

export function createLineLocator(content: string, offset: number): (idx: number) => number {
  let lineBreakIndices: number[] | null = null;
  return (idx: number): number => {
    if (!lineBreakIndices) {
      lineBreakIndices = [];
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') lineBreakIndices.push(i);
      }
    }
    let low = 0;
    let high = lineBreakIndices.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (lineBreakIndices[mid]! < idx) low = mid + 1;
      else high = mid;
    }
    return low + 1 + offset;
  };
}

function resolveAuditRuleDescription(rule: AuditRule, defaultText: string): string {
  if (rule.category) return rule.category;
  if (rule.name) return rule.name;
  return defaultText;
}

function collectRuleViolations(
  rule: AuditRule,
  content: string,
  filePath: string,
  getLineNo: (idx: number) => number,
  violations: Violation[]
): void {
  const flags = rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g';
  const regex = new RegExp(rule.regex.source, flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index === regex.lastIndex) regex.lastIndex++;

    if (rule.check && !rule.check(content, match, filePath)) {
      continue;
    }
    if (isInsideComment(content, match.index)) {
      continue;
    }

    const lineNo = getLineNo(match.index);
    violations.push({
      file: filePath,
      line: lineNo,
      message: typeof rule.message === 'function' ? rule.message(match[0]) : rule.message,
      context: match[0],
      severity: rule.severity ?? 'warning',
      fixable: Boolean(rule.fix),
      packageName: rule.packageName,
      ruleId: rule.id,
      ruleDescription: resolveAuditRuleDescription(rule, rule.id ?? 'Regla')
    });
  }
}

export function applyRuleFix(rule: AuditRule, content: string, filePath: string): string {
  if (rule.appliesTo && !rule.appliesTo(filePath)) return content;
  const fixer = rule.fix;
  if (!fixer) return content;
  const gRegex = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g');
  return content.replace(gRegex, (match, ...args) => {
    const matchIdx = typeof args[args.length - 2] === 'number' ? (args[args.length - 2] as number) : 0;
    if (isInsideComment(content, matchIdx)) return match;
    if (rule.check) {
      const checkRegex = new RegExp(rule.regex.source, rule.regex.flags.replace('g', ''));
      const currentMatch = checkRegex.exec(content.substring(matchIdx));
      if (currentMatch) {
        currentMatch.index = matchIdx;
        if (!rule.check(content, currentMatch, filePath)) return match;
      }
    }
    return fixer(match);
  });
}

export function runRules(filePath: string, content: string, rules: AuditRule[], violations: Violation[], fix: boolean, offset: number): string {
  let result = content;
  const getLineNo = createLineLocator(content, offset);

  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(filePath)) {
      continue;
    }
    collectRuleViolations(rule, content, filePath, getLineNo, violations);
    if (fix && rule.fix) {
      result = applyRuleFix(rule, result, filePath);
    }
  }
  return result;
}


export interface VueBlock {
  content: string;
  startLine: number;
  startIdx: number;
  endIdx: number;
}

export function extractAllBlocks(content: string, tag: string): VueBlock[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks: VueBlock[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const blockContent = match[1] ?? '';
    const beforeMatch = content.substring(0, match.index);
    const startLine = beforeMatch.split('\n').length;
    const openingTagLength = match[0].indexOf(blockContent);
    const startIdx = match.index + openingTagLength;
    const endIdx = startIdx + blockContent.length;
    blocks.push({
      content: blockContent,
      startLine,
      startIdx,
      endIdx
    });
  }
  return blocks;
}

function getChangedFiles(ref: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${ref}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f !== '' && AUDIT_EXTENSIONS.has(path.extname(f)) && !Array.from(CANONICAL_IGNORE_DIRS).some(d => f.split(/[/\\]/).includes(d)))
      .map(f => path.resolve(process.cwd(), f));
  } catch (_e) {
    process.stderr.write(styleText('yellow', `⚠️ No se pudo obtener la lista de archivos modificados desde git para ref: '${ref}'. Se auditará el proyecto completo.\n`));
    return [];
  }
}

export function getViolationCategory(v: Violation): string {
  const desc = v.ruleDescription || v.ruleId;
  if (desc) {
    if (v.packageName && !desc.toLowerCase().startsWith(v.packageName.toLowerCase() + ':')) {
      const combined = `${v.packageName}: ${desc}`;
      return combined.length <= MAX_AUDITOR_DESCRIPTION_LENGTH ? combined : desc;
    }
    return desc;
  }
  return 'Otros';
}

const MAX_CONTEXT_SNIPPET_LENGTH = 50;
const DEFAULT_TOP_LIMIT = 15;
const MAX_FILES_TO_SHOW_IN_TERMINAL = 25;
const MAX_VIOLATIONS_PER_FILE_IN_TERMINAL = 10;
function sanitizeContext(ctx?: string): string {
  if (!ctx) return '';
  return ctx.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_SNIPPET_LENGTH);
}

interface ProjectCliContext {
  values: Record<string, unknown>;
  selectedRules: Set<string>;
  activeConfigRules: Set<AuditRule>;
  isHumanMode: boolean;
}

export function extractSelectedRules(values: Record<string, unknown>, positionals: string[]): Set<string> {
  const collectedRules = [
    ...(Array.isArray(values.rule) ? values.rule : [values.rule]),
    ...(Array.isArray(values.rules) ? values.rules : [values.rules]),
    ...positionals.filter(p => p.toLowerCase() === 'dox' || p.includes(','))
  ].filter(Boolean).map(String);

  const selectedRules = new Set<string>();
  for (const raw of collectedRules) {
    for (const part of raw.split(',')) {
      const clean = part.trim().toLowerCase();
      if (clean) selectedRules.add(clean);
    }
  }
  return selectedRules;
}

export function filterActiveConfigRules(selectedRules: Set<string>): Set<AuditRule> {
  const activeConfigRules = new Set<AuditRule>();
  for (const rule of Object.values(config) as AuditRule[]) {
    if (matchesRule(rule, selectedRules)) {
      activeConfigRules.add(rule);
    }
  }
  return activeConfigRules;
}

function parseProjectCliContext(cliArgs?: string[]): ProjectCliContext {
  const rawCliArgs = cliArgs || process.argv.slice(2);
  const normalizedCliArgs = rawCliArgs.map(cliParam => {
    if (cliParam.includes('=') && !cliParam.startsWith('-')) return `--${cliParam}`;
    if (['fix', 'summary', 'json', 'human', 'pretty', 'errors-only', 'css-only'].includes(cliParam)) return `--${cliParam}`;
    return cliParam;
  });

  const parsedConfig = parseArgs({
    args: normalizedCliArgs,
    options: {
      fix: { type: 'boolean', short: 'f' },
      path: { type: 'string', short: 'p', default: '.' },
      output: { type: 'string', short: 'o' },
      summary: { type: 'boolean', short: 's' },
      json: { type: 'boolean', short: 'j' },
      human: { type: 'boolean', short: 'H' },
      pretty: { type: 'boolean' },
      top: { type: 'string', short: 't' },
      'changed-since': { type: 'string' },
      'errors-only': { type: 'boolean' },
      'css-only': { type: 'boolean' },
      rule: { type: 'string', short: 'r', multiple: true },
      rules: { type: 'string', multiple: true }
    },
    allowPositionals: true,
    strict: false
  });

  const values = parsedConfig.values;
  const positionals = parsedConfig.positionals;
  const selectedRules = extractSelectedRules(values, positionals);
  const activeConfigRules = filterActiveConfigRules(selectedRules);

  return {
    values,
    selectedRules,
    activeConfigRules,
    isHumanMode: Boolean(values.human || values.pretty || values.summary)
  };
}

async function runAstFileScans(
  ctx: ProjectCliContext,
  logProgress: (msg: string) => void
): Promise<{ violations: Violation[]; files: string[] }> {
  const shouldScanFiles = ctx.activeConfigRules.size > 0;
  const changedSince = ctx.values['changed-since'] as string | undefined;
  let files: string[] = [];
  let violations: Violation[] = [];

  if (!shouldScanFiles) return { violations, files };

  if (changedSince) {
    files = getChangedFiles(changedSince);
    logProgress(styleText('cyan', `[3/6] 🔍 Auditando archivos modificados desde: '${changedSince}' (${files.length} archivos)...`));
  } else {
    files = await getFilesToAudit(path.resolve(process.cwd(), ctx.values.path as string));
    logProgress(styleText('cyan', `[3/6] 🔍 Auditando AST y reglas de código en ${files.length} archivos...`));
  }

  let processed = 0;
  const total = files.length;
  for (const f of files) {
    processed++;
    if (processed % 200 === 0 || processed === total) {
      logProgress(styleText('cyan', `   ⏳ Progreso AST: ${processed}/${total} archivos (${Math.round((processed / total) * 100)}%)`));
    }
    violations = violations.concat(await auditFile(f, Boolean(ctx.values.fix), ctx.activeConfigRules));
  }
  return { violations, files };
}

export function filterAndGroupViolations(
  rawViolations: Violation[],
  ctx: ProjectCliContext
): { all: Violation[]; fileGroups: Record<string, Violation[]>; typeGroups: Record<string, number> } {
  let all = rawViolations;

  if (ctx.values.path) {
    const normPath = path.normalize(ctx.values.path as string);
    all = all.filter(v => path.normalize(v.file).includes(normPath));
  }

  if (ctx.values['errors-only']) {
    all = all.filter(v => v.severity === 'error');
  }

  if (ctx.selectedRules.size > 0) {
    all = all.filter(v => {
      const category = getViolationCategory(v);
      const desc: RuleDescriptor = {
        id: v.ruleId || category,
        name: v.message,
        category: category,
        aliases: v.context ? [v.context, path.basename(v.file)] : [path.basename(v.file)]
      };
      return matchesRule(desc, ctx.selectedRules);
    });
  }

  all.sort((a, b) => {
    if (a.severity === 'error' && b.severity !== 'error') return -1;
    if (a.severity !== 'error' && b.severity === 'error') return 1;
    return 0;
  });

  const fileGroups: Record<string, Violation[]> = {};
  const typeGroups: Record<string, number> = {};

  for (const v of all) {
    const rawRel = path.isAbsolute(v.file) ? path.relative(process.cwd(), v.file) : v.file;
    const rel = rawRel.replace(/\\/g, '/');
    if (!fileGroups[rel]) fileGroups[rel] = [];
    fileGroups[rel].push(v);

    const category = getViolationCategory(v);
    typeGroups[category] = (typeGroups[category] || 0) + 1;
  }

  return { all, fileGroups, typeGroups };
}

function renderHumanSummaryView(
  typeGroups: Record<string, number>,
  topFiles: Array<{ file: string; errors: number; warnings: number; total: number }>,
  topLimit: number
): void {
  console.log(styleText('bold', '\n--- 📊 RESUMEN DE AUDITORÍA DE CÓDIGO ---'));
  console.log('\nPor tipo de regla:');
  Object.entries(typeGroups)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  - ${cat}: ${count}`);
    });

  console.log(`\nTop ${topLimit} archivos con más problemas:`);
  topFiles.forEach(f => {
    console.log(`  - ${f.file}: ${f.total} violaciones (${f.errors} ❌, ${f.warnings} ⚠️)`);
  });
}

function renderHumanFileViolations(file: string, violations: Violation[]): void {
  const fileErrors = violations.filter(v => v.severity === 'error').length;
  const fileWarns = violations.filter(v => v.severity === 'warning').length;
  console.log(`\n📁 ${styleText('bold', file)} (${violations.length} avisos: ${fileErrors} ❌, ${fileWarns} ⚠️)`);

  for (const v of violations.slice(0, MAX_VIOLATIONS_PER_FILE_IN_TERMINAL)) {
    const icon = v.severity === 'error' ? '❌ ERROR' : '⚠️ WARN ';
    const color = v.severity === 'error' ? 'red' : 'yellow';
    const lineStr = `L${v.line}`.padEnd(5);
    const snippet = sanitizeContext(v.context);
    const snippetStr = snippet ? ` ("${snippet}")` : '';
    console.log(`  ${lineStr} ${styleText(color, icon)} [${getViolationCategory(v)}] ${v.message}${snippetStr}`);
  }
  if (violations.length > MAX_VIOLATIONS_PER_FILE_IN_TERMINAL) {
    console.log(styleText('cyan', `  ... y ${violations.length - MAX_VIOLATIONS_PER_FILE_IN_TERMINAL} aviso(s) más en este archivo.`));
  }
}

function renderHumanDetailView(fileGroups: Record<string, Violation[]>): void {
  console.log(styleText('bold', '\n--- 🔎 DETALLE DE VIOLACIONES POR ARCHIVO ---'));
  const entries = Object.entries(fileGroups);
  const filesToShow = entries.slice(0, MAX_FILES_TO_SHOW_IN_TERMINAL);

  for (const [file, violations] of filesToShow) {
    renderHumanFileViolations(file, violations);
  }

  if (entries.length > MAX_FILES_TO_SHOW_IN_TERMINAL) {
    console.log(styleText('cyan', `\n[INFO] Se muestran ${MAX_FILES_TO_SHOW_IN_TERMINAL} de ${entries.length} archivos con avisos para evitar saturar la terminal.`));
    console.log(styleText('cyan', `👉 Usa "npm run auditor errors-only" para filtrar solo errores o consulta scratch/audits/latest_audit.json para el volcado completo.`));
  }
}

function renderHumanTerminalReport(
  fileGroups: Record<string, Violation[]>,
  typeGroups: Record<string, number>,
  topFiles: Array<{ file: string; errors: number; warnings: number; total: number }>,
  errorsCount: number,
  warningsCount: number,
  topLimit: number,
  values: Record<string, unknown>,
  archJsonPath: string
): void {
  if (values.summary) {
    renderHumanSummaryView(typeGroups, topFiles, topLimit);
  } else {
    renderHumanDetailView(fileGroups);
  }

  console.log(styleText('bold', '\n======================================================'));
  console.log(`📊 TOTAL: ${errorsCount === 0 ? styleText('green', '0 Errores') : styleText('red', `${errorsCount} Errores`)} | ${styleText('yellow', `${warningsCount} Advertencias`)} | ${Object.keys(fileGroups).length} Archivos`);
  console.log('======================================================');
  console.log(styleText('dim', `💾 Reporte detallado guardado en: ${path.relative(process.cwd(), archJsonPath)}\n`));
}

async function exportProjectReportOutput(
  values: Record<string, unknown>,
  jsonReport: Record<string, unknown>,
  all: Violation[],
  fileGroups: Record<string, Violation[]>,
  typeGroups: Record<string, number>,
  topFiles: Array<{ file: string; errors: number; warnings: number; total: number }>,
  errorsCount: number,
  warningsCount: number,
  logProgress: (msg: string) => void
): Promise<void> {
  if (!values.output) return;
  const outputPath = path.resolve(process.cwd(), values.output as string);
  if (outputPath.endsWith('.json')) {
    await fs.writeFile(outputPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  } else if (outputPath.endsWith('.md')) {
    let md = `# Reporte de Auditoría del Proyecto\n\n`;
    md += `**Estado**: ${errorsCount === 0 ? '✅ Aprobado' : '❌ Fallido'}\n\n`;
    md += `| Métrica | Valor |\n| :--- | :--- |\n`;
    md += `| **Errores** | \`${errorsCount}\` |\n`;
    md += `| **Advertencias** | \`${warningsCount}\` |\n`;
    md += `| **Archivos Afectados** | \`${Object.keys(fileGroups).length}\` |\n\n`;

    md += `## 📊 Desglose por Categoría\n\n| Categoría | Cantidad |\n| :--- | :---: |\n`;
    Object.entries(typeGroups)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        md += `| ${cat} | ${count} |\n`;
      });

    md += `\n## 📁 Top Archivos con Más Avisos\n\n| Archivo | Errores | Advertencias | Total |\n| :--- | :---: | :---: | :---: |\n`;
    topFiles.forEach(f => {
      md += `| \`${f.file}\` | ${f.errors} | ${f.warnings} | ${f.total} |\n`;
    });

    await fs.writeFile(outputPath, md, 'utf-8');
  } else {
    const lines = all.map(v => `[${v.severity.toUpperCase()}] ${path.relative(process.cwd(), v.file)}:${v.line} -> [${getViolationCategory(v)}] ${v.message} ("${sanitizeContext(v.context)}")`);
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  }
  logProgress(styleText('cyan', `✨ Reporte completo escrito en: ${values.output}`));
}

async function executeProjectAuditPhases(
  ctx: ProjectCliContext,
  logProgress: (msg: string) => void
): Promise<{ all: Violation[]; files: string[] }> {
  const astResult = await runAstFileScans(ctx, logProgress);
  return { all: astResult.violations, files: astResult.files };
}

export function buildProjectTopFiles(fileGroups: Record<string, Violation[]>, topLimit: number) {
  return Object.entries(fileGroups)
    .map(([file, violations]) => ({
      file,
      errors: violations.filter(v => v.severity === 'error').length,
      warnings: violations.filter(v => v.severity === 'warning').length,
      total: violations.length
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topLimit);
}

function buildProjectJsonReport(params: {
  all: readonly Violation[];
  files: readonly string[];
  fileGroups: Record<string, Violation[]>;
  typeGroups: Record<string, number>;
  topFiles: ReturnType<typeof buildProjectTopFiles>;
  errorsCount: number;
  warningsCount: number;
  durationMs: number;
}) {
  const { all, files, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, durationMs } = params;
  return {
    id: 'audit_project',
    name: 'Project Architecture & Style Rules',
    family: 'architecture',
    status: errorsCount > 0 ? 'failed' : 'passed',
    durationMs,
    metrics: {
      'Archivos Escaneados': files.length,
      'Archivos Afectados': Object.keys(fileGroups).length
    },
    findings: all.map(v => ({
      severity: v.severity,
      message: v.message,
      file: v.file,
      line: v.line,
      context: sanitizeContext(v.context),
      ruleId: v.ruleId || getViolationCategory(v),
      ruleDescription: getViolationCategory(v)
    })),
    summary: {
      errors: errorsCount,
      warnings: warningsCount,
      info: 0,
      totalFilesScanned: files.length,
      totalViolations: all.length,
      filesWithIssues: Object.keys(fileGroups).length,
      byCategory: typeGroups
    },
    topFiles,
    files: Object.fromEntries(
      Object.entries(fileGroups).map(([file, violations]) => [
        file,
        violations.map(v => ({
          line: v.line,
          severity: v.severity,
          category: getViolationCategory(v),
          message: v.message,
          context: sanitizeContext(v.context)
        }))
      ])
    )
  };
}

async function persistProjectReports(jsonReport: object): Promise<{ archJsonPath: string; jsonReportStr: string }> {
  const scratchArchDir = path.resolve(process.cwd(), 'scratch/audits/architecture');
  await fs.mkdir(scratchArchDir, { recursive: true });
  const archJsonPath = path.join(scratchArchDir, 'audit_project.json');
  const latestArchJsonPath = path.resolve(process.cwd(), 'scratch/audits/latest_audit_project.json');
  const jsonReportStr = JSON.stringify(jsonReport, null, 2);
  await fs.writeFile(archJsonPath, jsonReportStr, 'utf-8');
  await fs.writeFile(latestArchJsonPath, jsonReportStr, 'utf-8');
  return { archJsonPath, jsonReportStr };
}

export async function main(cliArgs?: string[]): Promise<Violation[]> {
  await loadAuditConfig();
  const startTime = performance.now();
  const ctx = parseProjectCliContext(cliArgs);

  function logProgress(msg: string) {
    if (process.env.AUDIT_SUBPROCESS === 'true') {
      return;
    }
    if (ctx.isHumanMode) {
      console.log(msg);
    } else {
      process.stderr.write(msg + '\n');
    }
  }

  logProgress(styleText('bold', '--- 🔎 REGLAS DE CÓDIGO Y ESTRUCTURA DOX (audit_project.ts) ---'));
  if (ctx.selectedRules.size > 0) {
    logProgress(styleText('cyan', `🎯 Ejecución selectiva de reglas: [ ${Array.from(ctx.selectedRules).join(', ')} ]`));
  }

  const { all: rawAll, files } = await executeProjectAuditPhases(ctx, logProgress);
  const { all, fileGroups, typeGroups } = filterAndGroupViolations(rawAll, ctx);

  const topLimit = ctx.values.top ? parseInt(ctx.values.top as string, 10) : DEFAULT_TOP_LIMIT;
  const topFiles = buildProjectTopFiles(fileGroups, topLimit);

  const errorsCount = all.filter(v => v.severity === 'error').length;
  const warningsCount = all.filter(v => v.severity === 'warning').length;

  const jsonReport = buildProjectJsonReport({
    all,
    files,
    fileGroups,
    typeGroups,
    topFiles,
    errorsCount,
    warningsCount,
    durationMs: Math.round(performance.now() - startTime)
  });

  const { archJsonPath, jsonReportStr } = await persistProjectReports(jsonReport);

  if (process.env.AUDIT_SUBPROCESS !== 'true') {
    if (ctx.isHumanMode) {
      renderHumanTerminalReport(fileGroups, typeGroups, topFiles, errorsCount, warningsCount, topLimit, ctx.values, archJsonPath);
    } else {
      console.log(jsonReportStr);
    }
  }

  await exportProjectReportOutput(ctx.values, jsonReport, all, fileGroups, typeGroups, topFiles, errorsCount, warningsCount, logProgress);

  if (ctx.values.fix) logProgress(styleText('cyan', '✨ Correcciones aplicadas.'));

  return all;
}

export function getProjectArchitectureRuleDescriptions(): Record<string, string> {
  const descriptions: Record<string, string> = {};

  for (const [key, rule] of Object.entries(config)) {
    const r = rule as AuditRule;
    const id = r.id ? r.id : key;
    const desc = resolveAuditRuleDescription(r, key);
    descriptions[id] = desc;
  }

  return descriptions;
}

export class ProjectArchitectureAuditor extends BaseAuditor<string> {
  constructor() {
    super({
      capabilities: { fix: true, lint: true, md: true, ast: true, changedSince: true, heavy: true },
      id: 'audit_project',
      name: 'Project Architecture & Style Rules',
      description: 'Audita reglas de arquitectura, TypeScript y estilo',
      family: 'architecture',
      packageName: 'Arquitectura',
      configKey: 'paths',
      defaultConfig: {},
      icon: '🏛️',
      coverage: {
        include: ['**/*.{vue,scss,css,ts,js,md}'],
        exclude: [path.posix.join(AUDITOR_DIR, '**')]
      },
      ruleDescriptions: getProjectArchitectureRuleDescriptions()
    });
  }

  public override async runAudit(): Promise<void> {
    const files = await getFilesToAudit(this.projectRoot);
    for (const f of files) {
      this.recordScanned(f);
    }
    for (const r of Object.keys(this.ruleDescriptions ?? {})) {
      this.markRuleEvaluated(r);
    }
    const violations = await main();
    for (const v of violations) {
      const relFile = v.file
        ? (path.isAbsolute(v.file) ? path.relative(this.projectRoot, v.file).replace(/\\/g, '/') : v.file.replace(/\\/g, '/'))
        : '';
      this.addViolation({
        ruleId: v.ruleId || getViolationCategory(v),
        ruleDescription: v.ruleDescription,
        severity: v.severity,
        file: relFile,
        line: v.line,
        message: v.message,
        context: v.context
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ProjectArchitectureAuditor());
