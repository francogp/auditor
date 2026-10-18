/**
 * src/suites/architecture/validate_script_commands.ts
 *
 * SCRIPT & PIPELINE COMMANDS VALIDATOR (Node.js 26+)
 *
 * Recursively audits executable scripts and infrastructure pipelines (.sh, .ps1, .bat, .cmd,
 * Dockerfiles, .github/workflows/, and maintenance scripts) and guarantees that:
 * 1. Every invoked `npm run <script>` strictly exists in `package.json.scripts`.
 * 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
 * 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
 *
 * Enforces loud, immediate failures (severity: 'error', fix: 'none') to prevent runtime
 * deployment crashes caused by missing or unmigrated npm scripts.
 */

import fsSync from 'node:fs';
import path from 'node:path';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import {
  loadPackageScriptsAndBins,
  evaluateGenericCommandViolation,
  type ExtractedCommand,
  type NpmCommandValidationEnv
} from '../../core/npmCommandUtils.ts';
import { extractScriptCommands } from '../../core/scriptCommandExtractors.ts';

export type ScriptCommandsRuleId =
  | 'script-cmd-unregistered-npm'
  | 'script-cmd-invalid-npm-syntax'
  | 'script-cmd-unregistered-npx';

export const SCRIPT_COMMANDS_RULES: readonly ScriptCommandsRuleId[] = [
  'script-cmd-unregistered-npm',
  'script-cmd-invalid-npm-syntax',
  'script-cmd-unregistered-npx'
] as const;

export interface ScriptCommandViolation {
  readonly ruleId: ScriptCommandsRuleId;
  readonly severity: 'error';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
}

const SHELL_AND_BATCH_EXTENSIONS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd'
]);

const SCRIPTS_DIR_EXTENSIONS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.ts',
  '.js',
  '.mjs',
  '.cjs'
]);

interface ScannedScriptFile {
  readonly relPosix: string;
  readonly commands: readonly ExtractedCommand[];
}

function isCandidateScriptPath(file: string, rootDir: string): boolean {
  const relPosix = path.relative(rootDir, file).split(path.sep).join(path.posix.sep);
  const ext = path.extname(file).toLowerCase();

  if (SHELL_AND_BATCH_EXTENSIONS.has(ext)) {
    return !relPosix.startsWith('src/') && !relPosix.startsWith('tests/');
  }

  return relPosix.startsWith('scripts/') || relPosix.includes('/scripts/');
}

function isDockerfile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower === 'dockerfile' ||
    lower.startsWith('dockerfile.') ||
    lower === 'containerfile' ||
    fileName.endsWith('.dockerfile')
  );
}

const CANDIDATE_DOCKER_DIRS = ['.', 'deploy', 'infra'] as const;

function collectDockerfiles(rootDir: string): string[] {
  const dockerfiles: string[] = [];
  for (const d of CANDIDATE_DOCKER_DIRS) {
    const absDir = path.resolve(rootDir, d);
    if (!fsSync.existsSync(absDir)) continue;
    try {
      const entries = fsSync.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && isDockerfile(entry.name)) {
          dockerfiles.push(path.resolve(absDir, entry.name));
        }
      }
    } catch {
      // catch-ok: Unreadable directory
    }
  }
  return dockerfiles;
}

function collectWorkflowFiles(rootDir: string): string[] {
  const workflowFiles: string[] = [];
  const workflowsDir = path.resolve(rootDir, '.github', 'workflows');
  if (!fsSync.existsSync(workflowsDir)) return workflowFiles;
  try {
    const entries = fsSync.readdirSync(workflowsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))) {
        workflowFiles.push(path.resolve(workflowsDir, entry.name));
      }
    }
  } catch {
    // catch-ok: Unreadable directory
  }
  return workflowFiles;
}

export class ValidateScriptCommandsAuditor extends BaseAuditor<ScriptCommandsRuleId> {
  private readonly rootDir: string;
  private readonly gitIgnoreMatcher: GitIgnoreMatcher;

