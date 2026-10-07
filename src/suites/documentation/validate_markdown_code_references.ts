/**
 * scripts/auditors/documentation/validate_markdown_code_references.ts
 *
 * MARKDOWN CODE & SCRIPT REFERENCES AUDITOR (Node.js 26+ Native)
 *
 * Validates that all inline source code paths, npm run commands, skill references,
 * and runtime versions referenced across documentation and skills are completely accurate:
 *   1. Broken Source Path References (`markdown-broken-source-ref`): Detects
 *      mentions of `src/...`, `scripts/...`, `supabase/...`, or `tests/...` that
 *      do not resolve to an existent file or directory on disk.
 *   2. Unregistered NPM Scripts (`markdown-unregistered-npm-script`): Detects
 *      mentions of `npm run <cmd>` where `<cmd>` is not registered in `package.json.scripts`.
 *   3. Hardcoded Runtime Versions (`markdown-hardcoded-runtime-version`): Detects
 *      hardcoded runtime version assertions (e.g. `Node >= 26.x`, `npm >= 12.x`)
 *      instead of referencing `package.json` (`engines`) and `.nvmrc`.
 *   4. Broken Skill References (`markdown-broken-skill-ref`): Detects mentions
 *      of `@/<skill-name>` where `<skill-name>` is not a valid skill in `.agents/skills/`.
 *   5. Case Mismatches (`markdown-case-mismatch`): Detects file path or filename
 *      mentions that differ in casing from disk (Linux ext4 case sensitivity violation).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_markdown_code_references.ts
 *   npm run validate:markdown-code-references
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type MarkdownCodeReferenceRuleId =
  | 'markdown-broken-source-ref'
  | 'markdown-unregistered-npm-script'
  | 'markdown-hardcoded-runtime-version'
  | 'markdown-broken-skill-ref'
  | 'markdown-case-mismatch';

export const MARKDOWN_CODE_REFERENCE_RULES: readonly MarkdownCodeReferenceRuleId[] = [
  'markdown-broken-source-ref',
  'markdown-unregistered-npm-script',
  'markdown-hardcoded-runtime-version',
  'markdown-broken-skill-ref',
  'markdown-case-mismatch'
] as const;

export interface MarkdownCodeViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: MarkdownCodeReferenceRuleId;
  readonly message: string;
  readonly context: string;
}

export const DEFAULT_SCAN_DIRECTORIES = [
  '.agents/skills',
  'AGENTS.md',
  'README.md',
  'docs',
  'src',
  'tests',
  'scripts'
] as const;

function getPersistenceDirs(config: ReturnType<typeof getAuditConfig>): string[] {
  if (config.persistence?.engine === 'none') return [];
  const res: string[] = [];
  if (config.paths?.migrationsDir) res.push(config.paths.migrationsDir);
  if (config.persistence?.supabaseDir) res.push(config.persistence.supabaseDir);
  return res;
}

function getRootMarkdownFiles(root: string): string[] {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(entry => entry.name);
  } catch {
    // catch-ok: ignore unreadable projectRoot
    return [];
  }
}

function resolveConfiguredPathCandidates(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) return ['src', 'tests', 'scripts'];
  return [
    ...(paths.srcRoots ?? ['src']),
    ...(paths.testRoots ?? ['tests']),
    ...(paths.e2eRoots ?? []),
    ...(paths.integrationRoots ?? []),
    ...(paths.scriptsRoots ?? ['scripts'])
  ];
}

function resolveAdditionalDomainCandidates(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) return [];
  return [
    ...(paths.codeRoots ?? []),
    ...(paths.demoRoots ?? []),
    ...(paths.dataRoots ?? []),
    ...(paths.cliRoots ?? [])
  ];
}

export function resolveMarkdownScanDirectories(projectRoot?: string, explicitRoots?: readonly string[]): readonly string[] {
  if (explicitRoots && explicitRoots.length > 0) return explicitRoots;
  const config = getAuditConfig(projectRoot);
  const effectiveRoot = projectRoot || process.cwd();

  const candidates: string[] = [
    '.agents/skills',
    'AGENTS.md',
    'README.md',
    'docs',
    ...resolveConfiguredPathCandidates(config.paths),
    ...resolveAdditionalDomainCandidates(config.paths),
    ...getPersistenceDirs(config),
    ...getRootMarkdownFiles(effectiveRoot)
  ];

  return Array.from(new Set(candidates));
}

export const DEFAULT_KNOWN_VALID_ABSTRACT_PATHS = [
  'scripts/tests',
  'scripts/.cache/',
  'scripts/setup/plugins/',
  'scripts/setup/plugins/01_deploy_env.sh',
  'scripts/setup/plugins/01_deploy_env.ps1',
  'scripts/auditors/'
] as const;

export function getKnownValidAbstractPaths(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const paths = new Set<string>(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);
  if (config.paths?.migrationsDir) {
    paths.add(config.paths.migrationsDir);
  }
  if (config.persistence?.supabaseDir) {
    paths.add(`${config.persistence.supabaseDir}/migrations`);
    paths.add(`${config.persistence.supabaseDir}/studio`);
  }
  if (config.documentation?.knownValidAbstractPaths) {
    for (const p of config.documentation.knownValidAbstractPaths) {
      paths.add(p);
    }
  }
  return paths;
}

export const KNOWN_VALID_ABSTRACT_PATHS = new Set(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);

/** English nouns or syntax descriptors following "npm run" in documentation prose to skip */
const IGNORED_SCRIPT_WORDS = new Set([
  'commands',
  'command',
  'scripts',
  'script',
  'options',
  'flags',
  'parameters',
  'arguments'
]);

