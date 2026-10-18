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

import fsSync from 'node:fs';
import path from 'node:path';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { isAuditableCodebaseFile } from '../../core/auditCoverage.ts';
import {
  loadPackageScriptsAndBins,
  extractCommandsFromLine,
  evaluateGenericCommandViolation,
  type ExtractedCommand,
  type NpmCommandValidationEnv
} from '../../core/npmCommandUtils.ts';

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
        message: `El comando documentado 'npx ${cmd.target}' está estrictamente prohibido por mandato arquitectónico. Utiliza 'npm run <script>' o 'vp <tool>' (o decláralo explícitamente en config.documentation.allowedNpxBinaries).`,
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

  constructor(options: { projectRoot?: string } = {}) {
    const root = options.projectRoot || process.cwd();
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(DOCUMENTED_COMMANDS_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_documented_commands',
      name: 'Documented Commands Validator',
      description: 'Valida comandos npm/npx documentados en markdown',
      family: 'documentation',
      packageName: 'Comandos',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '⌨️',
      ruleIds: DOCUMENTED_COMMANDS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DOCUMENTED_COMMANDS_RULES, 'polish'),
      ruleDescriptions: {
        'documented-cmd-unregistered-npm': 'Script npm run no registrado',
        'documented-cmd-invalid-npm-syntax': 'Comando npm directo no válido',
        'documented-cmd-unregistered-npx': 'Binario npx no registrado'
      },
      ruleRemediations: {
        'documented-cmd-unregistered-npm':
          '📖 GUÍA DE REMEDIACIÓN: documented-cmd-unregistered-npm\n' +
          '1. Causa Raíz: Un archivo Markdown documenta un comando "npm run <target>", pero el script no existe en "package.json.scripts". Documentar comandos inexistentes confunde a desarrolladores y a agentes de IA.\n' +
          '2. Diagnóstico: Revisa el archivo Markdown reportado en la línea indicada y contrástalo contra package.json.scripts.\n' +
          '3. Solución:\n' +
          '   a) Si el script debe ser ejecutable: agrégalo formalmente en package.json.scripts.\n' +
          '   b) Si el script fue renombrado o migrado: actualiza el bloque de código en Markdown al script canónico vigente.\n' +
          '   c) Si es una herramienta de Vite+: documéntalo como "vp <herramienta>" o mediante su alias npm correspondiente.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: ```bash\\nnpm run test:e2e\\n``` (si test:e2e no está en scripts)\n' +
          '   ✅ Correcto:   ```bash\\nnpm test\\n```',
        'documented-cmd-invalid-npm-syntax':
          '📖 GUÍA DE REMEDIACIÓN: documented-cmd-invalid-npm-syntax\n' +
          '1. Causa Raíz: Se documentó una invocación directa "npm <script>" para un script que requiere "npm run <script>". npm solo admite comandos integrados directos (install, test, run, pack, publish, version, etc.).\n' +
          '2. Diagnóstico: Busca la línea indicada en el archivo Markdown.\n' +
          '3. Solución: Agrega la palabra clave "run" entre "npm" y el nombre del script.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: ```bash\\nnpm lint\\n```\n' +
          '   ✅ Correcto:   ```bash\\nnpm run lint\\n```',
        'documented-cmd-unregistered-npx':
          '📖 GUÍA DE REMEDIACIÓN: documented-cmd-unregistered-npx\n' +
          '1. Causa Raíz: Se documentó la invocación de un comando mediante "npx <binario>". Recomendar o documentar npx está CATEGÓRICAMENTE PROHIBIDO en este repositorio para evitar descargas no deterministas y bypasses del modelo de permisos.\n' +
          '2. Diagnóstico: Inspecciona el archivo Markdown donde aparece "npx".\n' +
          '3. Solución:\n' +
          '   a) Si es una herramienta de auditoría o CLI interna: utiliza su script oficial "npm run auditor:<herramienta>" (ej: "npm run auditor:motion discover") o el ejecutable directo local "auditor-<herramienta>".\n' +
          '   b) Si es una herramienta del toolchain Vite+: utiliza "vp <herramienta>" (ej: "vp test", "vp check", "vp dev").\n' +
          '   c) Si es un script del proyecto: regístralo en package.json.scripts y documenta "npm run <script>".\n' +
          '4. Ejemplo:\n' +
          '   ❌ Prohibido: ```bash\\nnpx auditor-motion discover\\n```\n' +
          '   ✅ Canónico:  ```bash\\nnpm run auditor:motion discover\\n```'
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
      const relPosix = path.relative(this.rootDir, absFile).split(path.sep).join(path.posix.sep);
      if (
        !isAuditableCodebaseFile(relPosix, customExemptGlobs) ||
        this.gitIgnoreMatcher.isIgnored(absFile)
      ) {
        continue;
      }
      this.recordScanned(relPosix);
      let content: string;
      try {
        content = fsSync.readFileSync(absFile, 'utf8');
      } catch {
        continue;
      }
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
