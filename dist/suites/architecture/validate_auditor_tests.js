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
import { discoverAuditors } from "../../cli/auditScanner.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const AUDITOR_TEST_RULES = [
    'missing-auditor-test',
    'untested-auditor-rule',
    'missing-clean-auditor-test'
];
export const AUDITOR_TEST_DESCRIPTIONS = {
    'missing-auditor-test': 'Falta test para subauditor',
    'untested-auditor-rule': 'Regla sin test que verifique',
    'missing-clean-auditor-test': 'Falta test de verificación limpia'
};
export function extractSuiteDeclaredRules(source) {
    const rules = new Set();
    // 1. Match exported RULES array: export const FOO_RULES = [ ... ]
    const rulesArrayMatch = source.match(/export const [A-Za-z0-9_]*RULES[^=]*=\s*(\[[^\]]+\])/);
    if (rulesArrayMatch && rulesArrayMatch[1]) {
        const items = [...rulesArrayMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    // 2. Match ruleIds: [ ... ] inside super({ ... })
    const ruleIdsMatch = source.match(/ruleIds\s*:\s*(\[[^\]]+\])/);
    if (ruleIdsMatch && ruleIdsMatch[1]) {
        const items = [...ruleIdsMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    // 3. Match ruleDescriptions: { ... }
    const ruleDescBlockMatch = source.match(/ruleDescriptions\s*:\s*\{([^}]+)\}/);
    if (ruleDescBlockMatch && ruleDescBlockMatch[1]) {
        const items = [...ruleDescBlockMatch[1].matchAll(/['"]([a-zA-Z0-9_:-]+)['"]\s*:/g)].map(x => x[1]);
        for (const item of items)
            rules.add(item);
    }
    return Array.from(rules);
}
const DEFAULT_EXTENSION_TASK_TIMEOUT_MS = 60000;
function isEligibleExtensionAuditorFile(name) {
    if (!name.endsWith('.ts') || name.startsWith('_'))
        return false;
    if (name.includes('.test.') || name.includes('.spec.'))
        return false;
    if (name.startsWith('report_') || name === 'audit_rules.ts')
        return false;
    return true;
}
function registerExtensionAuditorFile(fullPath, entryName, projectRoot, tasks) {
    if (!isEligibleExtensionAuditorFile(entryName))
        return;
    const id = path.basename(entryName, '.ts');
    if (tasks.some(t => t.id === id))
        return;
    tasks.push({
        id,
        name: id,
        family: 'architecture',
        scriptPath: path.relative(projectRoot, fullPath).replace(/\\/g, '/'),
        command: 'node',
        args: [],
        fast: true,
        timeoutMs: DEFAULT_EXTENSION_TASK_TIMEOUT_MS,
        order: 99,
        isBuiltin: false
    });
}
function scanExtensionAuditors(projectRoot, tasks) {
    const scriptsAuditorsDir = path.join(projectRoot, 'scripts/auditors');
    if (!fs.existsSync(scriptsAuditorsDir))
        return;
    const queue = [scriptsAuditorsDir];
    while (queue.length > 0) {
        const currentDir = queue.shift();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('_') && entry.name !== 'node_modules') {
                    queue.push(fullPath);
                }
            }
            else if (entry.isFile()) {
                registerExtensionAuditorFile(fullPath, entry.name, projectRoot, tasks);
            }
        }
    }
}
async function discoverAuditorTasks(projectRoot) {
    const hasLocalSuites = fs.existsSync(path.join(projectRoot, 'src/suites')) || fs.existsSync(path.join(projectRoot, 'packages/auditor/src/suites'));
    const isHostProject = fs.existsSync(path.join(projectRoot, 'scripts/auditors')) || !hasLocalSuites;
    const suitesDir = fs.existsSync(path.join(projectRoot, 'src/suites'))
        ? path.join(projectRoot, 'src/suites')
        : path.join(projectRoot, 'packages/auditor/src/suites');
    const discoveryOptions = hasLocalSuites && !isHostProject
        ? { baseDir: suitesDir }
        : {};
    const allTasks = await discoverAuditors(discoveryOptions);
    const tasks = isHostProject
        ? allTasks.filter(t => t.isBuiltin === false)
        : allTasks.filter(t => t.isBuiltin !== false);
    scanExtensionAuditors(projectRoot, tasks);
    return tasks;
}
function findAuditorTestFile(projectRoot, taskId, testRoots) {
    const candidateRelPaths = [];
    for (const tr of testRoots) {
        const cleanTr = tr.replace(/^\/+|\/+$/g, '');
        candidateRelPaths.push(`${cleanTr}/${taskId}.test.ts`);
        candidateRelPaths.push(`${cleanTr}/node/auditors/${taskId}.test.ts`);
        candidateRelPaths.push(`${cleanTr}/unit/auditors/${taskId}.test.ts`);
        candidateRelPaths.push(`${cleanTr}/auditors/${taskId}.test.ts`);
    }
    candidateRelPaths.push(`packages/auditor/tests/${taskId}.test.ts`);
    let testFileAbs = null;
    let testFileRel = candidateRelPaths[0];
    for (const rel of candidateRelPaths) {
        const abs = path.resolve(projectRoot, rel);
        if (fs.existsSync(abs)) {
            testFileAbs = abs;
            testFileRel = rel;
            break;
        }
    }
    return { testFileAbs, testFileRel };
}
function checkCleanVerification(testSource) {
    return (testSource.includes('errors).toBe(0)') ||
        testSource.includes('errors).toEqual(0)') ||
        testSource.includes("status).toBe('passed')") ||
        testSource.includes('violations).toHaveLength(0)') ||
        testSource.includes('summary.errors).toBe(0)') ||
        testSource.includes('summary.errors === 0'));
}
function auditTaskRuleCoverage(params) {
    let rulesChecked = 0;
    let rulesTested = 0;
    const declaredRules = extractSuiteDeclaredRules(params.suiteSource);
    for (const rule of declaredRules) {
        rulesChecked++;
        const ruleRegex = new RegExp(`['"]${rule}['"]`);
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
    const { testFileAbs, testFileRel } = findAuditorTestFile(params.projectRoot, params.task.id, params.testRoots);
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
    const testSource = fs.readFileSync(testFileAbs, 'utf-8');
    const { rulesChecked, rulesTested } = auditTaskRuleCoverage({
        suiteSource,
        testSource,
        testFileRel,
        taskId: params.task.id,
        auditor: params.auditor
    });
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
    return { rulesChecked, rulesTested, hasDedicatedTest: true };
}
export class AuditorTestsAuditor extends BaseAuditor {
    constructor(projectRoot = process.cwd()) {
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
    async runAudit() {
        const tasks = await discoverAuditorTasks(this.projectRoot);
        this.context.logStep(2, 2, `Verificando tests unitarios para ${tasks.length} suites...`);
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