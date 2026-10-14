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
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
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
export const AUDITOR_TEST_REMEDIATIONS = {
    'missing-auditor-test': 'Crea un archivo de test dedicado en tests/ para el subauditor siguiendo el contrato de 5 puntos (ej. tests/<nombre_auditor>.test.ts).',
    'untested-auditor-rule': 'Agrega aserciones de prueba en el archivo de test que ejerciten y comprueben explícitamente el ruleId indicado (mencionando su ID literal o constante).',
    'missing-clean-auditor-test': 'Incluye un test de ejecución limpia que compruebe errors === 0, status === "passed" y findings.length === 0 con código válido.',
    'missing-construction-auditor-test': 'Ejecuta validateAuditorConstruction(auditor) en el test unitario para verificar que el constructor declare metadata y capacidades canónicas.',
    'missing-violation-auditor-test': 'Agrega un caso de prueba con código que infrinja la regla para verificar que el auditor detecte la violación y retorne severity: "error".'
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
export class AuditorTestsAuditor extends BaseAuditor {
    constructor(projectRoot = process.cwd()) {
        super({
            usesThirdPartyTool: false,
            id: 'validate_auditor_tests',
            name: 'Auditor Test Existence & Completeness Validator',
            description: 'Valida existencia y cobertura de tests en auditores',
            family: 'architecture',
            ruleCapabilities: createRuleCapabilities(AUDITOR_TEST_RULES, {
                speed: 'light',
                phase: 'normal',
                fix: 'none',
                md: false,
                ast: false,
                changedOnly: false, critical: false
            }),
            ruleIds: AUDITOR_TEST_RULES,
            packageName: 'Auditor',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            icon: '🧪',
            ruleDescriptions: AUDITOR_TEST_DESCRIPTIONS,
            ruleRemediations: AUDITOR_TEST_REMEDIATIONS,
            coverage: {
                include: ['src/suites/**/*.ts', 'tests/validate_*.test.ts', 'tests/audit_project.test.ts'],
                exclude: [
                    'src/suites/architecture/audit_rules.ts',
                    'src/suites/architecture/stylelintSassTrapsPlugin.ts',
                    'tests/validate_critical_config.test.ts'
                ]
            },
            projectRoot
        });
    }
    recordScannedFile(filePath) {
        this.recordScanned(filePath);
    }
    async runAudit() {
        const hasCoreSuites = fs.existsSync(path.join(this.projectRoot, 'src/suites'));
        const isSelfRepo = isSelfProviderProject(this.projectRoot);
        const include = isSelfRepo && hasCoreSuites
            ? ['src/suites/**/*.ts', 'tests/validate_*.test.ts', 'tests/audit_project.test.ts']
            : ['scripts/auditors/**/*.ts', 'tests/**/validate_*.test.ts', 'tests/**/audit_*.test.ts'];
        const exclude = isSelfRepo && hasCoreSuites
            ? [
                'src/suites/architecture/audit_rules.ts',
                'src/suites/architecture/stylelintSassTrapsPlugin.ts',
                'tests/validate_critical_config.test.ts'
            ]
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
        const testRoots = config.paths.testRoots ?? [];
        const taskContexts = [];
        for (const task of tasks) {
            const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(this.projectRoot, task.id, testRoots);
            let suiteSource = null;
            let testSource = null;
            if (testFileAbs) {
                const suiteAbs = path.isAbsolute(task.scriptPath)
                    ? task.scriptPath
                    : (fs.existsSync(path.resolve(this.projectRoot, task.scriptPath))
                        ? path.resolve(this.projectRoot, task.scriptPath)
                        : path.resolve(task.scriptPath));
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
                        message: `El sub-auditor '${ctx.task.id}' no posee un archivo de prueba dedicado. Se esperaba '${ctx.testFileRel}'.`,
                        context: ctx.task.id
                    });
                }
                else {
                    auditorsWithDedicatedTests++;
                }
            }
        });
        let totalRulesChecked = 0;
        let testedRulesCount = 0;
        this.runSubAuditorSync('untested-auditor-rule', () => {
            for (const ctx of taskContexts) {
                if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource)
                    continue;
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
                if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource)
                    continue;
                if (!checkCleanVerification(ctx.testSource)) {
                    this.addViolation({
                        ruleId: 'missing-clean-auditor-test',
                        severity: 'error',
                        file: ctx.testFileRel,
                        line: 1,
                        message: `El test '${ctx.testFileRel}' para '${ctx.task.id}' no incluye verificación de ejecución limpia (cero errores).`,
                        context: ctx.task.id
                    });
                }
            }
        });
        this.runSubAuditorSync('missing-construction-auditor-test', () => {
            for (const ctx of taskContexts) {
                if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource)
                    continue;
                if (!checkConstructionVerification(ctx.testSource)) {
                    this.addViolation({
                        ruleId: 'missing-construction-auditor-test',
                        severity: 'error',
                        file: ctx.testFileRel,
                        line: 1,
                        message: `El test '${ctx.testFileRel}' para '${ctx.task.id}' no incluye verificación de construcción o metadatos del auditor.`,
                        context: ctx.task.id
                    });
                }
            }
        });
        this.runSubAuditorSync('missing-violation-auditor-test', () => {
            for (const ctx of taskContexts) {
                if (!ctx.testFileAbs || !ctx.suiteSource || !ctx.testSource)
                    continue;
                if (!checkViolationVerification(ctx.testSource)) {
                    this.addViolation({
                        ruleId: 'missing-violation-auditor-test',
                        severity: 'error',
                        file: ctx.testFileRel,
                        line: 1,
                        message: `El test '${ctx.testFileRel}' para '${ctx.task.id}' no incluye verificación de detección de violaciones o fallos con error.`,
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
//# sourceMappingURL=validate_auditor_tests.js.map