/**
 * packages/auditor/src/suites/architecture/validate_auditor_tests.ts
 *
 * AUDITOR TEST EXISTENCE & COMPLETENESS AUDITOR (Node.js 26+ Native)
 *
 * Mandate:
 * Every sub-auditor in packages/auditor/src/suites/ and every host extension plugin
 * declared in audit.config.ts or scripts/auditors/ MUST have:
 *   1. A dedicated test file in packages/auditor/tests/ or tests/node/auditors/.
 *   2. Dedicated tests covering 100% of declared rules (errors and warnings).
 *   3. At least one test verifying clean execution (0 errors, passed status).
 */

import path from 'node:path';
import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { DEFAULT_AUDIT_CONFIG } from '../../core/auditConfigDefaults.ts';
import { isSelfProviderProject } from '../../core/auditProjectIdentity.ts';
import type { AuditTaskDefinition } from '../../core/auditContract.ts';

enableCompileCache();

export type AuditorTestRuleId =
  | 'missing-auditor-test'
  | 'untested-auditor-rule'
  | 'missing-clean-auditor-test'
  | 'missing-construction-auditor-test'
  | 'missing-violation-auditor-test';

export const AUDITOR_TEST_RULES: readonly AuditorTestRuleId[] = [
  'missing-auditor-test',
  'untested-auditor-rule',
  'missing-clean-auditor-test',
  'missing-construction-auditor-test',
  'missing-violation-auditor-test'
] as const;

export const AUDITOR_TEST_DESCRIPTIONS: Record<AuditorTestRuleId, string> = {
  'missing-auditor-test': 'Missing test for sub-auditor',
  'untested-auditor-rule': 'Rule missing verification test',
  'missing-clean-auditor-test': 'Missing clean verification test',
  'missing-construction-auditor-test': 'Missing construction test',
  'missing-violation-auditor-test': 'Missing violation test'
};

export const AUDITOR_TEST_REMEDIATIONS: Record<AuditorTestRuleId, string> = {
  'missing-auditor-test':
    'Crea un archivo de test dedicado en tests/ para el subauditor siguiendo el contrato de 5 puntos (ej. tests/<nombre_auditor>.test.ts).',
  'untested-auditor-rule':
    'Agrega aserciones de prueba en el archivo de test que ejerciten y comprueben explícitamente el ruleId indicado (mencionando su ID literal o constante).',
  'missing-clean-auditor-test':
    'Incluye un test de ejecución limpia que compruebe errors === 0, status === "passed" y findings.length === 0 con código válido.',
  'missing-construction-auditor-test':
    'Ejecuta validateAuditorConstruction(auditor) en el test unitario para verificar que el constructor declare metadata y capacidades canónicas.',
  'missing-violation-auditor-test':
    'Agrega un caso de prueba con código que infrinja la regla para verificar que el auditor detecte la violación y retorne severity: "error".'
};

