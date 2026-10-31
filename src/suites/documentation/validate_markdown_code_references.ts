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
 *      instead of referencing `package.json` (`engines`) and `.node-version`.
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
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import type { FindingSeverity } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  isPathIgnored,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';
import {
  getEffectiveIgnoreGlobs,
  getEffectiveUnignoreDirs
} from '../../core/canonicalIgnoreRegistry.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import {
  resolveProjectVersionInfo,
  scanAndFixMarkdownProjectVersions
} from '../../core/markdownVersionValidator.ts';
import { normalizePosixPath, toPosixRelative } from '../../core/safePath.ts';
import { tryOrDefault, tryOrNull } from '../../core/safeUtils.ts';

enableCompileCache();

export type MarkdownCodeReferenceRuleId =
  | 'markdown-broken-source-ref'
  | 'markdown-hardcoded-runtime-version'
  | 'markdown-broken-skill-ref'
  | 'markdown-case-mismatch'
  | 'markdown-outdated-project-version';

export const MARKDOWN_CODE_REFERENCE_RULES: readonly MarkdownCodeReferenceRuleId[] = [
  'markdown-broken-source-ref',
  'markdown-hardcoded-runtime-version',
  'markdown-broken-skill-ref',
  'markdown-case-mismatch',
  'markdown-outdated-project-version'
] as const;

export interface MarkdownCodeViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: MarkdownCodeReferenceRuleId;
  readonly message: string;
  readonly context: string;
}

interface ViolationEmitter {
  addViolation(violation: {
    ruleId: MarkdownCodeReferenceRuleId;
    severity: FindingSeverity;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    context?: string;
    fixable?: boolean;
  }): void;
}

function getPersistenceDirs(config: ReturnType<typeof getAuditConfig>): string[] {
  if (config.persistence?.engine === 'none') return [];
  const res: string[] = [];
  if (config.paths?.migrationsDir) res.push(config.paths.migrationsDir);
  if (config.persistence?.supabaseDir) res.push(config.persistence.supabaseDir);
  return res;
}

function getRootMarkdownFiles(root: string): string[] {
  return tryOrDefault(
    () =>
      fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map((entry) => entry.name),
    []
  );
}

function extractTopLevelRoots(dirs: readonly string[]): string[] {
  return dirs.map((d) => normalizePosixPath(d).split('/')[0]!).filter(Boolean);
}

function resolveConfiguredPathCandidates(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) return [];
  const declared = [
    ...(paths.srcRoots ?? []),
    ...(paths.testRoots ?? []),
    ...(paths.e2eRoots ?? []),
    ...(paths.integrationRoots ?? []),
    ...(paths.scriptsRoots ?? [])
  ];
  return [...declared, ...extractTopLevelRoots(declared)];
}

function resolveAdditionalDomainCandidates(paths?: AuditEngineConfig['paths']): string[] {
  if (!paths) return [];
  const additional = [
    ...(paths.codeRoots ?? []),
    ...(paths.demoRoots ?? []),
    ...(paths.dataRoots ?? []),
    ...(paths.cliRoots ?? [])
  ];
  return [...additional, ...extractTopLevelRoots(additional)];
}

export function resolveMarkdownScanDirectories(
  projectRoot?: string,
  explicitRoots?: readonly string[]
): readonly string[] {
  if (explicitRoots && explicitRoots.length > 0) return explicitRoots;
  const config = getAuditConfig(projectRoot);
  const effectiveRoot = projectRoot || process.cwd();

  const defaultSkillsRoots = (DEFAULT_AUDIT_CONFIG.documentation?.skillsRoots ?? []).filter((r) =>
    fs.existsSync(path.join(effectiveRoot, r))
  );
  const skillsRoots = config.documentation?.skillsRoots?.length
    ? config.documentation.skillsRoots
    : defaultSkillsRoots;
  const skillsTopSegments = new Set(
    skillsRoots.map((r) => normalizePosixPath(r).split('/')[0]).filter(Boolean)
  );

  const topLevelDirs: string[] = tryOrDefault(() => {
    const dirs: string[] = [];
    const entries = fs.readdirSync(effectiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !skillsTopSegments.has(entry.name) &&
        !isPathIgnored(entry.name, [], [], effectiveRoot)
      ) {
        dirs.push(entry.name);
      }
    }
    return dirs;
  }, []);

  const candidates: string[] = [
    ...skillsRoots,
    ...topLevelDirs,
    ...resolveConfiguredPathCandidates(config.paths),
    ...resolveAdditionalDomainCandidates(config.paths),
    ...getPersistenceDirs(config),
    ...getRootMarkdownFiles(effectiveRoot)
  ];

  return Array.from(new Set(candidates));
}

