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

const DEFAULT_SCAN_DIRECTORIES = [
  '.agents/skills',
  'AGENTS.md',
  'README.md',
  'src',
  'tests',
  'scripts',
  'supabase'
] as const;


/** Known dynamic, placeholder, or ephemeral path patterns that are valid architectural concepts */
const KNOWN_VALID_ABSTRACT_PATHS = new Set([
  'supabase/migrations',
  'supabase/studio',
  'scripts/tests',
  'scripts/.cache/',
  'scripts/setup/plugins/',
  'scripts/setup/plugins/01_deploy_env.sh',
  'scripts/setup/plugins/01_deploy_env.ps1',
  'scripts/auditors/'
]);

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

function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, match => {
    return '\n'.repeat((match.match(/\n/g) || []).length);
  });
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

    if (entries.includes(seg)) {
      current = path.join(current, seg);
      continue;
    }

    const isLast = idx === segments.length - 1;
    let foundEntry: string | undefined;

    foundEntry = entries.find(e => e.toLowerCase() === seg.toLowerCase());

    if (!foundEntry && isLast) {
      const exts = ['.ts', '.vue', '.d.ts', '.json', '.sql', '.scss', '.css', '.md'];
      for (const ext of exts) {
        foundEntry = entries.find(e => e.toLowerCase() === (seg + ext).toLowerCase());
        if (foundEntry) break;
      }
    }

    if (foundEntry) {
      return { exists: true, exactMatch: false, actualCasing: foundEntry };
    }

    if (isLast) {
      const exts = ['.ts', '.vue', '.d.ts', '.json', '.sql', '.scss', '.css', '.md'];
      for (const ext of exts) {
        if (entries.includes(seg + ext)) {
          return { exists: true, exactMatch: true };
        }
      }
    }

    return { exists: false, exactMatch: false };
  }

  return { exists: true, exactMatch: true };
}

export class MarkdownCodeReferencesAuditor extends BaseAuditor<MarkdownCodeReferenceRuleId> {
  private readonly rootDir: string;
  private readonly scanRoots: readonly string[];
  private readonly gitIgnoreMatcher: GitIgnoreMatcher;

