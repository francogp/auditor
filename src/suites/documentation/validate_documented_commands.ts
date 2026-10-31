/**
 * src/suites/documentation/validate_documented_commands.ts
 *
 * DOCUMENTED COMMANDS AUDITOR (Node.js 26+)
 * Recursively audits ALL repository documentation (.md, AGENTS.md, docs/, .agents/skills/)
 * and guarantees that:
 * 1. Every documented `npm run <script>` strictly exists in `package.json.scripts`.
 * 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
 * 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
 */

import path from 'node:path';

import { getAuditConfig } from '../../core/auditConfig.ts';
import { isAuditableCodebaseFile } from '../../core/auditCoverage.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import {
  loadPackageScriptsAndBins,
  extractCommandsFromLine,
  evaluateGenericCommandViolation,
  type ExtractedCommand,
  type NpmCommandValidationEnv
} from '../../core/npmCommandUtils.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import { safeReadFileSync } from '../../core/safeUtils.ts';

export {
  VALID_NPM_BUILTINS,
  loadPackageScriptsAndBins,
  type ExtractedCommand
} from '../../core/npmCommandUtils.ts';

export type DocumentedCommandsRuleId =
  | 'documented-cmd-unregistered-npm'
  | 'documented-cmd-invalid-npm-syntax'
  | 'documented-cmd-unregistered-npx';

export const DOCUMENTED_COMMANDS_RULES: readonly DocumentedCommandsRuleId[] = [
  'documented-cmd-unregistered-npm',
  'documented-cmd-invalid-npm-syntax',
  'documented-cmd-unregistered-npx'
] as const;

export {
  COMMAND_INVOCATION_TYPES as DOCUMENTED_COMMAND_TYPES,
  type CommandInvocationType as DocumentedCommandType
} from '../../core/npmCommandUtils.ts';

const SHELL_BLOCK_LANGS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'bash',
  'sh',
  'shell',
  'zsh',
  'cmd',
  'powershell',
  'ps1',
  'terminal',
  'console'
]);

function parseBlockCommandLine(
  trimmed: string,
  isShellBlock: boolean,
  lineNum: number,
  commands: ExtractedCommand[]
): void {
  if (isShellBlock && trimmed.startsWith('#')) return;
  const hasShellPrompt = /^[$>]\s+/.test(trimmed);
  if (!isShellBlock && !hasShellPrompt) return;
  const cleanLine = trimmed.replace(/^[$>]\s+/, '');
  if (!cleanLine || cleanLine.startsWith('#')) return;

  const segments = cleanLine.split(/&&|\|\||;/);
  for (const seg of segments) {
    extractCommandsFromLine(seg.trim(), lineNum, commands);
  }
}

function parseInlineCommands(rawLine: string, lineNum: number, commands: ExtractedCommand[]): void {
  const backtickRegex = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(rawLine)) !== null) {
    extractCommandsFromLine(match[1]!.trim(), lineNum, commands);
  }
}

export function extractDocumentedCommands(content: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let isShellBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      isShellBlock = inCodeBlock && SHELL_BLOCK_LANGS.has(trimmed.slice(3).trim().toLowerCase());
      continue;
    }

    if (inCodeBlock) {
      parseBlockCommandLine(trimmed, isShellBlock, lineNum, commands);
    } else {
      parseInlineCommands(rawLine, lineNum, commands);
    }
  }

  return commands;
}

export interface DocumentedCommandViolation {
  readonly ruleId: DocumentedCommandsRuleId;
  readonly severity: 'error';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
}

