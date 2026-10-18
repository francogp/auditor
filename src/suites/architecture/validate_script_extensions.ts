/**
 * src/suites/architecture/validate_script_extensions.ts
 *
 * SCRIPT & MODULE EXTENSIONS VALIDATOR (Node.js 26+ Native)
 *
 * Enforces canonical TypeScript (.ts) extensions across all project scripts, tools, and modules.
 * Detects and prohibits legacy .mjs and .cjs files, as well as unmigrated .js in scripts directories.
 * In --fix mode, automatically migrates files to .ts, renames them on disk, rewrites relative
 * import statements across the codebase, and updates package.json scripts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  type AuditorOptions,
  getEffectiveScannableRoots,
  isPathIgnored,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig, type AuditEngineConfig } from '../../core/auditConfig.ts';
import { getPackageJson, writePackageJson } from '../../core/packageJson.ts';
import { toPosixRelative, normalizePosixPath } from '../../core/safePath.ts';

enableCompileCache();

export const SCRIPT_EXTENSIONS_RULES = [
  'banned-mjs-extension',
  'banned-cjs-extension',
  'banned-raw-js-script'
] as const;

export type ScriptExtensionsRuleId = (typeof SCRIPT_EXTENSIONS_RULES)[number];

const CANONICAL_ROOT_CONFIG_EXEMPTIONS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'postcss.config.js',
  'postcss.config.mjs',
  'postcss.config.cjs',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
  'stylelint.config.js',
  'stylelint.config.mjs',
  'stylelint.config.cjs',
  'vite.config.js',
  'vite.config.mjs',
  'commitlint.config.js',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs'
] as const;

const CANONICAL_ROOT_CONFIG_SET: ReadonlySet<string> = new Set(CANONICAL_ROOT_CONFIG_EXEMPTIONS); // runtime-set: Fast O(1) membership lookup set

export interface ScriptViolationInfo {
  readonly file: string;
  readonly fullPath: string;
  readonly ruleId: ScriptExtensionsRuleId;
  readonly message: string;
  readonly targetTsPath: string;
}

export function isCanonicalConfigExempt(relPath: string): boolean {
  const norm = normalizePosixPath(relPath);
  if (norm.includes('/') && !norm.startsWith('.config/')) {
    return false;
  }
  return CANONICAL_ROOT_CONFIG_SET.has(path.basename(norm));
}

export function isExemptScriptFile(relPath: string, exemptList?: readonly string[]): boolean {
  if (isCanonicalConfigExempt(relPath)) return true;
  if (!exemptList || exemptList.length === 0) return false;
  const targetRel = normalizePosixPath(relPath).toLowerCase();
  const targetBase = path.basename(targetRel);
  for (const ex of exemptList) {
    const norm = normalizePosixPath(ex).toLowerCase();
    if (targetRel === norm || targetRel.endsWith(`/${norm}`) || targetBase === norm) {
      return true;
    }
  }
  return false;
}

export function resolveScriptAndCliDirs(config: AuditEngineConfig): string[] {
  const srcRoots = (config.paths?.srcRoots ?? []).map((r) => normalizePosixPath(r));
  const scriptsRoots = (config.paths?.scriptsRoots ?? []).map((r) => normalizePosixPath(r));
  const cliRoots = (config.paths?.cliRoots ?? []).map((r) => normalizePosixPath(r));
  return Array.from(new Set([...srcRoots, ...scriptsRoots, ...cliRoots])); // no-domain: Non-domain utility collection or data structure
}

export class ValidateScriptExtensionsAuditor extends BaseAuditor<ScriptExtensionsRuleId> {
  constructor(options: Partial<AuditorOptions<ScriptExtensionsRuleId>> = {}) {
    const effectiveProjectRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveProjectRoot);
    const scriptAndCliDirs = resolveScriptAndCliDirs(config);
    const coverageInclude = [
      '**/*.{mjs,cjs}',
      ...scriptAndCliDirs.map((d) => `${d}/**/*.{js,jsx}`)
    ]; // no-domain: Non-domain utility collection or data structure

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        SCRIPT_EXTENSIONS_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [...SCRIPT_EXTENSIONS_RULES]
      ),
      fixableRuleIds: [...SCRIPT_EXTENSIONS_RULES],
      id: 'validate_script_extensions',
      name: 'Script & Module Extensions Validator',
      description: 'Valida extensiones TypeScript (.ts) y prohíbe .mjs/.cjs',
      family: 'architecture',
      ruleIds: SCRIPT_EXTENSIONS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SCRIPT_EXTENSIONS_RULES, 'setup'),
      packageName: 'Extensiones',
      icon: '📜',
      configKey: 'scriptExtensions',
      defaultConfig: {
        enabled: true,
        enforceTypeScript: true,
        allowMjs: false,
        allowCjs: false,
        allowJsScripts: false,
        exemptFiles: []
      },
      criticalConfig: {},
      ruleDescriptions: {
        'banned-mjs-extension': 'Archivo .mjs prohibido en TS',
        'banned-cjs-extension': 'Archivo .cjs prohibido en ESM',
        'banned-raw-js-script': 'Script .js sin tipar en scripts'
      },
      ruleRemediations: {
        'banned-mjs-extension':
          'Causa Raíz:\n' +
          'Se detectó un archivo con extensión ".mjs".\n' +
          'En la arquitectura nativa Node.js 26+ con "type": "module" y soporte directo de TypeScript ("--experimental-strip-types"), todo script y módulo del proyecto debe ser TypeScript canónico (.ts). La extensión .mjs es considerada un remanente transicional innecesario.\n\n' +
          'Diagnóstico:\n' +
          'Identifica el archivo .mjs reportado. Si es un archivo de configuración de una herramienta externa en la raíz (ej. postcss.config.mjs), verifica si está exento o cámbialo a .ts si la herramienta lo soporta.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm run auditor:fix" o "auditor fix". El auditor renombrará automáticamente el archivo a .ts, actualizará las sentencias import relativas en todo el proyecto y reescribirá las referencias en package.json.scripts.\n' +
          '2. Si necesitas eximir un archivo de terceros específico, agrégalo a "config.scriptExtensions.exemptFiles" en .auditor/audit.config.ts.',
        'banned-cjs-extension':
          'Causa Raíz:\n' +
          'Se detectó un archivo con extensión ".cjs".\n' +
          'El proyecto opera bajo el estándar moderno ECMAScript Modules (ESM). Los módulos CommonJS (.cjs) introducen dual-package hazards, impiden el tree-shaking estático y violan la gobernanza del lenguaje.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el archivo .cjs reportado. Con frecuencia utiliza "require()" o "module.exports".\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm run auditor:fix". El auditor convertirá la extensión a .ts.\n' +
          '2. Reemplaza cualquier "require()" o "module.exports" por la sintaxis estándar de ESM ("import" y "export").',
        'banned-raw-js-script':
          'Causa Raíz:\n' +
          'Se detectó un script JavaScript plano sin tipar (".js" o ".jsx") dentro de las carpetas de scripts o herramientas (scripts/, src/cli/, etc.).\n' +
          'Todos los scripts operativos y utilidades deben ser TypeScript (.ts / .tsx) con tipos estrictos para garantizar seguridad y refactorización confiable.\n\n' +
          'Diagnóstico:\n' +
          'Examina el script de desarrollo reportado.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm run auditor:fix" para renombrar automáticamente el script a .ts y actualizar las invocaciones en package.json.\n' +
          '2. Añade las anotaciones de tipo pertinentes en los argumentos y retornos de funciones.'
      },
      coverage: {
        include: coverageInclude
      },
      ...options
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.scriptExtensions?.enabled === false) {
      this.markSkipped('Desactivado en config (scriptExtensions.enabled = false)');
      return;
    }

    const allowMjs = config.scriptExtensions?.allowMjs ?? false;
    const allowCjs = config.scriptExtensions?.allowCjs ?? false;
    const allowJsScripts = config.scriptExtensions?.allowJsScripts ?? false;
    const exemptFiles = config.scriptExtensions?.exemptFiles ?? [];
    const scriptAndCliDirs = resolveScriptAndCliDirs(config);

    const candidateFiles = this.collectCandidateFiles(scriptAndCliDirs);
    const violations: ScriptViolationInfo[] = [];

    for (const fullPath of candidateFiles) {
      const relPath = toPosixRelative(this.projectRoot, fullPath);
      this.recordScanned(relPath);
    }

    this.runSubAuditorSync('banned-mjs-extension', () => {
      if (allowMjs) return;
      for (const fullPath of candidateFiles) {
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.mjs') {
          const relPath = toPosixRelative(this.projectRoot, fullPath);
          if (isExemptScriptFile(relPath, exemptFiles)) continue;
          violations.push({
            file: relPath,
            fullPath,
            ruleId: 'banned-mjs-extension',
            message: `Archivo con extensión ".mjs" detectado: "${relPath}". En proyectos Node.js 26+ nativos, todo módulo o script debe ser TypeScript (.ts).`,
            targetTsPath: fullPath.slice(0, -ext.length) + '.ts'
          });
        }
      }
    });

    this.runSubAuditorSync('banned-cjs-extension', () => {
      if (allowCjs) return;
      for (const fullPath of candidateFiles) {
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.cjs') {
          const relPath = toPosixRelative(this.projectRoot, fullPath);
          if (isExemptScriptFile(relPath, exemptFiles)) continue;
          violations.push({
            file: relPath,
            fullPath,
            ruleId: 'banned-cjs-extension',
            message: `Archivo con extensión ".cjs" detectado: "${relPath}". En proyectos Node.js 26+ ("type": "module"), los módulos CommonJS (.cjs) están prohibidos.`,
            targetTsPath: fullPath.slice(0, -ext.length) + '.ts'
          });
        }
      }
    });

    this.runSubAuditorSync('banned-raw-js-script', () => {
      if (allowJsScripts) return;
      for (const fullPath of candidateFiles) {
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.js' || ext === '.jsx') {
          const relPath = toPosixRelative(this.projectRoot, fullPath);
          if (isExemptScriptFile(relPath, exemptFiles)) continue;
          const isScriptDir = scriptAndCliDirs.some(
            (dir) => relPath === dir || relPath.startsWith(dir + '/')
          );
          if (isScriptDir) {
            const targetExt = ext === '.jsx' ? '.tsx' : '.ts';
            violations.push({
              file: relPath,
              fullPath,
              ruleId: 'banned-raw-js-script',
              message: `Archivo JavaScript sin tipar "${relPath}" detectado. Debe migrarse a TypeScript (${targetExt}).`,
              targetTsPath: fullPath.slice(0, -ext.length) + targetExt
            });
          }
        }
      }
    });

    if (violations.length === 0) {
      return;
    }

    if (!this.isFixActive()) {
      for (const v of violations) {
        this.addViolation({
          ruleId: v.ruleId,
          severity: 'error',
          file: v.file,
          line: 1,
          col: 1,
          message: v.message,
          context: path.basename(v.file),
          fixable: true
        });
      }
      return;
    }

    // Fix Mode: execute safe renaming and references rewrites
    await this.executeFixes(violations);
  }

  private collectCandidateFiles(scriptAndCliDirs: readonly string[]): string[] {
    const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
    const collected = new Set<string>();

    // 1. Collect .mjs and .cjs across all scannable roots
    const moduleExtensions = new Set(['.mjs', '.cjs']);
    const moduleFiles = this.context.collectFiles(scannableRoots, moduleExtensions);
    for (const f of moduleFiles) {
      collected.add(f);
    }

    // 2. Collect raw .js and .jsx strictly within src, scripts, and cli roots
    const existingScriptDirs = scriptAndCliDirs
      .map((d) => path.resolve(this.projectRoot, d))
      .filter((d) => fs.existsSync(d));
    if (existingScriptDirs.length > 0) {
      const jsFiles = this.context.collectFiles(scriptAndCliDirs, new Set(['.js', '.jsx']));
      for (const f of jsFiles) {
        collected.add(f);
      }
    }

    // 3. Also check top-level root directory entries for .mjs and .cjs
    try {
      if (fs.existsSync(this.projectRoot)) {
        const rootEntries = fs.readdirSync(this.projectRoot, { withFileTypes: true });
        for (const entry of rootEntries) {
          if (!entry.isFile()) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (moduleExtensions.has(ext)) {
            const absPath = path.resolve(this.projectRoot, entry.name);
            const relPath = toPosixRelative(this.projectRoot, absPath);
            if (!isPathIgnored(relPath)) {
              collected.add(absPath);
            }
          }
        }
      }
    } catch {
      // catch-ok: Ignore root readdir failures
    }

    return Array.from(collected);
  }

  private async executeFixes(violations: readonly ScriptViolationInfo[]): Promise<void> {
    interface RenamePlan {
      readonly oldFullPath: string;
      readonly newFullPath: string;
      readonly oldRelPath: string;
      readonly newRelPath: string;
      readonly oldBaseName: string;
      readonly newBaseName: string;
    }

    const plans: RenamePlan[] = [];

    // Phase 1: Safety validation (avoid overwriting existing .ts files)
    for (const v of violations) {
      if (fs.existsSync(v.targetTsPath)) {
        const targetRel = toPosixRelative(this.projectRoot, v.targetTsPath);
        this.addViolation({
          ruleId: v.ruleId,
          severity: 'error',
          file: v.file,
          line: 1,
          col: 1,
          message: `No se puede convertir automáticamente "${v.file}": el archivo de destino "${targetRel}" ya existe en disco.`,
          context: path.basename(v.file),
          fixable: false
        });
        continue;
      }

      plans.push({
        oldFullPath: v.fullPath,
        newFullPath: v.targetTsPath,
        oldRelPath: v.file,
        newRelPath: toPosixRelative(this.projectRoot, v.targetTsPath),
        oldBaseName: path.basename(v.fullPath),
        newBaseName: path.basename(v.targetTsPath)
      });
    }

    if (plans.length === 0) return;

    // Phase 2: Perform atomic file renames on disk
    for (const plan of plans) {
      if (fs.existsSync(plan.oldFullPath)) {
        fs.renameSync(plan.oldFullPath, plan.newFullPath);
      }
    }

    // Phase 3: Rewrite internal imports referencing renamed files
    this.rewriteImportReferences(plans);

    // Phase 4: Rewrite package.json scripts referencing renamed files
    this.rewritePackageJsonScripts(plans);
  }

  private rewriteImportReferences(
    plans: readonly { readonly oldBaseName: string; readonly newBaseName: string }[]
  ): void {
    const scannableRoots = getEffectiveScannableRoots(getAuditConfig(this.projectRoot));
    const allCodeFiles = this.context.collectFiles(
      scannableRoots,
      new Set(['.ts', '.tsx', '.vue', '.js', '.jsx', '.mjs', '.cjs'])
    );

    for (const filePath of allCodeFiles) {
      try {
        if (!fs.existsSync(filePath)) continue;
        let content = fs.readFileSync(filePath, 'utf-8');
        let modified = false;

        for (const plan of plans) {
          // Replace relative imports e.g. from './foo.mjs' or from '../dir/foo.mjs'
          // Regex handles single and double quotes, both import and export from statements
          const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const importPattern = new RegExp(`(['"\`][^'"\`]*?\\/)${escapedOld}(['"\`])`, 'g');

          if (importPattern.test(content)) {
            content = content.replace(importPattern, `$1${plan.newBaseName}$2`);
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(filePath, content, 'utf-8');
        }
      } catch {
        // catch-ok: Ignore unreadable or locked files during import rewrite
      }
    }
  }

  private rewritePackageJsonScripts(
    plans: readonly { readonly oldBaseName: string; readonly newBaseName: string }[]
  ): void {
    const pkg = getPackageJson(this.projectRoot, true);
    if (!pkg?.scripts || typeof pkg.scripts !== 'object') return;

    const updatedScripts: Record<string, string> = { ...pkg.scripts };
    let modified = false;
    for (const [scriptName, scriptCmd] of Object.entries(updatedScripts)) {
      let updatedCmd = scriptCmd;
      for (const plan of plans) {
        if (updatedCmd.includes(plan.oldBaseName)) {
          const escapedOld = plan.oldBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`\\b${escapedOld}\\b`, 'g');
          updatedCmd = updatedCmd.replace(pattern, plan.newBaseName);
          modified = true;
        }
      }
      if (updatedCmd !== scriptCmd) {
        updatedScripts[scriptName] = updatedCmd;
      }
    }

    if (modified) {
      writePackageJson(this.projectRoot, {
        ...pkg,
        scripts: updatedScripts
      });
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptExtensionsAuditor());