  constructor(scanRoots: readonly string[] = DEFAULT_SCAN_DIRECTORIES, rootDir?: string) {
    const effectiveRoot = rootDir || process.cwd();
    super({
      id: 'validate_markdown_code_references',
      name: 'Markdown Code References Validator',
      description: 'Valida rutas, scripts, casing y skills en markdown',
      family: 'documentation',
      ruleIds: MARKDOWN_CODE_REFERENCE_RULES,
      packageName: 'Doc',
      ruleDescriptions: {
        'markdown-broken-source-ref': 'Ruta de código inexistente',
        'markdown-unregistered-npm-script': 'Comando npm no registrado',
        'markdown-hardcoded-runtime-version': 'Versión Node/npm hardcodeada',
        'markdown-broken-skill-ref': 'Referencia a skill inexistente',
        'markdown-case-mismatch': 'Casing incorrecto en ruta'
      },
      roots: scanRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: ['supabase/docker/**', 'supabase/generated/**', 'coverage/**'],
      unignoreDirs: ['.agents'],
      projectRoot: effectiveRoot
    });
    this.rootDir = effectiveRoot;
    this.scanRoots = scanRoots;
    this.gitIgnoreMatcher = new GitIgnoreMatcher(this.rootDir);
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Cargando scripts de package.json y descubriendo archivos Markdown...');

    const pkgPath = path.resolve(this.rootDir, 'package.json');
    let registeredScripts: Set<string>;
    try {
      const pkgContent = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      registeredScripts = new Set(Object.keys(pkgContent.scripts || {}));
    } catch {
      registeredScripts = new Set();
    }

    // Discover skills
    const allSkills = new Set<string>();
    const skillsDir = path.join(this.rootDir, '.agents/skills');
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) allSkills.add(entry.name);
      }
    }

    const mdFiles = this.collectMarkdownFiles();
    this.filesScannedCount = mdFiles.length;

    this.context.logStep(2, 2, `Verificando referencias de código en ${mdFiles.length} archivos Markdown...`);

    let referencesChecked = 0;

    const seenViolations = new Set<string>();

    for (const filePath of mdFiles) {
      const relPath = path.relative(this.rootDir, filePath).replace(/\\/g, '/');
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const cleanContent = stripCodeBlocks(rawContent);
      const lines = cleanContent.split('\n');

      const isSkillDoc = relPath.startsWith('.agents/skills/') || relPath.startsWith('skills/');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        // 1. Check npm run commands (only in project docs; skill manuals document external/consumer workflows)
        if (!isSkillDoc) {
          const npmRegex = /npm run ([a-zA-Z0-9_:-]+)/g;
          let npmMatch: RegExpExecArray | null;
          while ((npmMatch = npmRegex.exec(line)) !== null) {
            const scriptName = npmMatch[1]!.trim();
            referencesChecked++;

            if (scriptName.endsWith(':')) continue;
            if (IGNORED_SCRIPT_WORDS.has(scriptName.toLowerCase())) continue;

            if (!registeredScripts.has(scriptName)) {
              this.addViolation({
                ruleId: 'markdown-unregistered-npm-script',
                severity: 'error',
                file: relPath,
                line: lineNum,
                message: `Comando "npm run ${scriptName}" no está registrado en package.json.scripts`,
                context: `npm run ${scriptName}`
              });
            }
          }
        }

        // 2. Check hardcoded runtime versions (Node >= 26.x, npm >= 12.x)
        const versionRegex = /(?:Node(?:\.js)?\s*(?:>=|>|v)?\s*26\.[0-9]+|npm\s*(?:>=|>|v)?\s*12\.[0-9]+)/i;
        const versionMatch = versionRegex.exec(line);
        if (versionMatch) {
          referencesChecked++;
          this.addViolation({
            ruleId: 'markdown-hardcoded-runtime-version',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Versión runtime hardcodeada detectada: "${versionMatch[0]}". Debe referenciar package.json (engines) y .nvmrc`,
            context: versionMatch[0]
          });
        }

        // 3. Check skill references (@/skill-name)
        const skillRefRegex = /@\/([a-zA-Z0-9_-]+)/g;
        let skillMatch: RegExpExecArray | null;
        while ((skillMatch = skillRefRegex.exec(line)) !== null) {
          const candidate = skillMatch[1]!;
          const fullRef = skillMatch[0];
          const nextChar = line[skillMatch.index + fullRef.length];
          if (nextChar === '/') continue;
          if (KNOWN_PATH_ALIASES.has(candidate)) continue;

          referencesChecked++;
          const isRegistered = allSkills.has(candidate) || BUILTIN_SKILLS.has(candidate);
          if (!isRegistered) {
            this.addViolation({
              ruleId: 'markdown-broken-skill-ref',
              severity: 'error',
              file: relPath,
              line: lineNum,
              message: `Referencia a skill inexistente: "@/${candidate}". El skill no existe en .agents/skills ni en skills integrados`,
              context: `@/${candidate}`
            });
          }
        }

        // 4. Check source path references (src/..., scripts/..., supabase/..., tests/...)
        // (Skill manuals describe abstract example paths for consumer projects, not this repo's internal code)
        if (!isSkillDoc) {
          const pathRegex = /(?:^|[`'"\s[\]()])(src\/[a-zA-Z0-9_./#-]+|scripts\/[a-zA-Z0-9_./#-]+|tests\/[a-zA-Z0-9_./#-]+|supabase\/[a-zA-Z0-9_./#-]+|scratch\/[a-zA-Z0-9_./#-]+)(?:$|[`'"\s[\]().,:;])/g;
          let pathMatch: RegExpExecArray | null;
          while ((pathMatch = pathRegex.exec(line)) !== null) {
            const candidate = pathMatch[1]!.replace(/[.,:;)\]`'"]+$/, '').split('#')[0]!;
            referencesChecked++;

            if (
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
            ) {
              continue;
            }

            if (KNOWN_VALID_ABSTRACT_PATHS.has(candidate)) {
              continue;
            }

            // Check if ignored dynamically by .gitignore (e.g. scratch/, dist/, etc.)
            if (
              this.gitIgnoreMatcher.isIgnored(candidate) ||
              this.gitIgnoreMatcher.isIgnored(path.resolve(this.rootDir, candidate))
            ) {
              continue;
            }

            const caseCheck = checkExactCase(this.rootDir, candidate);
            if (!caseCheck.exists) {
              const localCaseCheck = checkExactCase(path.dirname(filePath), candidate);
              if (!localCaseCheck.exists) {
                this.addViolation({
                  ruleId: 'markdown-broken-source-ref',
                  severity: 'error',
                  file: relPath,
                  line: lineNum,
                  message: `Ruta de código referenciada no existe en disco: "${candidate}"`,
                  context: candidate
                });
              } else if (!localCaseCheck.exactMatch) {
                this.addViolation({
                  ruleId: 'markdown-case-mismatch',
                  severity: 'error',
                  file: relPath,
                  line: lineNum,
                  message: `Ruta de código tiene discrepancia de mayúsculas/minúsculas en disco: "${candidate}" -> "${localCaseCheck.actualCasing}" (Linux ext4)`,
                  context: candidate
                });
              }
            } else if (!caseCheck.exactMatch) {
              this.addViolation({
                ruleId: 'markdown-case-mismatch',
                severity: 'error',
                file: relPath,
                line: lineNum,
                message: `Ruta de código tiene discrepancia de mayúsculas/minúsculas en disco: "${candidate}" -> "${caseCheck.actualCasing}" (Linux ext4)`,
                context: candidate
              });
            }
          }
        }

        // 5. In AGENTS.md, check local file declarations in bullet points: - `foo.ext`:
        if (relPath.endsWith('AGENTS.md')) {
          const fileDir = path.dirname(filePath);
          let dirEntries: string[];
          try {
            dirEntries = fs.readdirSync(fileDir);
          } catch {
            dirEntries = [];
          }

          // 5a. Check bullet point declarations: - `filename.ext`:
          const bulletFileRegex = /^\s*-\s*`([a-zA-Z0-9_.-]+\.(?:ts|vue|json|sql|scss|css))`(?::|\s|-)/;
          const bm = bulletFileRegex.exec(line);
          if (bm) {
            const token = bm[1]!;
            const tokenPath = path.resolve(fileDir, token);
            if (!STANDARD_FILES_TO_SKIP.has(token) && !this.gitIgnoreMatcher.isIgnored(tokenPath)) {
              referencesChecked++;
              const localCheck = checkExactCase(fileDir, token);
              const violationKey = `${relPath}:${lineNum}:${token}`;
              if (!localCheck.exists) {
                if (!seenViolations.has(violationKey)) {
                  seenViolations.add(violationKey);
                  this.addViolation({
                    ruleId: 'markdown-broken-source-ref',
                    severity: 'error',
                    file: relPath,
                    line: lineNum,
                    message: `Archivo declarado en lista de contratos locales no existe en "${path.relative(this.rootDir, fileDir)}": "${token}"`,
                    context: token
                  });
                }
              } else if (!localCheck.exactMatch) {
                if (!seenViolations.has(violationKey)) {
                  seenViolations.add(violationKey);
                  this.addViolation({
                    ruleId: 'markdown-case-mismatch',
                    severity: 'error',
                    file: relPath,
                    line: lineNum,
                    message: `Archivo "${token}" tiene discrepancia de mayúsculas/minúsculas en disco: "${localCheck.actualCasing}" (Linux ext4)`,
                    context: token
                  });
                }
              }
            }
          }

          // 5b. Any inline file mention in AGENTS.md that matches an existing local file with DIFFERENT casing
          const inlineTokenRegex = /`([a-zA-Z0-9_.-]+\.(?:ts|vue|json|sql|scss|css))`(?::|\s|-|\)|$)/g;
          let itm: RegExpExecArray | null;
          while ((itm = inlineTokenRegex.exec(line)) !== null) {
            const token = itm[1]!;
            const tokenPath = path.resolve(fileDir, token);
            if (STANDARD_FILES_TO_SKIP.has(token) || this.gitIgnoreMatcher.isIgnored(tokenPath)) continue;

            const foundCase = dirEntries.find(e => e.toLowerCase() === token.toLowerCase());
            if (foundCase && foundCase !== token) {
              referencesChecked++;
              const violationKey = `${relPath}:${lineNum}:${token}`;
              if (!seenViolations.has(violationKey)) {
                seenViolations.add(violationKey);
                this.addViolation({
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
        }
      }
    }

    this.context.setMetric('Archivos Markdown escaneados', mdFiles.length);
    this.context.setMetric('Referencias de código analizadas', referencesChecked);
  }

  private collectMarkdownFiles(): string[] {
    return this.context.collectFiles(this.scanRoots, new Set(['.md']));
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MarkdownCodeReferencesAuditor());
}