export function evaluateCommandViolation(
  cmd: ExtractedCommand,
  relPosix: string,
  env: NpmCommandValidationEnv
): DocumentedCommandViolation | null {
  if (cmd.type === 'npx') {
    const isExplicitlyAllowed =
      env.allowedNpx.has(cmd.target) ||
      (cmd.target.startsWith('@') && env.allowedNpx.has(cmd.target.split('/')[1] || ''));
    if (!isExplicitlyAllowed) {
      return {
        ruleId: 'documented-cmd-unregistered-npx',
        severity: 'error',
        file: relPosix,
        line: cmd.lineNum,
        message: `The documented command 'npx ${cmd.target}' is strictly prohibited by architecture mandate. Use 'npm run <script>' or 'vp <tool>' (or declare it explicitly in config.documentation.allowedNpxBinaries).`,
        context: cmd.rawText
      };
    }
  }

  const genericViolation = evaluateGenericCommandViolation(cmd, env);
  if (!genericViolation) return null;

  let ruleId: DocumentedCommandsRuleId;
  let message: string;

  if (genericViolation.kind === 'unregistered-npm') {
    ruleId = 'documented-cmd-unregistered-npm';
    message =
      cmd.type === 'npm-run'
        ? `El comando documentado 'npm run ${cmd.target}' no está registrado en package.json.scripts.`
        : `El comando documentado 'npm test' requiere un script 'test' en package.json.`;
  } else if (genericViolation.kind === 'invalid-npm-syntax') {
    ruleId = 'documented-cmd-invalid-npm-syntax';
    message = genericViolation.message;
  } else {
    ruleId = 'documented-cmd-unregistered-npx';
    message = `El binario documentado 'npx ${cmd.target}' no existe en node_modules/.bin ni está declarado en package.json ni en config.documentation.allowedNpxBinaries.`;
  }

  return {
    ruleId,
    severity: 'error',
    file: relPosix,
    line: cmd.lineNum,
    message,
    context: cmd.rawText
  };
}

export class ValidateDocumentedCommandsAuditor extends BaseAuditor<DocumentedCommandsRuleId> {
  private readonly rootDir: string;
  private readonly gitIgnoreMatcher: GitIgnoreMatcher;

