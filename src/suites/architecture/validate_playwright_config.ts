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
import ts from 'typescript';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

import { getPackageJson } from '../../core/packageJson.ts';
import {
  findConfigRootObject,
  findPropertyAssignment,
  getPropertyKeyName,
  parseTsSourceFile,
  printTransformedSourceFile,
  valueToAstExpression
} from '../../core/viteConfigAst.ts';

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

  return (
    fs.existsSync(path.join(projectRoot, 'e2e')) ||
    fs.existsSync(path.join(projectRoot, 'tests/e2e'))
  );
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
        phase: 'setup',
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
    this.recordScanned(relPath);
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

    const sf = parseTsSourceFile(rawContent, relPath);
    const rootObj = findConfigRootObject(sf);
    let modified = false;
    let rootProps: ts.ObjectLiteralElementLike[] = rootObj ? [...rootObj.properties] : [];
    let replaceNpxVite = false;

    const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 30000;
    const currentRoot = () => ts.factory.createObjectLiteralExpression(rootProps, true);

    this.runSubAuditorSync('playwright-config-missing-setting', () => {
      // 1. Check timeout
      const hasTimeout = rootObj
        ? Boolean(findPropertyAssignment(currentRoot(), 'timeout', sf))
        : false;
      if (!hasTimeout) {
        if (isFix && rootObj) {
          rootProps.push(
            ts.factory.createPropertyAssignment('timeout', valueToAstExpression(DEFAULT_PLAYWRIGHT_TIMEOUT_MS))
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

      // 2. Check reporter
      const hasReporter = rootObj
        ? Boolean(findPropertyAssignment(currentRoot(), 'reporter', sf))
        : false;
      if (!hasReporter) {
        if (isFix && rootObj) {
          rootProps.push(
            ts.factory.createPropertyAssignment(
              'reporter',
              valueToAstExpression([['html', { open: 'never' }], ['list']])
            )
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

      // 3. Check trace in use
      const useProp = rootObj ? findPropertyAssignment(currentRoot(), 'use', sf) : null;
      const hasTrace =
        useProp && ts.isObjectLiteralExpression(useProp.initializer)
          ? Boolean(findPropertyAssignment(useProp.initializer, 'trace', sf))
          : false;
      if (!hasTrace) {
        if (isFix && rootObj) {
          if (useProp && ts.isObjectLiteralExpression(useProp.initializer)) {
            const nextUseProps = [
              ...useProp.initializer.properties,
              ts.factory.createPropertyAssignment('trace', valueToAstExpression('on-first-retry'))
            ];
            rootProps = rootProps.map((p) =>
              ts.isPropertyAssignment(p) && getPropertyKeyName(p.name, sf) === 'use'
                ? ts.factory.createPropertyAssignment(
                    'use',
                    ts.factory.createObjectLiteralExpression(nextUseProps, true)
                  )
                : p
            );
          } else {
            rootProps.push(
              ts.factory.createPropertyAssignment(
                'use',
                valueToAstExpression({ trace: 'on-first-retry' })
              )
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

      // 4. Check legacy npx vite in string literals (e.g. webServer.command)
      let foundNpxVite = false;
      function scanStrings(node: ts.Node): void {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          if (/\bnpx\s+vite\b/.test(node.text)) {
            foundNpxVite = true;
          }
        }
        ts.forEachChild(node, scanStrings);
      }
      scanStrings(sf);

      if (foundNpxVite) {
        if (isFix) {
          replaceNpxVite = true;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'playwright-config-missing-setting',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'Se prohíbe usar "npx vite" en webServer.command; utiliza "vp dev".'
          });
        }
      }
    });

    if (isFix && modified) {
      if (!rootObj) {
        fs.writeFileSync(resolvedPath, CANONICAL_PLAYWRIGHT_CONFIG_CONTENT, 'utf8');
        return;
      }
      const updatedRootObj = ts.factory.createObjectLiteralExpression(rootProps, true);
      const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        const visit: ts.Visitor = (node): ts.Node => {
          if (node === rootObj) {
            const replacedRoot = ts.visitEachChild(updatedRootObj, visit, context);
            return replacedRoot;
          }
          if (
            replaceNpxVite &&
            (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
            /\bnpx\s+vite\b/.test(node.text)
          ) {
            return ts.factory.createStringLiteral(node.text.replace(/\bnpx\s+vite\b/g, 'vp dev'), true);
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (source) => ts.visitNode(source, visit) as ts.SourceFile;
      };
      const printed = printTransformedSourceFile(sf, transformer);
      fs.writeFileSync(resolvedPath, printed, 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePlaywrightConfigAuditor());
