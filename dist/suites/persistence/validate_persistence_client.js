/**
 * packages/auditor/src/suites/persistence/validate_persistence_client.ts
 *
 * CLIENT-SIDE WEB STORAGE & PERSISTENCE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces client-side storage architecture, quota error handling, and key typing:
 * 1. Storage Uncoordinated Save (`persistence-client-uncoordinated-save`):
 *    Direct writes to localStorage / sessionStorage with reserved save prefixes outside authorizedSaveFiles.
 * 2. Storage Untyped Key (`persistence-client-untyped-key`):
 *    Arbitrary raw string literal keys passed directly to storage without typed constants or domain keys.
 * 3. Storage Unhandled Quota Error (`persistence-client-unhandled-quota-error`):
 *    Storage mutations (.setItem) invoked outside try/catch blocks susceptible to QuotaExceededError crashes.
 *
 * Escape Hatch:
 *   // storage-ok: <justification>
 */
import { enableCompileCache } from 'node:module';
import { FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { scanBalancedBraces } from "../../core/scannerUtils.js";
import { normalizePosixPath } from "../../core/safePath.js";
enableCompileCache();
export const PERSISTENCE_CLIENT_RULES = [
    'persistence-client-uncoordinated-save',
    'persistence-client-untyped-key',
    'persistence-client-unhandled-quota-error'
];
const EXTENSIONS = new Set(['.ts', '.vue']);
const P_STORAGE_SET_ITEM = /\b(?:localStorage|sessionStorage)\.setItem\s*\(\s*([^,\s][^,]*),/g;
export class ValidatePersistenceClientAuditor extends FileScanAuditor {
    authorizedSaveFiles;
    saveKeyPrefixes;
    constructor(options) {
        const rootPath = typeof options === 'string' ? options : options?.projectRoot;
        const cfg = getAuditConfig(rootPath);
        const codeRoots = typeof options === 'object' && options?.roots ? options.roots : (cfg.paths.codeRoots ?? ['src']);
        const customAuthorized = typeof options === 'object' && options?.authorizedSaveFiles ? options.authorizedSaveFiles : cfg.persistence?.authorizedSaveFiles ?? [];
        const customPrefixes = typeof options === 'object' && options?.saveKeyPrefixes ? options.saveKeyPrefixes : cfg.persistence?.saveKeyPrefixes ?? [];
        super({
            capabilities: { lint: true, ast: false, fix: false, heavy: false },
            id: 'validate_persistence_client',
            name: 'Client-Side Web Storage & Persistence Hygiene',
            description: 'Gobernanza de localStorage, cuotas y tipado de claves',
            family: 'persistence',
            ruleIds: PERSISTENCE_CLIENT_RULES,
            packageName: 'Storage',
            icon: '🗄️',
            configKey: 'persistence.enabled',
            defaultConfig: { enabled: true },
            ruleDescriptions: {
                'persistence-client-uncoordinated-save': 'Escritura no coordinada en storage',
                'persistence-client-untyped-key': 'Clave de storage no tipada',
                'persistence-client-unhandled-quota-error': 'SetItem sin captura de cuota'
            },
            coverage: {
                include: deriveCoverageFromRoots(codeRoots, EXTENSIONS).include,
                exclude: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**']
            },
            roots: codeRoots,
            allowedExtensions: EXTENSIONS,
            extraIgnorePatterns: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**', 'migrations/**', 'database/**'],
            projectRoot: rootPath
        });
        this.authorizedSaveFiles = new Set(customAuthorized);
        this.saveKeyPrefixes = customPrefixes;
    }
    scanFile(file, content) {
        const config = getAuditConfig(this.projectRoot);
        if (config.persistence?.engine === 'none') {
            return;
        }
        if (isTestFileForCodeAudit(file, this.projectRoot))
            return;
        const lines = content.split('\n');
        const isAuthorizedFile = this.isAuthorizedSaveFile(file);
        P_STORAGE_SET_ITEM.lastIndex = 0;
        let match;
        while ((match = P_STORAGE_SET_ITEM.exec(content)) !== null) {
            const matchIndex = match.index;
            const lineNum = content.slice(0, matchIndex).split('\n').length;
            const line = lines[lineNum - 1] ?? '';
            const prevLine = lineNum >= 2 ? (lines[lineNum - 2] ?? '') : '';
            const prevPrevLine = lineNum >= 3 ? (lines[lineNum - 3] ?? '') : '';
            if (isCommentLine(line.trim()) ||
                this.hasStorageEscapeHatch(line) ||
                this.hasStorageEscapeHatch(prevLine) ||
                this.hasStorageEscapeHatch(prevPrevLine)) {
                continue;
            }
            const rawKeyArg = match[1]?.trim() ?? '';
            // Check 1: Uncoordinated save bypass
            if (!isAuthorizedFile && this.saveKeyPrefixes.length > 0) {
                const matchesSavePrefix = this.saveKeyPrefixes.some(prefix => rawKeyArg.includes(`'${prefix}`) ||
                    rawKeyArg.includes(`"${prefix}`) ||
                    rawKeyArg.includes(`\`${prefix}`));
                if (matchesSavePrefix) {
                    this.addViolationAtMatch({
                        ruleId: 'persistence-client-uncoordinated-save',
                        filePath: file,
                        content,
                        matchIndex,
                        message: `Direct write to web storage bypasses authorized persistence architecture. Delegate to authorized save stores or persistence service.`,
                        context: line.trim()
                    });
                }
            }
            // Check 2: Untyped string key literal
            const isLiteralStringKey = /^['"`][\w$-]+['"`]$/.test(rawKeyArg);
            if (isLiteralStringKey) {
                this.addViolationAtMatch({
                    ruleId: 'persistence-client-untyped-key',
                    filePath: file,
                    content,
                    matchIndex,
                    message: `Storage key ${rawKeyArg} is a raw string literal — use typed constant or enum from canonical storage definitions.`,
                    context: line.trim()
                });
            }
            // Check 3: SetItem without try/catch handling for QuotaExceededError
            if (!this.isInsideTryCatch(content, matchIndex)) {
                this.addViolationAtMatch({
                    ruleId: 'persistence-client-unhandled-quota-error',
                    filePath: file,
                    content,
                    matchIndex,
                    message: `Web storage mutation '.setItem()' must be wrapped in try/catch to guard against QuotaExceededError on full or private storage.`,
                    context: line.trim()
                });
            }
        }
    }
    isAuthorizedSaveFile(file) {
        const normalized = normalizePosixPath(file);
        return Array.from(this.authorizedSaveFiles).some(auth => normalized.endsWith(auth) || normalized.includes(auth));
    }
    hasStorageEscapeHatch(line) {
        return /\/\/\s*storage-ok:|\/\*\s*storage-ok:/i.test(line);
    }
    isInsideTryCatch(content, position) {
        const preceding = content.slice(0, position);
        const tryRegex = /\btry\s*\{/g;
        let match;
        while ((match = tryRegex.exec(preceding)) !== null) {
            const openBraceIdx = match.index + match[0].indexOf('{');
            const result = scanBalancedBraces(content, openBraceIdx + 1, position, 1);
            if (result.depth > 0) {
                return true;
            }
        }
        return false;
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidatePersistenceClientAuditor());
//# sourceMappingURL=validate_persistence_client.js.map