export const DEFAULT_KNOWN_VALID_ABSTRACT_PATHS: readonly string[] = [];

export function getKnownValidAbstractPaths(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const paths = new Set<string>(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);
  if (config.paths?.migrationsDir) {
    paths.add(config.paths.migrationsDir);
  }
  if (config.persistence?.supabaseDir) {
    paths.add(path.posix.join(config.persistence.supabaseDir, 'migrations'));
    paths.add(path.posix.join(config.persistence.supabaseDir, 'studio'));
  }
  if (config.documentation?.knownValidAbstractPaths) {
    for (const p of config.documentation.knownValidAbstractPaths) {
      paths.add(p);
    }
  }
  return paths;
}

export const KNOWN_VALID_ABSTRACT_PATHS = new Set(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);

const KNOWN_PATH_ALIASES = new Set([
  'components',
  'logic',
  'stores',
  'types',
  'assets',
  'data',
  'views',
  'router',
  'plugins',
  'layouts',
  'utils',
  'services',
  'styles',
  'lib',
  'tests',
  'api',
  'composables',
  'injection-keys',
  'models',
  'shared'
]);

const STANDARD_FILES_TO_SKIP = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'index.ts',
  'README.md',
  'AGENTS.md',
  'setup-linux.sh',
  'setup-windows.ps1',
  'Dockerfile',
  'docker-compose.yml',
  '.gitignore',
  '.eslintrc.cjs'
]);

const BUILTIN_SKILLS = new Set([
  'a11y-debugging',
  'agy-customizations',
  'antigravity-guide',
  'chrome-devtools',
  'chrome-extensions',
  'debug-optimize-lcp',
  'generative_ui',
  'memory-leak-debugging',
  'migrate-workflows',
  'modern-web-guidance',
  'troubleshooting'
]);

export function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, (match) => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
}

const CANDIDATE_EXTENSIONS = [
  '.ts',
  '.vue',
  '.d.ts',
  '.json',
  '.sql',
  '.scss',
  '.css',
  '.md'
] as const;

function findCaseInsensitiveEntry(
  entries: readonly string[],
  seg: string,
  isLast: boolean
): string | undefined {
  const directMatch = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
  if (directMatch) return directMatch;
  if (!isLast) return undefined;

  for (const ext of CANDIDATE_EXTENSIONS) {
    const extMatch = entries.find((e) => e.toLowerCase() === (seg + ext).toLowerCase());
    if (extMatch) return extMatch;
  }
  return undefined;
}

function hasExactMatchWithExtension(entries: readonly string[], seg: string): boolean {
  return CANDIDATE_EXTENSIONS.some((ext) => entries.includes(seg + ext));
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
  const segments = toPosixRelative(startDir, relativePath).split('/').filter(Boolean);
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

function addSkillsFromDir(targetDir: string, skillsSet: Set<string>): void {
  if (fs.existsSync(targetDir)) {
    tryOrNull(() => {
      for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          skillsSet.add(entry.name);
        }
      }
    });
  }
}

function discoverRegisteredSkills(rootDir: string): Set<string> {
  const allSkills = new Set<string>();
  const config = getAuditConfig(rootDir);
  if (config.documentation?.skillsRoots) {
    for (const r of config.documentation.skillsRoots) {
      addSkillsFromDir(path.resolve(rootDir, r), allSkills);
    }
  }

  // Package distribution fallback (when auditor is installed inside node_modules)
  addSkillsFromDir(path.join(rootDir, 'node_modules/@francogp/auditor/.agents/skills'), allSkills);
  addSkillsFromDir(path.resolve(import.meta.dirname, '../../../.agents/skills'), allSkills);

  return allSkills;
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
  auditor: ViolationEmitter
): number {
  const versionMatch = HARDCODED_RUNTIME_VERSION_REGEX.exec(line);
  if (!versionMatch) return 0;

  auditor.addViolation({
    ruleId: 'markdown-hardcoded-runtime-version',
    severity: 'error',
    file: relPath,
    line: lineNum,
    message: `Hardcoded runtime version detected: "${versionMatch[0]}". Must reference package.json (engines) and .node-version`,
    context: versionMatch[0]
  });
  return 1;
}

