/**
 * src/suites/architecture/validate_playwright_config.ts
 *
 * PLAYWRIGHT E2E CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces standardized end-to-end testing configurations across Playwright suites:
 *   1. Conditionally active only when @playwright/test is declared in package.json or an e2e directory exists.
 *   2. Guarantees playwright.config.ts exists on disk; auto-scaffolds in --fix mode.
 *   3. Enforces standard baseline directives:
 *      - timeout (bounded execution time)
 *      - reporter (structured output)
 *      - trace / screenshot on failure
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

import { getPackageJson } from '../../core/packageJson.ts';

enableCompileCache();

export const PLAYWRIGHT_CONFIG_RULES = [
  'playwright-config-missing',
  'playwright-config-missing-setting'
] as const;

export type PlaywrightConfigRuleId = (typeof PLAYWRIGHT_CONFIG_RULES)[number];

export const CANONICAL_PLAYWRIGHT_CONFIG_LINES = [
  "import { defineConfig, devices } from '@playwright/test';",
  '',
  'export default defineConfig({',
  "  testDir: './e2e',",
  '  timeout: 30000,',
  '  expect: {',
  '    timeout: 5000',
  '  },',
  '  fullyParallel: true,',
  '  forbidOnly: !!process.env.CI,',
  '  retries: process.env.CI ? 2 : 0,',
  '  workers: process.env.CI ? 1 : undefined,',
  "  reporter: [['html', { open: 'never' }], ['list']],",
  '  use: {',
  "    trace: 'on-first-retry',",
  "    screenshot: 'only-on-failure'",
  '  }',
  '});',
  ''
] as const;

export const CANONICAL_PLAYWRIGHT_CONFIG_CONTENT = CANONICAL_PLAYWRIGHT_CONFIG_LINES.join('\n');

export function isPlaywrightProjectContext(projectRoot: string): boolean {
  try {
    const pkg = getPackageJson(projectRoot);
    if (
      pkg &&
      (pkg.dependencies?.['@playwright/test'] ||
        pkg.devDependencies?.['@playwright/test'] ||
        pkg.dependencies?.['playwright'] ||
        pkg.devDependencies?.['playwright'])
    ) {
      return true;
    }
  } catch {
    // catch-ok
  }

  return fs.existsSync(path.join(projectRoot, 'e2e'));
}

export const PLAYWRIGHT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<PlaywrightConfigRuleId> = {
  id: 'playwright-config',
  file: 'playwright.config.ts',
  candidateFiles: ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'],
  description: 'Configuración estándar de pruebas E2E (playwright.config.ts)',
  ruleId: 'playwright-config-missing',
  isApplicable: (_config, projectRoot) => isPlaywrightProjectContext(projectRoot),
  generateDefaultContent: () => CANONICAL_PLAYWRIGHT_CONFIG_CONTENT
};

export class ValidatePlaywrightConfigAuditor extends BaseAuditor<PlaywrightConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<PlaywrightConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<PlaywrightConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<PlaywrightConfigRuleId> = {
      ...PLAYWRIGHT_CONFIG_REQUIREMENT,
      ...(optionsObj?.configFile
        ? {
            file: optionsObj.configFile,
            candidateFiles: [optionsObj.configFile]
          }
        : {})
    };

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createUniformRuleCapabilities(PLAYWRIGHT_CONFIG_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'priority',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'playwright-config-missing',
        'playwright-config-missing-setting'
      ],
      configFiles: [configRequirement],
      id: 'validate_playwright_config',
      name: 'Playwright Configuration Validator',
      description: 'Valida configuración de Playwright para suites E2E',
      icon: '🎭',
      family: 'architecture',
      ruleIds: PLAYWRIGHT_CONFIG_RULES,
      packageName: 'Playwright',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'playwright-config-missing': 'Archivo playwright.config.ts ausente',
        'playwright-config-missing-setting': 'Falta directiva en playwright'
      },
      ruleRemediations: {
        'playwright-config-missing':
          'Diagnóstico: El proyecto usa Playwright o tiene suites E2E pero falta playwright.config.ts.\n' +
          'Remediación: Ejecuta `auditor fix` para auto-scaffoldear la configuración canónica.',
        'playwright-config-missing-setting':
          'Diagnóstico: Faltan directivas obligatorias de tiempo de espera o reporte en playwright.config.ts.\n' +
          'Remediación: Configura `timeout`, `reporter` y `use.trace` en playwright.config.ts o corre `auditor fix`.'
      },
      coverage: {
        include: ['playwright.config.*']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    if (!isPlaywrightProjectContext(this.projectRoot)) {
      this.markSkipped('No se detectó Playwright ni directorio e2e en el proyecto');
      return;
    }

    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('playwright-config-missing', () => {
      configFile = this.resolveConfigFile(PLAYWRIGHT_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('playwright-config-missing', () =>
        this.ensureConfigFile(PLAYWRIGHT_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('playwright-config-missing-setting', 'Archivo playwright.config.ts ausente');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath =
      path.relative(this.projectRoot, resolvedPath) || PLAYWRIGHT_CONFIG_REQUIREMENT.file;
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.runSubAuditorSync('playwright-config-missing', () => {
        this.addViolation({
          ruleId: 'playwright-config-missing',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `No se pudo leer ${relPath}.`
        });
      });
      return;
    }

    let modified = false;
    let updatedContent = rawContent;

    this.runSubAuditorSync('playwright-config-missing-setting', () => {
      // Check timeout
      if (!/\btimeout\s*:/i.test(updatedContent)) {
        if (isFix) {
          updatedContent = updatedContent.replace(
            /(defineConfig\s*\(\s*\{)/i,
            '$1\n  timeout: 30000,'
          );
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'playwright-config-missing-setting',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'Se requiere configurar "timeout" para evitar bloqueos indefinidos en tests E2E.'
          });
        }
      }

      // Check reporter
      if (!/\breporter\s*:/i.test(updatedContent)) {
        if (isFix) {
          updatedContent = updatedContent.replace(
            /(defineConfig\s*\(\s*\{)/i,
            "$1\n  reporter: [['html', { open: 'never' }], ['list']],"
          );
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'playwright-config-missing-setting',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'Se requiere configurar "reporter" en playwright.config.ts.'
          });
        }
      }

      // Check trace in use
      if (!/\btrace\s*:/i.test(updatedContent)) {
        if (isFix) {
          if (/\buse\s*:\s*\{/i.test(updatedContent)) {
            updatedContent = updatedContent.replace(
              /(use\s*:\s*\{)/i,
              "$1\n    trace: 'on-first-retry',"
            );
          } else {
            updatedContent = updatedContent.replace(
              /(defineConfig\s*\(\s*\{)/i,
              "$1\n  use: { trace: 'on-first-retry' },"
            );
          }
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'playwright-config-missing-setting',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'Se requiere configurar "use.trace" para diagnósticos de fallos en E2E.'
          });
        }
      }
    });

    if (isFix && modified) {
      fs.writeFileSync(resolvedPath, updatedContent, 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePlaywrightConfigAuditor());
