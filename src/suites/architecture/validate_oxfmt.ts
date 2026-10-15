/**
 * src/suites/architecture/validate_oxfmt.ts
 *
 * OXFMT & VITE+ CODE FORMATTING HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Validates project-wide source code formatting hygiene using Oxfmt via Vite+ (`vp fmt`).
 * In check mode, detects files with formatting deviations.
 * In fix mode (`auditor fix` or `auditor:fix`), automatically formats the files according
 * to the canonical format options configured in `audit.config.ts` and `vite.config.ts`.
 *
 * Usage:
 *   node src/suites/architecture/validate_oxfmt.ts
 *   vp fmt --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeNodeCli, resolvePackageBin } from '../../cli/cliUtils.ts';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { normalizePosixPath } from '../../core/reportUtils.ts';
import { getVitePlusDefaultExcludeGlobs } from '../../core/vitePlusConfigSync.ts';

enableCompileCache();

export const OXFMT_RULES = ['oxfmt-violation'] as const;

export type OxfmtRuleId = (typeof OXFMT_RULES)[number];

function stripAnsiEscapes(text: string): string {
  const esc = String.fromCharCode(27);
  if (!text.includes(esc)) return text;
  return text.replaceAll(new RegExp(`${esc}\\[[0-9;]*[a-zA-Z]`, 'g'), '');
}

const MAX_BUFFER_BYTES = 52428800 as const;
const EXECUTION_TIMEOUT_MS = 0 as const;

export interface OxfmtAuditOptions {
  projectRoot?: string;
  fix?: boolean;
}

export class OxfmtAuditor extends BaseAuditor<OxfmtRuleId> {
  constructor(targetOrOptions?: string | OxfmtAuditOptions) {
    const opts =
      typeof targetOrOptions === 'string'
        ? { projectRoot: targetOrOptions }
        : (targetOrOptions ?? {});
    const effectiveRoot = opts.projectRoot || process.cwd();
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'Vite+ Oxfmt',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'oxfmt-violation'
      },
      ruleCapabilities: createRuleCapabilities(
        OXFMT_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        },
        ['oxfmt-violation']
      ),
      fixableRuleIds: ['oxfmt-violation'],
      fix: opts.fix,
      id: 'validate_oxfmt',
      name: 'Vite+ Oxfmt Code Formatting Validator',
      description: 'Valida el formato de código con Oxfmt de Vite+',
      family: 'architecture',
      packageName: 'Oxfmt',
      configKey: 'oxfmt.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '✨',
      ruleIds: OXFMT_RULES,
      ruleDescriptions: {
        'oxfmt-violation': 'Desviación de formato de código'
      },
      ruleRemediations: {
        'oxfmt-violation':
          'Guía de diagnóstico y remediación para oxfmt-violation. El archivo presenta diferencias respecto a las reglas de formateo de Oxfmt. Ejecuta "npm run fmt" o "vp fmt" (o "npm run auditor:fix") para reformatear automáticamente el código con las reglas canónicas de vite.config.ts / audit.config.ts.'
      },
      coverage: {
        include: ['**/*.{js,ts,mjs,cjs,vue,json,md,css,scss}'],
        exclude: getVitePlusDefaultExcludeGlobs(effectiveRoot),
        source: 'declared-only'
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const excludeGlobs = getVitePlusDefaultExcludeGlobs(this.projectRoot);
    this.redeclareCoverage({
      include: ['**/*.{js,ts,mjs,cjs,vue,json,md,css,scss}'],
      exclude: excludeGlobs,
      source: 'declared-only'
    });

    const isFixMode = this.isFixModeRequested();

    const vpBin =
      resolvePackageBin('vite-plus', {
        projectRoot: this.projectRoot,
        fallbackRelativeBin: 'bin/vp'
      }) ?? path.resolve(this.projectRoot, 'node_modules/vite-plus/bin/vp');

    if (isFixMode) {
      executeNodeCli(vpBin, ['fmt'], {
        cwd: this.projectRoot,
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: EXECUTION_TIMEOUT_MS
      });
    }

    const checkOutput = executeNodeCli(vpBin, ['fmt', '--list-different'], {
      cwd: this.projectRoot,
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: EXECUTION_TIMEOUT_MS
    });

    this.recordExternalScanCount(1);

    const rawLines = checkOutput.split(/\r?\n/);
    let violationsCount = 0;
    await this.runSubAuditor('oxfmt-violation', async () => {
      for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line) continue;
        const plainLine = stripAnsiEscapes(line).trim();
        if (
          !plainLine ||
          plainLine.startsWith('(node:') ||
          plainLine.startsWith('[WARN]') ||
          plainLine.startsWith('ExperimentalWarning') ||
          plainLine.includes('permission') ||
          plainLine.startsWith('error:') ||
          plainLine.startsWith('warn:') ||
          plainLine.includes('Package not found') ||
          plainLine.includes('Finished in')
        ) {
          continue;
        }

        let fullCandidate = path.isAbsolute(plainLine)
          ? plainLine
          : path.resolve(this.projectRoot, plainLine);
        if (!fs.existsSync(fullCandidate)) {
          const fromCwd = path.resolve(process.cwd(), plainLine);
          if (fs.existsSync(fromCwd)) {
            fullCandidate = fromCwd;
          }
        }

        let exists = false;
        try {
          exists = fs.existsSync(fullCandidate) && fs.statSync(fullCandidate).isFile();
        } catch {
          exists = false;
        }
        if (!exists) continue;

        const cleanFile = normalizePosixPath(fullCandidate, this.projectRoot);
        violationsCount++;
        this.addViolation({
          ruleId: 'oxfmt-violation',
          severity: 'error',
          file: cleanFile,
          line: 1,
          col: 1,
          context: 'oxfmt',
          message: `El archivo ${cleanFile} no cumple con el formato canónico de Oxfmt. Ejecuta 'npm run fmt' o 'auditor fix'.`,
          fixable: true
        });
      }
    });

    this.context.setMetric('oxfmt_violations', violationsCount);
    this.context.setMetric('mode', isFixMode ? 'fix' : 'check');
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new OxfmtAuditor());