function checkSkillReferences(
  line: string,
  lineNum: number,
  relPath: string,
  allSkills: ReadonlySet<string>,
  auditor: ViolationEmitter
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
        message: `Reference to non-existent skill: "@/${candidate}". Skill does not exist in .agents/skills or built-in skills`,
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
  auditor: ViolationEmitter
): void {
  if (isCandidateAbstractPattern(candidate) || knownValidAbstractPaths.has(candidate)) {
    return;
  }
  if (
    gitIgnoreMatcher.isIgnored(candidate) ||
    gitIgnoreMatcher.isIgnored(path.resolve(rootDir, candidate))
  ) {
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
        message: `Referenced code path does not exist on disk: "${candidate}"`,
        context: candidate
      });
    } else if (!localCaseCheck.exactMatch) {
      auditor.addViolation({
        ruleId: 'markdown-case-mismatch',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `Referenced code path has casing mismatch on disk: "${candidate}" -> "${localCaseCheck.actualCasing}" (Linux ext4)`,
        context: candidate
      });
    }
  } else if (!caseCheck.exactMatch) {
    auditor.addViolation({
      ruleId: 'markdown-case-mismatch',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `Referenced code path has casing mismatch on disk: "${candidate}" -> "${caseCheck.actualCasing}" (Linux ext4)`,
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
  auditor: ViolationEmitter
): number {
  let checked = 0;
  const pathRegex =
    /(?:^|[`'"\s[\]()])(src\/[\w./#-]+|scripts\/[\w./#-]+|tests\/[\w./#-]+|supabase\/[\w./#-]+|scratch\/[\w./#-]+|packages\/[\w./#-]+)(?:$|[`'"\s[\]().,:;])/g;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathRegex.exec(line)) !== null) {
    const candidate = pathMatch[1]!.replace(/[.,:;)\]`'"]+$/, '').split('#')[0]!;
    if (
      candidate.startsWith('packages/') &&
      /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa])\b/i.test(
        line
      )
    ) {
      continue;
    }
    checked++;
    validateSingleSourceRef(
      candidate,
      lineNum,
      relPath,
      filePath,
      rootDir,
      gitIgnoreMatcher,
      knownValidAbstractPaths,
      auditor
    );
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
  auditor: ViolationEmitter
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
      message: `File declared in local contracts list does not exist in "${path.relative(rootDir, fileDir)}": "${token}"`,
      context: token
    });
  } else if (!localCheck.exactMatch && !seenViolations.has(violationKey)) {
    seenViolations.add(violationKey);
    auditor.addViolation({
      ruleId: 'markdown-case-mismatch',
      severity: 'error',
      file: relPath,
      line: lineNum,
      message: `File "${token}" has casing mismatch on disk: "${localCheck.actualCasing}" (Linux ext4)`,
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
  auditor: ViolationEmitter
): number {
  let checked = 0;
  const inlineTokenRegex = /`([\w.-]+\.(?:ts|vue|json|sql|scss|css))`(?:[:\s\-)]|$)/g;
  let itm: RegExpExecArray | null;
  while ((itm = inlineTokenRegex.exec(line)) !== null) {
    const token = itm[1]!;
    const tokenPath = path.resolve(fileDir, token);
    if (STANDARD_FILES_TO_SKIP.has(token) || gitIgnoreMatcher.isIgnored(tokenPath)) continue;

    const foundCase = dirEntries.find((e) => e.toLowerCase() === token.toLowerCase());
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
          message: `File "${token}" has casing mismatch on disk: "${foundCase}" (Linux ext4)`,
          context: token
        });
      }
    }
  }
  return checked;
}
interface ParsedMarkdownDoc {
  filePath: string;
  relPath: string;
  rawContent: string;
  rawLines: readonly string[];
  lines: readonly string[];
  isSkillDoc: boolean;
  fileDir: string;
  dirEntries: string[];
}

export interface MarkdownCodeReferencesOptions extends FileScanRootsOptions {
  readonly knownValidAbstractPaths?: readonly string[];
}

export class MarkdownCodeReferencesAuditor extends BaseAuditor<MarkdownCodeReferenceRuleId> {
  private readonly rootDir: string;
  private readonly scanRoots: readonly string[];
  private readonly gitIgnoreMatcher: GitIgnoreMatcher;
  private readonly customAbstractPaths?: ReadonlySet<string>;

  public constructor(options: MarkdownCodeReferencesOptions = {}) {
    const effectiveRoot = options.projectRoot || process.cwd();
    const effectiveScanRoots = resolveMarkdownScanDirectories(effectiveRoot, options.roots);
    super({
      ruleFixers: {},
      fixableRuleIds: ['markdown-outdated-project-version'],
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(MARKDOWN_CODE_REFERENCE_RULES, {
        speed: 'light',
        phase: 'normal',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_markdown_code_references',
      name: 'Markdown Code References Validator',
      description: 'Validates paths, scripts, casing, and skills in markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_CODE_REFERENCE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(
        MARKDOWN_CODE_REFERENCE_RULES,
        'polish'
      ),
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '💻',
      ruleDescriptions: {
        'markdown-broken-source-ref': 'Non-existent code path',
        'markdown-hardcoded-runtime-version': 'Hardcoded Node/npm version',
        'markdown-broken-skill-ref': 'Non-existent skill reference',
        'markdown-case-mismatch': 'Incorrect path casing',
        'markdown-outdated-project-version': 'Outdated project version'
      },
      ruleRemediations: {
        'markdown-broken-source-ref':
          '📖 REMEDIATION GUIDE: markdown-broken-source-ref\n' +
          '1. Root Cause: A Markdown file references a file or directory path that does not exist in the repository filesystem.\n' +
          '2. Diagnosis: Check the path indicated in the message and line of the Markdown file.\n' +
          '3. Canonical Solution:\n' +
          '   a) If the file was moved or renamed: update the Markdown path to point to its current location.\n' +
          '   b) If the file was deleted: remove the obsolete reference from the document or manual.\n' +
          '   c) If it is an abstract or hypothetical path in an example: delimit it with placeholder syntax (e.g. `<path>`, `...`, `path/to/...`) so the parser does not treat it as a real path.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: `[Config](./src/oldConfig.ts)` (if the file does not exist)\n' +
          '   ✅ Correct:   `[Config](./src/config/audit.config.ts)`',
        'markdown-hardcoded-runtime-version':
          '📖 REMEDIATION GUIDE: markdown-hardcoded-runtime-version\n' +
          '1. Root Cause: A fixed Node.js or runtime version was found hardcoded in plain text in documentation, violating SSoT (Single Source of Truth).\n' +
          '2. Diagnosis: Locate the line where the fixed version appears (for example, "Node.js v20.0.0").\n' +
          '3. Canonical Solution:\n' +
          '   a) Instead of hardcoding version numbers, reference `package.json` (`engines.node`) or `.node-version` / `.nvmrc`.\n' +
          '   b) If necessary to document requirements, write "Node.js (per package.json engines)" or synchronize with current canonical version.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: "Requires Node.js 20.10.0+"\n' +
          '   ✅ Correct:   "Requires Node.js (per `engines.node` in `package.json`)"',
        'markdown-broken-skill-ref':
          '📖 REMEDIATION GUIDE: markdown-broken-skill-ref\n' +
          '1. Root Cause: An agent skill is referenced with `@/skill-name` syntax, but the skill does not exist in `.agents/skills/` or built-in skills.\n' +
          '2. Diagnosis: Check the skill identifier on the reported line against `.agents/skills/` contents.\n' +
          '3. Canonical Solution:\n' +
          '   a) If the skill was renamed: update the name to the current canonical identifier.\n' +
          '   b) If the skill was removed: delete the reference from documentation.\n' +
          '   c) If the skill is not installed: add it to `.agents/skills/` adhering to the skills schema.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: `@/non-existent-skill`\n' +
          '   ✅ Correct:   `@/auditor`',
        'markdown-case-mismatch':
          '📖 REMEDIATION GUIDE: markdown-case-mismatch\n' +
          '1. Root Cause: A path in documentation matches a file on disk but differs in casing. While Windows is case-insensitive, Linux/macOS and CI environments will fail.\n' +
          '2. Diagnosis: Compare the referenced path with the exact filename on the filesystem.\n' +
          '3. Canonical Solution: Correct the casing of the path in Markdown to match the disk 100%.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: `src/core/Auditorbase.ts`\n' +
          '   ✅ Correct:   `src/core/auditorBase.ts`',
        'markdown-outdated-project-version':
          '📖 REMEDIATION GUIDE: markdown-outdated-project-version\n' +
          '1. Root Cause: A documentation file or release notes references an outdated package version that does not match `package.json.version`.\n' +
          '2. Diagnosis: Inspect the reported version in the Markdown file and compare with `package.json`.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run `npm run auditor:fix` or `auditor fix` if the rule supports auto-fix.\n' +
          '   b) Or manually update the version number in the document to the current SemVer in `package.json`.\n' +
          '4. Example:\n' +
          '   ❌ Outdated:     `v9.1.0` (when package is at 9.2.0)\n' +
          '   ✅ Synchronized: `v9.2.0`'
      },
      coverage: {
        include: ['**/*.md']
      },
      roots: effectiveScanRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: getEffectiveIgnoreGlobs(effectiveRoot),
      unignoreDirs: getEffectiveUnignoreDirs(effectiveRoot),
      projectRoot: effectiveRoot
    });
    this.rootDir = effectiveRoot;
    this.scanRoots = effectiveScanRoots;
    this.gitIgnoreMatcher = new GitIgnoreMatcher(this.rootDir);
    this.customAbstractPaths = options.knownValidAbstractPaths
      ? new Set(options.knownValidAbstractPaths)
      : undefined;
  }

  private scanMarkdownDocReferences(
    docs: readonly ParsedMarkdownDoc[],
    targetRuleId: 'markdown-broken-source-ref' | 'markdown-case-mismatch',
    knownValidAbstractPaths: ReadonlySet<string>
  ): number {
    let count = 0;
    const sink: ViolationEmitter = {
      addViolation: (v) => {
        if (v.ruleId === targetRuleId) {
          this.addViolation(v);
        }
      }
    };
    const seenViolations = new Set<string>();
    for (const doc of docs) {
      for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i]!;
        const lineNum = i + 1;
        if (!doc.isSkillDoc) {
          count += checkSourcePathReferences(
            line,
            lineNum,
            doc.relPath,
            doc.filePath,
            this.rootDir,
            this.gitIgnoreMatcher,
            knownValidAbstractPaths,
            sink
          );
        }
        if (doc.relPath.endsWith('AGENTS.md')) {
          count += checkAgentsMdBulletDeclaration(
            line,
            lineNum,
            doc.relPath,
            doc.fileDir,
            this.rootDir,
            this.gitIgnoreMatcher,
            seenViolations,
            sink
          );
          count += checkAgentsMdInlineTokens(
            line,
            lineNum,
            doc.relPath,
            doc.fileDir,
            doc.dirEntries,
            this.gitIgnoreMatcher,
            seenViolations,
            sink
          );
        }
      }
    }
    return count;
  }

  public override async runAudit(): Promise<void> {
    const configAbstractPaths = getKnownValidAbstractPaths(this.rootDir);
    const knownValidAbstractPaths = this.customAbstractPaths
      ? new Set([...configAbstractPaths, ...this.customAbstractPaths])
      : configAbstractPaths;
    const allSkills = discoverRegisteredSkills(this.rootDir);

    const mdFiles = this.collectMarkdownFiles();

    if (mdFiles.length === 0) {
      for (const r of MARKDOWN_CODE_REFERENCE_RULES) {
        this.markRuleNotApplicable(r, 'No se encontraron archivos markdown');
      }
      return;
    }

    let referencesChecked = 0;

    const docs: ParsedMarkdownDoc[] = [];
    for (const filePath of mdFiles) {
      this.recordScanned(filePath);
      const relPath = toPosixRelative(this.rootDir, filePath);
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const rawLines = rawContent.split('\n');
      const cleanContent = stripCodeBlocks(rawContent);
      const lines = cleanContent.split('\n');
      const isSkillDoc = relPath.startsWith('.agents/skills/') || relPath.startsWith('skills/');
      const fileDir = path.dirname(filePath);
      let dirEntries: string[] = [];
      if (relPath.endsWith('AGENTS.md')) {
        dirEntries = tryOrDefault(() => fs.readdirSync(fileDir), []);
      }
      docs.push({
        filePath,
        relPath,
        rawContent,
        rawLines,
        lines,
        isSkillDoc,
        fileDir,
        dirEntries
      });
    }

    // 1. markdown-broken-source-ref
    this.runSubAuditorSync('markdown-broken-source-ref', () => {
      referencesChecked += this.scanMarkdownDocReferences(
        docs,
        'markdown-broken-source-ref',
        knownValidAbstractPaths
      );
    });

    // 2. markdown-hardcoded-runtime-version
    this.runSubAuditorSync('markdown-hardcoded-runtime-version', () => {
      for (const doc of docs) {
        for (let i = 0; i < doc.lines.length; i++) {
          referencesChecked += checkHardcodedRuntimeVersions(
            doc.lines[i]!,
            i + 1,
            doc.relPath,
            this
          );
        }
      }
    });

    // 3. markdown-broken-skill-ref
    this.runSubAuditorSync('markdown-broken-skill-ref', () => {
      for (const doc of docs) {
        for (let i = 0; i < doc.lines.length; i++) {
          referencesChecked += checkSkillReferences(
            doc.lines[i]!,
            i + 1,
            doc.relPath,
            allSkills,
            this
          );
        }
      }
    });

    // 4. markdown-case-mismatch
    this.runSubAuditorSync('markdown-case-mismatch', () => {
      this.scanMarkdownDocReferences(docs, 'markdown-case-mismatch', knownValidAbstractPaths);
    });

    // 5. markdown-outdated-project-version
    this.runSubAuditorSync('markdown-outdated-project-version', () => {
      const versionInfo = resolveProjectVersionInfo(this.rootDir);
      if (!versionInfo) {
        this.markRuleNotApplicable(
          'markdown-outdated-project-version',
          'package.json sin campo version'
        );
        return;
      }

      for (const doc of docs) {
        const { matches, updatedContent } = scanAndFixMarkdownProjectVersions(
          doc.relPath,
          doc.rawLines,
          versionInfo
        );
        if (matches.length === 0) {
          continue;
        }
        referencesChecked += matches.length;

        if (this.isFixActive() && updatedContent !== null && updatedContent !== doc.rawContent) {
          fs.writeFileSync(doc.filePath, updatedContent, 'utf-8');
          continue;
        }

        for (const m of matches) {
          this.addViolation({
            ruleId: 'markdown-outdated-project-version',
            severity: 'error',
            file: doc.relPath,
            line: m.lineNum,
            message: `Outdated version reference "${m.found}" in documentation (expected current version: "${m.expected}").`,
            context: m.context,
            fixable: true
          });
        }
      }
    });

    this.context.setMetric('Scanned Markdown Files', mdFiles.length);
    this.context.setMetric('Analyzed Code References', referencesChecked);
  }

  public repairOutdatedVersionReferences(): void {
    const versionInfo = resolveProjectVersionInfo(this.rootDir);
    if (!versionInfo) return;
    const mdFiles = this.collectMarkdownFiles();
    for (const relFile of mdFiles) {
      const fullPath = path.resolve(this.rootDir, relFile);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const lines = raw.split(/\r?\n/);
        const { updatedContent } = scanAndFixMarkdownProjectVersions(relFile, lines, versionInfo);
        if (updatedContent !== null && updatedContent !== raw) {
          fs.writeFileSync(fullPath, updatedContent, 'utf8');
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          process.stderr.write(
            `[validate_markdown_code_references] Error reading ${relFile}: ${String(err)}\n`
          );
        }
      }
    }
  }

  private collectMarkdownFiles(): string[] {
    return this.context.collectFiles(this.scanRoots, new Set(['.md']));
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownCodeReferencesAuditor());
