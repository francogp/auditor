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
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { isSelfProviderProject } from "../../core/auditProjectIdentity.js";
enableCompileCache();
export const AUDITOR_TEST_RULES = [
    'missing-auditor-test',
    'untested-auditor-rule',
    'missing-clean-auditor-test',
    'missing-construction-auditor-test',
    'missing-violation-auditor-test'
];
export const AUDITOR_TEST_DESCRIPTIONS = {
    'missing-auditor-test': 'Falta test para subauditor',
    'untested-auditor-rule': 'Regla sin test que verifique',
    'missing-clean-auditor-test': 'Falta test de verificación limpia',
    'missing-construction-auditor-test': 'Falta test de construcción',
    'missing-violation-auditor-test': 'Falta test de error o violación'
};
export function extractSuiteDeclaredRules(source) {
    const rules = new Set();
    // 1. Match exported RULES array: export const FOO_RULES = [ ... ]
    const rulesArrayMatch = source.match(/export const \w*RULES[^=]*=\s*(\[[^\]]+\])/);
    if (rulesArrayMatch && rulesArrayMatch[1]) {
        const items = [...rulesArrayMatch[1].matchAll(/['"]([\w:-]+)['"]/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    // 2. Match ruleIds: [ ... ] inside super({ ruleIds: [ ... ] })
    const ruleIdsMatch = source.match(/ruleIds\s*:\s*(\[[^\]]+\])/);
    if (ruleIdsMatch && ruleIdsMatch[1]) {
        const items = [...ruleIdsMatch[1].matchAll(/['"]([\w:-]+)['"]/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    // 3. Match ruleDescriptions: { ... }
    const ruleDescBlockMatch = source.match(/ruleDescriptions\s*:\s*\{([^}]+)\}/);
    if (ruleDescBlockMatch && ruleDescBlockMatch[1]) {
        const items = [...ruleDescBlockMatch[1].matchAll(/['"]([\w:-]+)['"]\s*:/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    return Array.from(rules);
}
import { scanAllAuditorTasks, findDedicatedTestFile, checkConstructionVerification, checkCleanVerification, checkViolationVerification } from "../../core/auditorContractConformance.js";
function auditTaskRuleCoverage(params) {
    let rulesChecked = 0;
    let rulesTested = 0;
    const declaredRules = extractSuiteDeclaredRules(params.suiteSource);
    for (const rule of declaredRules) {
        rulesChecked++;
        const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const ruleRegex = new RegExp(`(?:['"]${escaped}['"]|\\b${escaped}\\b)`);
        if (ruleRegex.test(params.testSource)) {
            rulesTested++;
        }
        else {
            params.auditor.addViolation({
                ruleId: 'untested-auditor-rule',
                severity: 'error',
                file: params.testFileRel,
                line: 1,
                message: `El test '${params.testFileRel}' no verifica la regla '${rule}' declarada en '${params.taskId}'.`,
                context: rule
            });
        }
    }
    return { rulesChecked, rulesTested };
}
function auditAuditorTask(params) {
    const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(params.projectRoot, params.task.id, params.testRoots);
    if (!testFileAbs) {
        params.auditor.addViolation({
            ruleId: 'missing-auditor-test',
            severity: 'error',
            file: params.task.scriptPath,
            line: 1,
            message: `El sub-auditor '${params.task.id}' no posee un archivo de prueba dedicado. Se esperaba '${testFileRel}'.`,
            context: params.task.id
        });
        return { rulesChecked: 0, rulesTested: 0, hasDedicatedTest: false };
    }
    const suiteAbs = path.isAbsolute(params.task.scriptPath)
        ? params.task.scriptPath
        : (fs.existsSync(path.resolve(params.projectRoot, params.task.scriptPath))
            ? path.resolve(params.projectRoot, params.task.scriptPath)
            : path.resolve(params.task.scriptPath));
    if (!fs.existsSync(suiteAbs)) {
        return { rulesChecked: 0, rulesTested: 0, hasDedicatedTest: true };
    }
    const suiteSource = fs.readFileSync(suiteAbs, 'utf-8');
    const testSource = allTestSources ?? fs.readFileSync(testFileAbs, 'utf-8');
    params.auditor.recordScannedFile(suiteAbs);
    params.auditor.recordScannedFile(testFileAbs);
    const { rulesChecked, rulesTested } = auditTaskRuleCoverage({
        suiteSource,
        testSource,
        testFileRel,
        taskId: params.task.id,
        auditor: params.auditor
    });
    if (!checkConstructionVerification(testSource)) {
        params.auditor.addViolation({
            ruleId: 'missing-construction-auditor-test',
            severity: 'error',
            file: testFileRel,
            line: 1,
            message: `El test '${testFileRel}' para '${params.task.id}' no incluye verificación de construcción o metadatos del auditor.`,
            context: params.task.id
        });
    }
    if (!checkCleanVerification(testSource)) {
        params.auditor.addViolation({
            ruleId: 'missing-clean-auditor-test',
            severity: 'error',
            file: testFileRel,
            line: 1,
            message: `El test '${testFileRel}' para '${params.task.id}' no incluye verificación de ejecución limpia (cero errores).`,
            context: params.task.id
        });
    }
    if (!checkViolationVerification(testSource)) {
        params.auditor.addViolation({
            ruleId: 'missing-violation-auditor-test',
            severity: 'error',
            file: testFileRel,
            line: 1,
            message: `El test '${testFileRel}' para '${params.task.id}' no incluye verificación de detección de violaciones o fallos con error.`,
            context: params.task.id
        });
    }
    return { rulesChecked, rulesTested, hasDedicatedTest: true };
}
export class AuditorTestsAuditor extends BaseAuditor {
    constructor(projectRoot = process.cwd()) {
        super({
            id: 'validate_auditor_tests',
            name: 'Auditor Test Existence & Completeness Validator',
            description: 'Valida existencia y cobertura de tests en auditores',
            family: 'architecture',
            capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            },
            ruleIds: AUDITOR_TEST_RULES,
            packageName: 'Auditor',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            icon: '🧪',
            ruleDescriptions: AUDITOR_TEST_DESCRIPTIONS,
            coverage: {
                include: ['src/suites/**/*.ts', 'tests/validate_*.test.ts', 'tests/audit_project.test.ts'],
                exclude: ['src/suites/architecture/audit_rules.ts', 'src/suites/architecture/stylelintSassTrapsPlugin.ts']
            },
            projectRoot
        });
    }
    recordScannedFile(filePath) {
        this.recordScanned(filePath);
    }
    async runAudit() {
        for (const r of AUDITOR_TEST_RULES) {
            this.markRuleEvaluated(r);
        }
        const hasCoreSuites = fs.existsSync(path.join(this.projectRoot, 'src/suites'));
        const isSelfRepo = isSelfProviderProject(this.projectRoot);
        const include = isSelfRepo && hasCoreSuites
            ? ['src/suites/**/*.ts', 'tests/validate_*.test.ts', 'tests/audit_project.test.ts']
            : ['scripts/auditors/**/*.ts', 'tests/**/validate_*.test.ts', 'tests/**/audit_*.test.ts'];
        const exclude = isSelfRepo && hasCoreSuites
            ? ['src/suites/architecture/audit_rules.ts', 'src/suites/architecture/stylelintSassTrapsPlugin.ts']
            : [
                'scripts/auditors/**/_*',
                'scripts/auditors/**/report_*',
                'scripts/auditors/**/*Plugin.ts',
                'scripts/auditors/**/audit_rules.ts',
                'tests/integration/**',
                'tests/e2e/**'
            ];
        this.redeclareCoverage({
            include,
            exclude,
            source: 'runtime'
        });
        const tasks = await scanAllAuditorTasks(this.projectRoot);
        const config = getAuditConfig(this.projectRoot);
        const testRoots = config.paths.testRoots ?? ['tests'];
        let auditorsWithDedicatedTests = 0;
        let totalRulesChecked = 0;
        let testedRulesCount = 0;
        for (const task of tasks) {
            const stats = auditAuditorTask({
                task,
                projectRoot: this.projectRoot,
                testRoots,
                auditor: this
            });
            if (stats.hasDedicatedTest)
                auditorsWithDedicatedTests++;
            totalRulesChecked += stats.rulesChecked;
            testedRulesCount += stats.rulesTested;
        }
        this.context.setMetric('Auditors Checked', tasks.length);
        this.context.setMetric('Tested Auditors', auditorsWithDedicatedTests);
        this.context.setMetric('Declared Rules Checked', totalRulesChecked);
        this.context.setMetric('Rules Covered in Tests', testedRulesCount);
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AuditorTestsAuditor());
//# sourceMappingURL=validate_auditor_tests.js.map