export function extractSuiteDeclaredRules(source: string): string[] {
  const rules = new Set<string>();

  // 1. Match exported RULES array: export const FOO_RULES = [ ... ]
  const rulesArrayMatch = source.match(/export const \w*RULES[^=]*=\s*(\[[^\]]+\])/);
  if (rulesArrayMatch && rulesArrayMatch[1]) {
    const items = [...rulesArrayMatch[1].matchAll(/['"]([\w:-]+)['"]/g)].map((x) => x[1]!);
    for (const item of items) rules.add(item);
  }

  // 2. Match ruleIds: [ ... ] inside super({ ruleIds: [ ... ] })
  const ruleIdsMatch = source.match(/ruleIds\s*:\s*(\[[^\]]+\])/);
  if (ruleIdsMatch && ruleIdsMatch[1]) {
    const items = [...ruleIdsMatch[1].matchAll(/['"]([\w:-]+)['"]/g)].map((x) => x[1]!);
    for (const item of items) rules.add(item);
  }

  // 3. Match ruleDescriptions: { ... }
  const ruleDescBlockMatch = source.match(/ruleDescriptions\s*:\s*\{([^}]+)\}/);
  if (ruleDescBlockMatch && ruleDescBlockMatch[1]) {
    const items = [...ruleDescBlockMatch[1].matchAll(/['"]([\w:-]+)['"]\s*:/g)].map((x) => x[1]!);
    for (const item of items) rules.add(item);
  }

  return Array.from(rules);
}

import {
  scanAllAuditorTasks,
  findDedicatedTestFile,
  checkConstructionVerification,
  checkCleanVerification,
  checkViolationVerification
} from '../../core/auditorContractConformance.ts';

function auditTaskRuleCoverage(params: {
  suiteSource: string;
  testSource: string;
  testFileRel: string;
  taskId: string;
  auditor: AuditorTestsAuditor;
}): { rulesChecked: number; rulesTested: number } {
  let rulesChecked = 0;
  let rulesTested = 0;
  const declaredRules = extractSuiteDeclaredRules(params.suiteSource);

  for (const rule of declaredRules) {
    rulesChecked++;
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRegex = new RegExp(`(?:['"]${escaped}['"]|\\b${escaped}\\b)`);
    if (ruleRegex.test(params.testSource)) {
      rulesTested++;
    } else {
      params.auditor.addViolation({
        ruleId: 'untested-auditor-rule',
        severity: 'error',
        file: params.testFileRel,
        line: 1,
        message: `Test '${params.testFileRel}' does not verify rule '${rule}' declared in '${params.taskId}'.`,
        context: rule
      });
    }
  }

  return { rulesChecked, rulesTested };
}

export interface AuditorTestsAuditorOptions {
  readonly projectRoot?: string;
}

function deriveAuditorTestsCoverage(projectRoot: string): { include: string[]; exclude: string[] } {
  const config = getAuditConfig(projectRoot);
  const testRoots = config.paths?.testRoots?.length
    ? config.paths.testRoots
    : DEFAULT_AUDIT_CONFIG.paths.testRoots;
  const isSelfRepo = isSelfProviderProject(projectRoot);
  const defaultSrcRoot = DEFAULT_AUDIT_CONFIG.paths.srcRoots[0] ?? 'src';
  const srcRoot = (config.paths?.srcRoots && config.paths.srcRoots[0]) || defaultSrcRoot;
  const suitesDir = path.posix.join(srcRoot, 'suites');
  const hasCoreSuites = fs.existsSync(path.join(projectRoot, suitesDir));

  const defaultAuditorRoots = DEFAULT_AUDIT_CONFIG.auditorHygiene?.roots ?? ['scripts/auditors'];
  const auditorRoots = isSelfRepo && hasCoreSuites
    ? [suitesDir]
    : (config.auditorHygiene?.roots?.length ? config.auditorHygiene.roots : defaultAuditorRoots);

  const testPatterns = isSelfRepo && hasCoreSuites
    ? (tr: string) => [
        path.posix.join(tr, '**', 'validate_*.test.ts'),
        path.posix.join(tr, 'audit_project.test.ts')
      ]
    : (tr: string) => [
        path.posix.join(tr, '**', '{validate,audit}_*.test.ts')
      ];

  const include = [
    ...auditorRoots.map((r: string) => `${r}/**/*.ts`),
    ...testRoots.flatMap((tr: string) => testPatterns(tr))
  ];

  const exclude = isSelfRepo && hasCoreSuites
    ? [
        path.posix.join(suitesDir, 'architecture', 'audit_rules.ts'),
        path.posix.join(suitesDir, 'architecture', 'stylelintSassTrapsPlugin.ts'),
        ...testRoots.map((tr: string) => path.posix.join(tr, 'validate_critical_config.test.ts'))
      ]
    : [
        ...auditorRoots.flatMap((r: string) => [
          `${r}/**/_*`,
          `${r}/**/report_*`,
          `${r}/**/*Plugin.ts`,
          `${r}/**/audit_rules.ts`
        ]),
        ...testRoots.flatMap((tr: string) => [
          path.posix.join(tr, 'integration', '**'),
          path.posix.join(tr, 'e2e', '**')
        ])
      ];

  return { include, exclude };
}

export class AuditorTestsAuditor extends BaseAuditor<AuditorTestRuleId> {
  constructor(options: AuditorTestsAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const { include, exclude } = deriveAuditorTestsCoverage(projectRoot);
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      id: 'validate_auditor_tests',
      name: 'Auditor Test Existence & Completeness Validator',
      description: 'Validates test existence and coverage for auditors',
      family: 'architecture',
      ruleCapabilities: createRuleCapabilities(AUDITOR_TEST_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      ruleIds: AUDITOR_TEST_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(AUDITOR_TEST_RULES, 'polish'),
      packageName: 'Auditor',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🧪',
      ruleDescriptions: AUDITOR_TEST_DESCRIPTIONS,
      ruleRemediations: AUDITOR_TEST_REMEDIATIONS,
      coverage: {
        include,
        exclude
      },
      projectRoot
    });
  }

  public recordScannedFile(filePath: string): void {
    this.recordScanned(filePath);
  }

  public override async runAudit(): Promise<void> {
    const { include, exclude } = deriveAuditorTestsCoverage(this.projectRoot);
    this.redeclareCoverage({
      include,
      exclude,
      source: 'runtime'
    });
    const tasks = await scanAllAuditorTasks(this.projectRoot);

    const config = getAuditConfig(this.projectRoot);
    const testRoots = config.paths.testRoots ?? [];

    interface TaskTestContext {
      task: AuditTaskDefinition;
      testFileAbs: string | null;
      testFileRel: string;
      suiteSource: string | null;
      testSource: string | null;
    }

    const taskContexts: TaskTestContext[] = [];
    for (const task of tasks) {
      const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(
        this.projectRoot,
        task.id,
        testRoots
      );
      let suiteSource: string | null = null;
      let testSource: string | null = null;

      if (testFileAbs) {
        const suiteAbs = path.isAbsolute(task.scriptPath)
          ? task.scriptPath
          : fs.existsSync(path.resolve(this.projectRoot, task.scriptPath))
            ? path.resolve(this.projectRoot, task.scriptPath)
            : path.resolve(task.scriptPath);
        if (fs.existsSync(suiteAbs)) {
          suiteSource = fs.readFileSync(suiteAbs, 'utf-8');
          testSource = allTestSources ?? fs.readFileSync(testFileAbs, 'utf-8');
          this.recordScanned(suiteAbs);
          this.recordScanned(testFileAbs);
        }
      }
      taskContexts.push({
        task,
        testFileAbs,
        testFileRel,
        suiteSource,
        testSource
      });
    }

    let auditorsWithDedicatedTests = 0;
    this.runSubAuditorSync('missing-auditor-test', () => {
      for (const ctx of taskContexts) {
        if (!ctx.testFileAbs) {
          this.addViolation({
            ruleId: 'missing-auditor-test',
            severity: 'error',
            file: ctx.task.scriptPath,
            line: 1,
            message: `Sub-auditor '${ctx.task.id}' lacks a dedicated test file. Expected '${ctx.testFileRel}'.`,
            context: ctx.task.id
          });
        } else {
          auditorsWithDedicatedTests++;
        }
      }
    });

    let totalRulesChecked = 0;
    let testedRulesCount = 0;
    this.runSubAuditorSync('untested-auditor-rule', () => {
      for (const ctx of taskContexts) {
        if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource) continue;
        const { rulesChecked, rulesTested } = auditTaskRuleCoverage({
          suiteSource: ctx.suiteSource,
          testSource: ctx.testSource,
          testFileRel: ctx.testFileRel,
          taskId: ctx.task.id,
          auditor: this
        });
        totalRulesChecked += rulesChecked;
        testedRulesCount += rulesTested;
      }
    });

    this.runSubAuditorSync('missing-clean-auditor-test', () => {
      for (const ctx of taskContexts) {
        if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource) continue;
        if (!checkCleanVerification(ctx.testSource)) {
          this.addViolation({
            ruleId: 'missing-clean-auditor-test',
            severity: 'error',
            file: ctx.testFileRel,
            line: 1,
            message: `Test '${ctx.testFileRel}' for '${ctx.task.id}' does not include clean execution verification (zero errors).`,
            context: ctx.task.id
          });
        }
      }
    });

    this.runSubAuditorSync('missing-construction-auditor-test', () => {
      for (const ctx of taskContexts) {
        if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource) continue;
        if (!checkConstructionVerification(ctx.testSource)) {
          this.addViolation({
            ruleId: 'missing-construction-auditor-test',
            severity: 'error',
            file: ctx.testFileRel,
            line: 1,
            message: `Test '${ctx.testFileRel}' for '${ctx.task.id}' does not include auditor construction or metadata verification.`,
            context: ctx.task.id
          });
        }
      }
    });

    this.runSubAuditorSync('missing-violation-auditor-test', () => {
      for (const ctx of taskContexts) {
        if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource) continue;
        if (!checkViolationVerification(ctx.testSource)) {
          this.addViolation({
            ruleId: 'missing-violation-auditor-test',
            severity: 'error',
            file: ctx.testFileRel,
            line: 1,
            message: `Test '${ctx.testFileRel}' for '${ctx.task.id}' does not include violation detection or error failure verification.`,
            context: ctx.task.id
          });
        }
      }
    });

    this.context.setMetric('Auditors Checked', tasks.length);
    this.context.setMetric('Tested Auditors', auditorsWithDedicatedTests);
    this.context.setMetric('Declared Rules Checked', totalRulesChecked);
    this.context.setMetric('Rules Covered in Tests', testedRulesCount);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AuditorTestsAuditor());