  constructor(options: { projectRoot?: string } = {}) {
    const root = options.projectRoot || process.cwd();
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(SCRIPT_COMMANDS_RULES, {
        speed: 'light',
        phase: 'setup',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_script_commands',
      name: 'Script & Pipeline Commands Validator',
      description: 'Valida comandos npm y npx en scripts y CI/CD',
      family: 'architecture',
      packageName: 'ScriptCommands',
      configKey: 'paths',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🐚',
      ruleIds: SCRIPT_COMMANDS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SCRIPT_COMMANDS_RULES, 'setup'),
      ruleDescriptions: {
        'script-cmd-unregistered-npm': 'Script npm run no registrado',
        'script-cmd-invalid-npm-syntax': 'Comando npm directo no válido',
        'script-cmd-unregistered-npx': 'Binario npx no registrado'
      },
      ruleRemediations: {
        'script-cmd-unregistered-npm':
          'Causa Raíz:\n' +
          'Un script ejecutable (.sh, .ps1, Dockerfile o pipeline de CI/CD en .github/workflows/) intenta ejecutar "npm run <script>", pero "<script>" no está registrado en el bloque "scripts" de package.json.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el archivo y línea donde se ejecuta el comando. Comprueba si el script fue renombrado (ej. "build:prod" migrado a "build:deploy") o si se omitió definirlo en package.json.\n\n' +
          'Solución Canónica:\n' +
          '1. Si el script fue renombrado, actualiza la invocación en el script ejecutable para apuntar al nombre canónico registrado.\n' +
          '2. Si el script es válido y requerido, agrégalo a "scripts" en package.json.\n' +
          '3. Si fue un error tipográfico, corrige el nombre en el archivo ejecutable.',
        'script-cmd-invalid-npm-syntax':
          'Causa Raíz:\n' +
          'Se invocó directamente "npm <nombre>" en un script cuando "<nombre>" no es un comando nativo del CLI de npm (como "test", "install", "ci") y se omitió la palabra clave "run".\n' +
          'En npm, los scripts personalizados definidos por el usuario en package.json requieren obligatoriamente el subcomando "run" (ej. "npm run build").\n\n' +
          'Diagnóstico:\n' +
          'Busca la línea del script que ejecuta "npm <nombre>".\n\n' +
          'Solución Canónica:\n' +
          'Reemplaza "npm <nombre>" por "npm run <nombre>" (o "vp run <nombre>").',
        'script-cmd-unregistered-npx':
          'Causa Raíz:\n' +
          'Un script ejecutable o pipeline invoca "npx <binario>", pero el binario no está instalado en node_modules/.bin ni declarado como dependencia en package.json.\n' +
          'Por mandato de arquitectura y seguridad de la cadena de suministro, invocar npx para descargar binarios al vuelo en scripts está estrictamente prohibido sin declarar la dependencia explícita.\n\n' +
          'Diagnóstico:\n' +
          'Examina el binario invocado tras "npx".\n\n' +
          'Solución Canónica:\n' +
          '1. Instalar la herramienta en devDependencies mediante "npm install -D <paquete>" e invocarla mediante su script en package.json.\n' +
          '2. Si se trata de una utilidad provista globalmente por la imagen o el entorno anfitrión, regístrala en "config.scriptCommands.allowedNpxBinaries" en .auditor/audit.config.ts tras aprobación.'
      },
      coverage: {
        include: [
          '**/*.sh',
          '**/*.bash',
          '**/*.zsh',
          '**/*.ps1',
          '**/*.bat',
          '**/*.cmd',
          '**/Dockerfile*',
          '**/*.dockerfile',
          '**/Containerfile',
          '.github/workflows/**/*.{yml,yaml}',
          'scripts/**/*.{ts,js}'
        ]
      },
      projectRoot: root
    });
    this.rootDir = root;
    this.gitIgnoreMatcher = new GitIgnoreMatcher(root);
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.rootDir);
    if (config.scriptCommands?.enabled === false) {
      this.markSkipped('Desactivado en config (scriptCommands.enabled = false)');
      return;
    }

    const { scripts, declaredBins, installedBins } = loadPackageScriptsAndBins(this.rootDir);
    const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
    const scriptExemptGlobs = config.scriptCommands?.exemptGlobs ?? [];
    const allowedNpx = new Set([
      ...(config.documentation?.allowedNpxBinaries ?? []),
      ...(config.scriptCommands?.allowedNpxBinaries ?? [])
    ]);
    const env: NpmCommandValidationEnv = { scripts, declaredBins, installedBins, allowedNpx };

    const candidateFiles = this.collectScriptFiles();
    if (candidateFiles.length === 0) {
      for (const rule of SCRIPT_COMMANDS_RULES) {
        this.markRuleNotApplicable(rule, 'No se encontraron scripts ejecutables para auditar');
      }
      return;
    }

    const scannedFiles = this.readScannedFiles(
      candidateFiles,
      customExemptGlobs,
      scriptExemptGlobs
    );

    this.reportViolations('script-cmd-unregistered-npm', 'unregistered-npm', scannedFiles, env);
    this.reportViolations('script-cmd-invalid-npm-syntax', 'invalid-npm-syntax', scannedFiles, env);
    this.reportViolations('script-cmd-unregistered-npx', 'unregistered-npx', scannedFiles, env);
  }

  private readScannedFiles(
    candidateFiles: readonly string[],
    customExemptGlobs: readonly string[],
    scriptExemptGlobs: readonly string[]
  ): ScannedScriptFile[] {
    const scannedFiles: ScannedScriptFile[] = [];

    for (const absFile of candidateFiles) {
      const relPosix = path.relative(this.rootDir, absFile).split(path.sep).join(path.posix.sep);

      if (this.gitIgnoreMatcher.isIgnored(absFile)) continue;
      if (this.isExempt(relPosix, customExemptGlobs, scriptExemptGlobs)) continue;

      this.recordScanned(relPosix);
      let content: string;
      try {
        content = fsSync.readFileSync(absFile, 'utf8');
      } catch {
        // catch-ok: Unreadable file
        continue;
      }

      const commands = extractScriptCommands(content, relPosix);
      if (commands.length > 0) {
        scannedFiles.push({ relPosix, commands });
      }
    }

    return scannedFiles;
  }

  private reportViolations(
    ruleId: ScriptCommandsRuleId,
    targetKind: 'unregistered-npm' | 'invalid-npm-syntax' | 'unregistered-npx',
    scannedFiles: readonly ScannedScriptFile[],
    env: NpmCommandValidationEnv
  ): void {
    this.runSubAuditorSync(ruleId, () => {
      for (const file of scannedFiles) {
        for (const cmd of file.commands) {
          const v = evaluateGenericCommandViolation(cmd, env);
          if (!v || v.kind !== targetKind) continue;

          const message =
            targetKind === 'unregistered-npm'
              ? cmd.type === 'npm-run'
                ? `El script '${file.relPosix}' (línea ${v.line}) ejecuta 'npm run ${cmd.target}', pero el script no está registrado en package.json.scripts.`
                : `El script '${file.relPosix}' (línea ${v.line}) ejecuta 'npm test', pero no hay un script 'test' registrado en package.json.scripts.`
              : `El script '${file.relPosix}' (línea ${v.line}): ${v.message}`;

          this.addViolation({
            ruleId,
            severity: 'error',
            file: file.relPosix,
            line: v.line,
            message,
            context: v.context
          });
        }
      }
    });
  }

  private isExempt(
    relPosix: string,
    customExempt: readonly string[],
    scriptExempt: readonly string[]
  ): boolean {
    const allExempt = [...customExempt, ...scriptExempt];
    for (const glob of allExempt) {
      if (path.posix.matchesGlob(relPosix, glob)) return true;
    }
    return relPosix.includes('fixtures/') || relPosix.startsWith('tests/fixtures/');
  }

  private collectScriptFiles(): string[] {
    const collected = new Set<string>();

    const scannableFiles = this.context.collectFiles(['.'], SCRIPTS_DIR_EXTENSIONS);
    for (const file of scannableFiles) {
      if (isCandidateScriptPath(file, this.rootDir)) {
        collected.add(file);
      }
    }

    for (const file of collectDockerfiles(this.rootDir)) {
      collected.add(file);
    }

    for (const file of collectWorkflowFiles(this.rootDir)) {
      collected.add(file);
    }

    return Array.from(collected);
  }
}

export { ValidateScriptCommandsAuditor as ScriptCommandsAuditor };

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptCommandsAuditor());