const KNOWN_PATH_ALIASES = new Set([
  'components', 'logic', 'stores', 'types', 'assets', 'data', 'views',
  'router', 'plugins', 'layouts', 'utils', 'services', 'styles', 'lib',
  'tests', 'api', 'composables', 'injection-keys', 'models', 'shared'
]);

const STANDARD_FILES_TO_SKIP = new Set([
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts',
  'index.ts', 'README.md', 'AGENTS.md', 'setup-linux.sh', 'setup-windows.ps1',
  'Dockerfile', 'docker-compose.yml', '.gitignore', '.eslintrc.cjs'
]);

const BUILTIN_SKILLS = new Set([
  'a11y-debugging', 'agy-customizations', 'antigravity-guide', 'chrome-devtools',
  'chrome-extensions', 'debug-optimize-lcp', 'generative_ui', 'memory-leak-debugging',
  'migrate-workflows', 'modern-web-guidance', 'troubleshooting'
]);

export function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, match => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
}

const CANDIDATE_EXTENSIONS = ['.ts', '.vue', '.d.ts', '.json', '.sql', '.scss', '.css', '.md'] as const;

function findCaseInsensitiveEntry(entries: readonly string[], seg: string, isLast: boolean): string | undefined {
  const directMatch = entries.find(e => e.toLowerCase() === seg.toLowerCase());
  if (directMatch) return directMatch;
  if (!isLast) return undefined;

  for (const ext of CANDIDATE_EXTENSIONS) {
    const extMatch = entries.find(e => e.toLowerCase() === (seg + ext).toLowerCase());
    if (extMatch) return extMatch;
  }
  return undefined;
}

function hasExactMatchWithExtension(entries: readonly string[], seg: string): boolean {
  return CANDIDATE_EXTENSIONS.some(ext => entries.includes(seg + ext));
}

function resolveSegmentCasing(
  entries: readonly string[],
  seg: string,
  isLast: boolean
): { exists: boolean; exactMatch: boolean; actualCasing?: string } {
  if (entries.includes(seg)) {
    return { exists: true, exactMatch: true };
  }

  const foundEntry = findCaseInsensitiveEntry(entries, seg, isLast);
  if (foundEntry) {
    return { exists: true, exactMatch: false, actualCasing: foundEntry };
  }

  if (isLast && hasExactMatchWithExtension(entries, seg)) {
    return { exists: true, exactMatch: true };
  }

  return { exists: false, exactMatch: false };
}