  public constructor(options: { projectRoot?: string } = {}) {
    const root = options.projectRoot || process.cwd();
    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(DOCUMENTED_COMMANDS_RULES, {
        speed: 'light',
        phase: 'normal',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_documented_commands',
      name: 'Documented Commands Validator',
      description: 'Validates documented npm/npx commands in markdown',
      family: 'documentation',
      packageName: 'Commands',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '⌨️',
      ruleIds: DOCUMENTED_COMMANDS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DOCUMENTED_COMMANDS_RULES, 'polish'),
      ruleDescriptions: {
        'documented-cmd-unregistered-npm': 'Unregistered npm run script',
        'documented-cmd-invalid-npm-syntax': 'Invalid direct npm command',
        'documented-cmd-unregistered-npx': 'Unregistered npx binary'
      },
      ruleRemediations: {
        'documented-cmd-unregistered-npm':
          '📖 REMEDIATION GUIDE: documented-cmd-unregistered-npm\n' +
          '1. Root Cause: A Markdown file documents an "npm run <target>" command, but the script does not exist in "package.json.scripts". Documenting non-existent commands confuses developers and AI agents.\n' +
          '2. Diagnosis: Review the reported Markdown file at the indicated line and check against package.json.scripts.\n' +
          '3. Canonical Solution:\n' +
          '   a) If the script should be executable: formally add it to package.json.scripts.\n' +
          '   b) If the script was renamed or migrated: update the Markdown code block to the current canonical script.\n' +
          '   c) If it is a Vite+ tool: document it as "vp <tool>" or via its corresponding npm script alias.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: ```bash\nnpm run test:e2e\n``` (if test:e2e is not in scripts)\n' +
          '   ✅ Correct:   ```bash\nnpm test\n```',
        'documented-cmd-invalid-npm-syntax':
          '📖 REMEDIATION GUIDE: documented-cmd-invalid-npm-syntax\n' +
          '1. Root Cause: Documented a direct "npm <script>" invocation for a script requiring "npm run <script>". npm only accepts direct built-in commands (install, test, run, pack, publish, version, etc.).\n' +
          '2. Diagnosis: Look up the reported line in the Markdown file.\n' +
          '3. Canonical Solution: Add the "run" keyword between "npm" and the script name.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: ```bash\nnpm lint\n```\n' +
          '   ✅ Correct:   ```bash\nnpm run lint\n```',
        'documented-cmd-unregistered-npx':
          '📖 REMEDIATION GUIDE: documented-cmd-unregistered-npx\n' +
          '1. Root Cause: Documented invoking a command via "npx <binary>". Recommending or documenting npx is CATEGORICALLY PROHIBITED in this repository to prevent non-deterministic downloads and permission model bypasses.\n' +
          '2. Diagnosis: Inspect the Markdown file where "npx" appears.\n' +
          '3. Canonical Solution:\n' +
          '   a) If it is an audit tool or internal CLI: use its official script "npm run auditor:<tool>" (e.g., "npm run auditor:motion discover") or direct local binary "auditor-<tool>".\n' +
          '   b) If it is a Vite+ toolchain tool: use "vp <tool>" (e.g., "vp test", "vp check", "vp dev").\n' +
          '   c) If it is a project script: register it in package.json.scripts and document "npm run <script>".\n' +
          '4. Example:\n' +
          '   ❌ Forbidden: ```bash\nnpx auditor-motion discover\n```\n' +
          '   ✅ Canonical: ```bash\nnpm run auditor:motion discover\n```'
      },
      coverage: {
        include: ['**/*.md']
      },
      projectRoot: root
    });
    this.rootDir = root;
    this.gitIgnoreMatcher = new GitIgnoreMatcher(root);
  }

  public override async runAudit(): Promise<void> {
    const { scripts, declaredBins, installedBins } = loadPackageScriptsAndBins(this.rootDir);
    const mdFiles = this.context.collectFiles(['.'], new Set(['.md']));

    if (mdFiles.length === 0) {
      for (const rule of DOCUMENTED_COMMANDS_RULES) {
        this.markRuleNotApplicable(rule, 'No se encontraron archivos markdown para auditar');
      }
      return;
    }

    const config = getAuditConfig(this.rootDir);
    const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
    const allowedNpx = new Set(config.documentation?.allowedNpxBinaries ?? []);
    const env: NpmCommandValidationEnv = { scripts, declaredBins, installedBins, allowedNpx };

    interface ExtractedDocFile {
      relPosix: string;
      commands: ExtractedCommand[];
    }

    const extractedFiles: ExtractedDocFile[] = [];
    for (const absFile of mdFiles) {
      const relPosix = normalizePosixPath(path.relative(this.rootDir, absFile));
      if (
        !isAuditableCodebaseFile(relPosix, customExemptGlobs) ||
        this.gitIgnoreMatcher.isIgnored(absFile)
      ) {
        continue;
      }
      this.recordScanned(relPosix);
      const content = safeReadFileSync(absFile);
      if (!content) continue;
      const commands = extractDocumentedCommands(content);
      extractedFiles.push({ relPosix, commands });
    }

    this.runSubAuditorSync('documented-cmd-unregistered-npm', () => {
      for (const file of extractedFiles) {
        for (const cmd of file.commands) {
          const v = evaluateCommandViolation(cmd, file.relPosix, env);
          if (v && v.ruleId === 'documented-cmd-unregistered-npm') {
            this.addViolation(v);
          }
        }
      }
    });

    this.runSubAuditorSync('documented-cmd-invalid-npm-syntax', () => {
      for (const file of extractedFiles) {
        for (const cmd of file.commands) {
          const v = evaluateCommandViolation(cmd, file.relPosix, env);
          if (v && v.ruleId === 'documented-cmd-invalid-npm-syntax') {
            this.addViolation(v);
          }
        }
      }
    });

    this.runSubAuditorSync('documented-cmd-unregistered-npx', () => {
      for (const file of extractedFiles) {
        for (const cmd of file.commands) {
          const v = evaluateCommandViolation(cmd, file.relPosix, env);
          if (v && v.ruleId === 'documented-cmd-unregistered-npx') {
            this.addViolation(v);
          }
        }
      }
    });
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDocumentedCommandsAuditor());
