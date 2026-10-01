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
import { BaseAuditor } from '../../core/auditorBase.ts';
import { discoverAuditors } from '../../cli/auditScanner.ts';

enableCompileCache();

export type AuditorTestRuleId =
  | 'missing-auditor-test'
  | 'untested-auditor-rule'
  | 'missing-clean-auditor-test';

export const AUDITOR_TEST_RULES: readonly AuditorTestRuleId[] = [
  'missing-auditor-test',
  'untested-auditor-rule',
  'missing-clean-auditor-test'
] as const;

export const AUDITOR_TEST_DESCRIPTIONS: Record<AuditorTestRuleId, string> = {
  'missing-auditor-test': 'Falta test para subauditor',
  'untested-auditor-rule': 'Regla sin test que verifique',
  'missing-clean-auditor-test': 'Falta test de verificación limpia'
};

export function extractSuiteDeclaredRules(source: string): string[] {
  const rules = new Set<string>();

  // 1. Match exported RULES array: export const FOO_RULES = [ ... ]
  const rulesArrayMatch = source.match(/export const [A-Za-z0-9_]*RULES[^=]*=\s*(\[[^\]]+\])/);
  if (rulesArrayMatch && rulesArrayMatch[1]) {
    const items = [...rulesArrayMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]/g)].map(x => x[1]!);
    for (const item of items) rules.add(item);
  }

  // 2. Match ruleIds: [ ... ] inside super({ ... })
  const ruleIdsMatch = source.match(/ruleIds\s*:\s*(\[[^\]]+\])/);
  if (ruleIdsMatch && ruleIdsMatch[1]) {
    const items = [...ruleIdsMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]/g)].map(x => x[1]!);
    for (const item of items) rules.add(item);
  }

  // 3. Match ruleDescriptions: { ... }
  const ruleDescBlockMatch = source.match(/ruleDescriptions\s*:\s*\{([^}]+)\}/);
  if (ruleDescBlockMatch && ruleDescBlockMatch[1]) {
    const items = [...ruleDescBlockMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]\s*:/g)].map(x => x[1]!);
    for (const item of items) rules.add(item);
  }

  return Array.from(rules);
}

export class AuditorTestsAuditor extends BaseAuditor<AuditorTestRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_auditor_tests',
      name: 'Auditor Test Existence & Completeness Validator',
      description: 'Valida existencia y cobertura completa de tests en auditores',
      family: 'architecture',
      ruleIds: AUDITOR_TEST_RULES,
      packageName: 'Auditor',
      ruleDescriptions: AUDITOR_TEST_DESCRIPTIONS,
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const hasLocalSuites = fs.existsSync(path.join(this.projectRoot, 'src/suites')) || fs.existsSync(path.join(this.projectRoot, 'packages/auditor/src/suites'));
    const isHostProject = fs.existsSync(path.join(this.projectRoot, 'scripts/auditors')) || !hasLocalSuites;

    const suitesDir = fs.existsSync(path.join(this.projectRoot, 'src/suites'))
      ? path.join(this.projectRoot, 'src/suites')
      : path.join(this.projectRoot, 'packages/auditor/src/suites');
    const discoveryOptions = hasLocalSuites && !isHostProject
      ? { baseDir: suitesDir }
      : {};
    const allTasks = await discoverAuditors(discoveryOptions);
    const tasks = isHostProject
      ? allTasks.filter(t => t.isBuiltin === false)
      : allTasks.filter(t => t.isBuiltin !== false);

    let totalAuditorsChecked = 0;
    let auditorsWithDedicatedTests = 0;
    let totalRulesChecked = 0;
    let testedRulesCount = 0;

    this.context.logStep(2, 2, `Verificando tests unitarios para ${tasks.length} suites...`);

    for (const task of tasks) {
      totalAuditorsChecked++;
      const baseName = task.id;

      const candidateRelPaths = task.isBuiltin === false
        ? [
            `tests/node/auditors/${baseName}.test.ts`,
            `tests/${baseName}.test.ts`,
            `tests/unit/auditors/${baseName}.test.ts`
          ]
        : [
            `tests/${baseName}.test.ts`,
            `packages/auditor/tests/${baseName}.test.ts`,
            `tests/node/auditors/${baseName}.test.ts`
          ];

      let testFileAbs: string | null = null;
      let testFileRel: string = candidateRelPaths[0]!;

      for (const rel of candidateRelPaths) {
        const abs = path.resolve(this.projectRoot, rel);
        if (fs.existsSync(abs)) {
          testFileAbs = abs;
          testFileRel = rel;
          break;
        }
      }

      if (!testFileAbs) {
        this.addViolation({
          ruleId: 'missing-auditor-test',
          severity: 'error',
          file: task.scriptPath,
          line: 1,
          message: `El sub-auditor '${task.id}' no posee un archivo de prueba dedicado. Se esperaba '${testFileRel}'.`,
          context: task.id
        });
        continue;
      }

      auditorsWithDedicatedTests++;

      // Check rule coverage and clean execution
      const suiteAbs = path.isAbsolute(task.scriptPath)
        ? task.scriptPath
        : (fs.existsSync(path.resolve(this.projectRoot, task.scriptPath))
            ? path.resolve(this.projectRoot, task.scriptPath)
            : path.resolve(task.scriptPath));
      if (!fs.existsSync(suiteAbs)) continue;

      const suiteSource = fs.readFileSync(suiteAbs, 'utf-8');
      const testSource = fs.readFileSync(testFileAbs, 'utf-8');

      const declaredRules = extractSuiteDeclaredRules(suiteSource);
      for (const rule of declaredRules) {
        totalRulesChecked++;
        // Check if test mentions/asserts the ruleId
        const ruleRegex = new RegExp(`['"]${rule}['"]`);
        if (ruleRegex.test(testSource)) {
          testedRulesCount++;
        } else {
          this.addViolation({
            ruleId: 'untested-auditor-rule',
            severity: 'error',
            file: testFileRel,
            line: 1,
            message: `El test '${testFileRel}' no verifica la regla '${rule}' declarada en '${task.id}'.`,
            context: rule
          });
        }
      }

      // Check clean execution test
      const hasCleanVerification =
        testSource.includes('errors).toBe(0)') ||
        testSource.includes('errors).toEqual(0)') ||
        testSource.includes("status).toBe('passed')") ||
        testSource.includes('violations).toHaveLength(0)') ||
        testSource.includes('summary.errors).toBe(0)') ||
        testSource.includes('summary.errors === 0');

      if (!hasCleanVerification) {
        this.addViolation({
          ruleId: 'missing-clean-auditor-test',
          severity: 'error',
          file: testFileRel,
          line: 1,
          message: `El test '${testFileRel}' para '${task.id}' no incluye verificación de ejecución limpia (cero errores).`,
          context: task.id
        });
      }
    }

    this.context.setMetric('Auditors Checked', totalAuditorsChecked);
    this.context.setMetric('Tested Auditors', auditorsWithDedicatedTests);
    this.context.setMetric('Declared Rules Checked', totalRulesChecked);
    this.context.setMetric('Rules Covered in Tests', testedRulesCount);
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new AuditorTestsAuditor());
}