export function checkExactCase(
  startDir: string,
  relativePath: string
): { exists: boolean; exactMatch: boolean; actualCasing?: string } {
  const segments = relativePath.split(/[/\\]+/).filter(Boolean);
  let current = startDir;

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx]!;
    if (!fs.existsSync(current)) return { exists: false, exactMatch: false };
    const entries = fs.readdirSync(current);
    const isLast = idx === segments.length - 1;

    const result = resolveSegmentCasing(entries, seg, isLast);
    if (!result.exists || !result.exactMatch) {
      return result;
    }

    current = path.join(current, seg);
  }

  return { exists: true, exactMatch: true };
}

function loadRegisteredScripts(rootDir: string): Set<string> {
  const pkgPath = path.resolve(rootDir, 'package.json');
  try {
    const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return new Set(Object.keys(pkgContent.scripts || {}));
  } catch {
    // catch-ok: missing or invalid package.json
    return new Set();
  }
}

function addSkillsFromDir(targetDir: string, skillsSet: Set<string>): void {
  if (fs.existsSync(targetDir)) {
    try {
      for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          skillsSet.add(entry.name);
        }
      }
    } catch {
      // catch-ok: unreadable directory
    }
  }
}

function discoverRegisteredSkills(rootDir: string): Set<string> {
  const allSkills = new Set<string>();
  addSkillsFromDir(path.join(rootDir, '.agents/skills'), allSkills);
  addSkillsFromDir(path.join(rootDir, 'skills'), allSkills);
  addSkillsFromDir(path.join(rootDir, 'node_modules/@francogp/auditor/.agents/skills'), allSkills);
  addSkillsFromDir(path.join(rootDir, 'node_modules/@francogp/auditor/skills'), allSkills);
  addSkillsFromDir(path.resolve(import.meta.dirname, '../../../.agents/skills'), allSkills);
  addSkillsFromDir(path.resolve(import.meta.dirname, '../../../skills'), allSkills);

  const config = getAuditConfig(rootDir);
  if (config.documentation?.skillsRoots) {
    for (const r of config.documentation.skillsRoots) {
      addSkillsFromDir(path.resolve(rootDir, r), allSkills);
    }
  }

  return allSkills;
}

function checkNpmRunCommands(
  line: string,
  lineNum: number,
  relPath: string,
  registeredScripts: ReadonlySet<string>,
  auditor: MarkdownCodeReferencesAuditor
): number {
  let checked = 0;
  const npmRegex = /npm run ([\w:-]+)/g;
  let npmMatch: RegExpExecArray | null;
  while ((npmMatch = npmRegex.exec(line)) !== null) {
    const scriptName = npmMatch[1]!.trim();
    checked++;
    if (scriptName.endsWith(':')) continue;
    if (IGNORED_SCRIPT_WORDS.has(scriptName.toLowerCase())) continue;

    if (!registeredScripts.has(scriptName)) {
      auditor.addViolation({
        ruleId: 'markdown-unregistered-npm-script',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `ERR! missing or relocated script: command "npm run ${scriptName}" is not registered in package.json.scripts`,
        context: `npm run ${scriptName}`
      });
    }
  }
  return checked;
}

export const TARGET_NODE_MAJOR_VERSION = '26';
export const TARGET_NPM_MAJOR_VERSION = '12';
const HARDCODED_RUNTIME_VERSION_REGEX = new RegExp(
  `Node(?:\\.js)?\\s+(?:(?:>=|>|v)\\s*)?${TARGET_NODE_MAJOR_VERSION}\\.\\d+|npm\\s+(?:(?:>=|>|v)\\s*)?${TARGET_NPM_MAJOR_VERSION}\\.\\d+`,
  'i'
);

function checkHardcodedRuntimeVersions(
  line: string,
  lineNum: number,
  relPath: string,
  auditor: MarkdownCodeReferencesAuditor
): number {
  const versionMatch = HARDCODED_RUNTIME_VERSION_REGEX.exec(line);
  if (!versionMatch) return 0;

  auditor.addViolation({
    ruleId: 'markdown-hardcoded-runtime-version',
    severity: 'error',
    file: relPath,
    line: lineNum,
    message: `Versión runtime hardcodeada detectada: "${versionMatch[0]}". Debe referenciar package.json (engines) y .nvmrc`,
    context: versionMatch[0]
  });
  return 1;
}

