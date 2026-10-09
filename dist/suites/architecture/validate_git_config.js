/**
 * src/suites/architecture/validate_git_config.ts
 *
 * SSoT GIT CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Verifies that the local Git repository (.git/config) enforces standard repository
 * settings: core.filemode = false, core.autocrlf = input, and core.eol = lf.
 * In --fix mode, automatically configures these settings locally via git config.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { isProductionEnvironment } from "../../core/auditorEnvironment.js";
enableCompileCache();
export const GIT_CONFIG_RULES = [
    'git-config-filemode',
    'git-config-autocrlf',
    'git-config-eol'
];
export const REQUIRED_GIT_CONFIGS = [
    { key: 'core.filemode', expected: 'false', ruleId: 'git-config-filemode' },
    { key: 'core.autocrlf', expected: 'input', ruleId: 'git-config-autocrlf' },
    { key: 'core.eol', expected: 'lf', ruleId: 'git-config-eol' }
];
export function getLocalGitConfig(key, projectRoot) {
    try {
        const res = spawnSync('git', ['config', '--local', '--get', key], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        if (res.status === 0 && res.stdout) {
            return res.stdout.trim();
        }
        return null;
    }
    catch {
        // catch-ok: Fallback when git CLI is inaccessible or command fails
        return null;
    }
}
export function setLocalGitConfig(key, value, projectRoot) {
    try {
        const res = spawnSync('git', ['config', '--local', key, value], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'ignore', 'ignore']
        });
        return res.status === 0;
    }
    catch {
        // catch-ok: Fallback when git CLI is inaccessible or command fails
        return false;
    }
}
export class ValidateGitConfigAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            capabilities: { lint: true, fix: true, fixPriority: true },
            id: 'validate_git_config',
            name: 'Git Configuration Validator',
            description: 'Valida y sincroniza configuración local de Git',
            family: 'architecture',
            ruleIds: GIT_CONFIG_RULES,
            packageName: 'Git',
            configKey: 'paths',
            defaultConfig: {},
            icon: '🌿',
            ruleDescriptions: {
                'git-config-filemode': 'core.filemode debe ser false en repo',
                'git-config-autocrlf': 'core.autocrlf debe ser input en repo',
                'git-config-eol': 'core.eol debe ser lf en repo'
            },
            coverage: { include: ['package.json'] },
            ...options
        });
    }
    async runAudit() {
        if (isProductionEnvironment()) {
            this.markSkipped('Git config omitido en entorno de producción (AUDITOR_ENV=production)');
            return;
        }
        this.recordScanned('package.json');
        const gitPath = path.resolve(this.projectRoot, '.git');
        if (!fs.existsSync(gitPath)) {
            for (const r of GIT_CONFIG_RULES) {
                this.markRuleNotApplicable(r, 'No es un repositorio Git (.git no encontrado)');
            }
            return;
        }
        for (const item of REQUIRED_GIT_CONFIGS) {
            let currentVal = getLocalGitConfig(item.key, this.projectRoot);
            if (currentVal !== item.expected && this.isFixActive()) {
                const ok = setLocalGitConfig(item.key, item.expected, this.projectRoot);
                if (ok) {
                    currentVal = getLocalGitConfig(item.key, this.projectRoot);
                }
            }
            if (currentVal !== item.expected) {
                this.addViolation({
                    ruleId: item.ruleId,
                    file: '.git/config',
                    line: 1,
                    message: `${item.key} debe ser "${item.expected}" en el repositorio local (detectado: "${currentVal ?? 'no configurado'}").`,
                    severity: 'error',
                    context: `${item.key} = ${currentVal ?? 'unset'}`
                });
            }
            this.markRuleEvaluated(item.ruleId);
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGitConfigAuditor());
//# sourceMappingURL=validate_git_config.js.map