function checkSkillReferences(
  line: string,
  lineNum: number,
  relPath: string,
  allSkills: ReadonlySet<string>,
  auditor: MarkdownCodeReferencesAuditor
): number {
  let checked = 0;
  const skillRefRegex = /@\/([\w-]+)/g;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillRefRegex.exec(line)) !== null) {
    const candidate = skillMatch[1]!;
    const fullRef = skillMatch[0];
    const nextChar = line[skillMatch.index + fullRef.length];
    if (nextChar === '/') continue;
    if (KNOWN_PATH_ALIASES.has(candidate)) continue;

    checked++;
    const isRegistered = allSkills.has(candidate) || BUILTIN_SKILLS.has(candidate);
    if (!isRegistered) {
      auditor.addViolation({
        ruleId: 'markdown-broken-skill-ref',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `Referencia a skill inexistente: "@/${candidate}". El skill no existe en .agents/skills ni en skills integrados`,
        context: `@/${candidate}`
      });
    }
  }
  return checked;
}

function isCandidateAbstractPattern(candidate: string): boolean {
  return (
    candidate.includes('*') ||
    candidate.includes('...') ||
    candidate.includes('<') ||
    candidate.includes('YYYYMMDD') ||
    candidate.includes('case_xxx') ||
    candidate.includes('_xxx') ||
    candidate.includes('my_') ||
    candidate.includes('myData') ||
    candidate.endsWith('_') ||
    (candidate.endsWith('/') && candidate.split('/').length <= 2)
  );
}

function validateSingleSourceRef(
  candidate: string,
  lineNum: number,
  relPath: string,
  filePath: string,
  rootDir: string,
  gitIgnoreMatcher: GitIgnoreMatcher,
  knownValidAbstractPaths: ReadonlySet<string>,
  auditor: MarkdownCodeReferencesAuditor
): void {
  if (isCandidateAbstractPattern(candidate) || knownValidAbstractPaths.has(candidate)) {
    return;
  }
  if (gitIgnoreMatcher.isIgnored(candidate) || gitIgnoreMatcher.isIgnored(path.resolve(rootDir, candidate))) {
    return;
  }

  const caseCheck = checkExactCase(rootDir, candidate);
  if (!caseCheck.exists) {
    const localCaseCheck = checkExactCase(path.dirname(filePath), candidate);
    if (!localCaseCheck.exists) {
      auditor.addViolation({
        ruleId: 'markdown-broken-source-ref',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `Ruta de código referenciada no existe en disco: "${candidate}"`,
        context: candidate
      });
    } else if (!localCaseCheck.exactMatch) {
      auditor.addViolation({
        ruleId: 'markdown-case-mismatch',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `Ruta de código tiene discrepancia de mayúsculas/minúsculas en disco: "${candidate}" -> "${localCaseCheck.actualCasing}" (Linux ext4)`,
        context: candidate
      });
    }
  } else if (!caseCheck.exactMatch) {
    auditor.addViolation({
      ruleId: 'markdown-case-mismatch',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `Ruta de código tiene discrepancia de mayúsculas/minúsculas en disco: "${candidate}" -> "${caseCheck.actualCasing}" (Linux ext4)`,
      context: candidate
    });
  }
}

function checkSourcePathReferences(
  line: string,
  lineNum: number,
  relPath: string,
  filePath: string,
  rootDir: string,
  gitIgnoreMatcher: GitIgnoreMatcher,
  knownValidAbstractPaths: ReadonlySet<string>,
  auditor: MarkdownCodeReferencesAuditor
): number {
  let checked = 0;
  const pathRegex = /(?:^|[`'"\s[\]()])(src\/[\w./#-]+|scripts\/[\w./#-]+|tests\/[\w./#-]+|supabase\/[\w./#-]+|scratch\/[\w./#-]+|packages\/[\w./#-]+)(?:$|[`'"\s[\]().,:;])/g;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathRegex.exec(line)) !== null) {
    const candidate = pathMatch[1]!.replace(/[.,:;)\]`'"]+$/, '').split('#')[0]!;
    if (candidate.startsWith('packages/') && /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa])\b/i.test(line)) {
      continue;
    }
    checked++;
    validateSingleSourceRef(candidate, lineNum, relPath, filePath, rootDir, gitIgnoreMatcher, knownValidAbstractPaths, auditor);
  }
  return checked;
}

function checkAgentsMdBulletDeclaration(
  line: string,
  lineNum: number,
  relPath: string,
  fileDir: string,
  rootDir: string,
  gitIgnoreMatcher: GitIgnoreMatcher,
  seenViolations: Set<string>,
  auditor: MarkdownCodeReferencesAuditor
): number {
  const bulletFileRegex = /^\s*-\s*`([\w.-]+\.(?:ts|vue|json|sql|scss|css))`[:\s-]/;
  const bm = bulletFileRegex.exec(line);
  if (!bm) return 0;

  const token = bm[1]!;
  const tokenPath = path.resolve(fileDir, token);
  if (STANDARD_FILES_TO_SKIP.has(token) || gitIgnoreMatcher.isIgnored(tokenPath)) {
    return 0;
  }

  const localCheck = checkExactCase(fileDir, token);
  const violationKey = `${relPath}:${lineNum}:${token}`;
  if (!localCheck.exists && !seenViolations.has(violationKey)) {
    seenViolations.add(violationKey);
    auditor.addViolation({
      ruleId: 'markdown-broken-source-ref',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `Archivo declarado en lista de contratos locales no existe en "${path.relative(rootDir, fileDir)}": "${token}"`,
      context: token
    });
  } else if (!localCheck.exactMatch && !seenViolations.has(violationKey)) {
    seenViolations.add(violationKey);
    auditor.addViolation({
      ruleId: 'markdown-case-mismatch',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `Archivo "${token}" tiene discrepancia de mayúsculas/minúsculas en disco: "${localCheck.actualCasing}" (Linux ext4)`,
      context: token
    });
  }
  return 1;
}

function checkAgentsMdInlineTokens(
  line: string,
  lineNum: number,
  relPath: string,
  fileDir: string,
  dirEntries: readonly string[],
  gitIgnoreMatcher: GitIgnoreMatcher,
  seenViolations: Set<string>,
  auditor: MarkdownCodeReferencesAuditor
): number {
  let checked = 0;
  const inlineTokenRegex = /`([\w.-]+\.(?:ts|vue|json|sql|scss|css))`(?:[:\s\-)]|$)/g;
  let itm: RegExpExecArray | null;
  while ((itm = inlineTokenRegex.exec(line)) !== null) {
    const token = itm[1]!;
    const tokenPath = path.resolve(fileDir, token);
    if (STANDARD_FILES_TO_SKIP.has(token) || gitIgnoreMatcher.isIgnored(tokenPath)) continue;

    const foundCase = dirEntries.find(e => e.toLowerCase() === token.toLowerCase());
    if (foundCase && foundCase !== token) {
      checked++;
      const violationKey = `${relPath}:${lineNum}:${token}`;
      if (!seenViolations.has(violationKey)) {
        seenViolations.add(violationKey);
        auditor.addViolation({
          ruleId: 'markdown-case-mismatch',
          severity: 'error',
          file: relPath,
          line: lineNum,
          message: `Archivo "${token}" tiene discrepancia de mayúsculas/minúsculas en disco: "${foundCase}" (Linux ext4)`,
          context: token
        });
      }
    }
  }
  return checked;
}

export class MarkdownCodeReferencesAuditor extends BaseAuditor<MarkdownCodeReferenceRuleId> {
private readonly rootDir: string;
  private readonly scanRoots: readonly string[];
  private readonly gitIgnoreMatcher: GitIgnoreMatcher;

  constructor(scanRoots?: readonly string[], rootDir?: string) {
    const effectiveRoot = rootDir || process.cwd();
    const effectiveScanRoots = resolveMarkdownScanDirectories(effectiveRoot, scanRoots);
    super({
      capabilities: { md: true },
      id: 'validate_markdown_code_references',
      name: 'Markdown Code References Validator',
      description: 'Valida rutas, scripts, casing y skills en markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_CODE_REFERENCE_RULES,
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      icon: '💻',
      ruleDescriptions: {
        'markdown-broken-source-ref': 'Ruta de código inexistente',
        'markdown-unregistered-npm-script': 'Comando npm no registrado',
        'markdown-hardcoded-runtime-version': 'Versión Node/npm hardcodeada',
        'markdown-broken-skill-ref': 'Referencia a skill inexistente',
        'markdown-case-mismatch': 'Casing incorrecto en ruta'
      },
      coverage: {
        include: ['**/*.md']
      },
      roots: effectiveScanRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: [
        'coverage/**',
        ...(getAuditConfig(effectiveRoot).paths.ignoreGlobs ?? []),
        ...(getAuditConfig(effectiveRoot).paths.ignoredPatterns ?? [])
      ],
      unignoreDirs: ['.agents'],
      projectRoot: effectiveRoot
    });
    this.rootDir = effectiveRoot;
    this.scanRoots = effectiveScanRoots;
    this.gitIgnoreMatcher = new GitIgnoreMatcher(this.rootDir);
  }

  private scanMarkdownFile(
    filePath: string,
    registeredScripts: ReadonlySet<string>,
    allSkills: ReadonlySet<string>,
    knownValidAbstractPaths: ReadonlySet<string>,
    seenViolations: Set<string>
  ): number {
    const relPath = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
    const rawContent = fs.readFileSync(filePath, 'utf8');
    const cleanContent = stripCodeBlocks(rawContent);
    const lines = cleanContent.split('\n');
    const isSkillDoc = relPath.startsWith('.agents/skills/') || relPath.startsWith('skills/');

    const fileDir = path.dirname(filePath);
    let dirEntries: string[] = [];
    if (relPath.endsWith('AGENTS.md')) {
      try {
        dirEntries = fs.readdirSync(fileDir);
      } catch {
        // catch-ok: unreadable directory
        dirEntries = [];
      }
    }

    let checked = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      if (!isSkillDoc) {
        checked += checkNpmRunCommands(line, lineNum, relPath, registeredScripts, this);
        checked += checkSourcePathReferences(line, lineNum, relPath, filePath, this.rootDir, this.gitIgnoreMatcher, knownValidAbstractPaths, this);
      }

      checked += checkHardcodedRuntimeVersions(line, lineNum, relPath, this);
      checked += checkSkillReferences(line, lineNum, relPath, allSkills, this);

      if (relPath.endsWith('AGENTS.md')) {
        checked += checkAgentsMdBulletDeclaration(line, lineNum, relPath, fileDir, this.rootDir, this.gitIgnoreMatcher, seenViolations, this);
        checked += checkAgentsMdInlineTokens(line, lineNum, relPath, fileDir, dirEntries, this.gitIgnoreMatcher, seenViolations, this);
      }
    }
    return checked;
  }

  public override async runAudit(): Promise<void> {
    const registeredScripts = loadRegisteredScripts(this.rootDir);
    const knownValidAbstractPaths = getKnownValidAbstractPaths(this.rootDir);
    const allSkills = discoverRegisteredSkills(this.rootDir);

    const mdFiles = this.collectMarkdownFiles();

    if (mdFiles.length === 0) {
      for (const r of MARKDOWN_CODE_REFERENCE_RULES) {
        this.markRuleNotApplicable(r, 'No se encontraron archivos markdown');
      }
      return;
    }

    let referencesChecked = 0;
    const seenViolations = new Set<string>();

    for (const filePath of mdFiles) {
      this.recordScanned(filePath);
      for (const r of MARKDOWN_CODE_REFERENCE_RULES) {
        this.markRuleEvaluated(r);
      }
      referencesChecked += this.scanMarkdownFile(
        filePath,
        registeredScripts,
        allSkills,
        knownValidAbstractPaths,
        seenViolations
      );
    }

    this.context.setMetric('Archivos Markdown escaneados', mdFiles.length);
    this.context.setMetric('Referencias de código analizadas', referencesChecked);
  }

  private collectMarkdownFiles(): string[] {
    return this.context.collectFiles(this.scanRoots, new Set(['.md']));
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownCodeReferencesAuditor());
