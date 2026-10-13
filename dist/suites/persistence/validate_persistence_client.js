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
import { FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
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
const P_STORAGE_METHOD = /\b(?:localStorage|sessionStorage)\.(setItem|getItem|removeItem)\s*\(\s*([^,)\s][^,)]*)/g;
const P_STORAGE_INDEXED = /\b(?:localStorage|sessionStorage)\s*\[([^\]]+)\]/g;
export class ValidatePersistenceClientAuditor extends FileScanAuditor {
    authorizedSaveFiles;
    saveKeyPrefixes;
    constructor(options) {
        const rootPath = typeof options === 'string' ? options : options?.projectRoot;
        const cfg = getAuditConfig(rootPath);
        const codeRoots = typeof options === 'object' && options?.roots ? options.roots : (cfg.paths.codeRoots ?? []);
        const customAuthorized = typeof options === 'object' && options?.authorizedSaveFiles ? options.authorizedSaveFiles : cfg.persistence?.authorizedSaveFiles ?? [];
        const customPrefixes = typeof options === 'object' && options?.saveKeyPrefixes ? options.saveKeyPrefixes : cfg.persistence?.saveKeyPrefixes ?? [];
        super({
            usesThirdPartyTool: false,
            ruleCapabilities: createRuleCapabilities(PERSISTENCE_CLIENT_RULES, {
                fix: false,
                fixPriority: false,
                lint: false,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }),
            id: 'validate_persistence_client',
            name: 'Client-Side Web Storage & Persistence Hygiene',
            description: 'Gobernanza de localStorage, cuotas y tipado de claves',
            family: 'persistence',
            ruleIds: PERSISTENCE_CLIENT_RULES,
            packageName: 'Storage',
            icon: '🗄️',
            configKey: 'persistence.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            ruleDescriptions: {
                'persistence-client-uncoordinated-save': 'Escritura no coordinada en storage',
                'persistence-client-untyped-key': 'Clave de storage no tipada',
                'persistence-client-unhandled-quota-error': 'SetItem sin captura de cuota'
            },
            ruleRemediations: {
                'persistence-client-uncoordinated-save': 'Guía de diagnóstico y remediación para persistence-client-uncoordinated-save. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'persistence-client-untyped-key': 'Guía de diagnóstico y remediación para persistence-client-untyped-key. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'persistence-client-unhandled-quota-error': 'Guía de diagnóstico y remediación para persistence-client-unhandled-quota-error. Revisa la incidencia detectada y ajusta el código correspondiente.',
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
        if (config.persistence?.engine === 'none')
            return;
        if (isTestFileForCodeAudit(file, this.projectRoot))
            return;
        this.runSubAuditorSync('persistence-client-uncoordinated-save', () => {
            this.scanUncoordinatedSave(file, content);
        });
        this.runSubAuditorSync('persistence-client-untyped-key', () => {
            this.scanUntypedKey(file, content);
        });
        this.runSubAuditorSync('persistence-client-unhandled-quota-error', () => {
            this.scanQuotaError(file, content);
        });
    }
    forEachStorageAccess(content, callback) {
        const lines = content.split('\n');
        P_STORAGE_METHOD.lastIndex = 0;
        let match;
        while ((match = P_STORAGE_METHOD.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length;
            if (this.isIgnoredLine(lines, lineNum))
                continue;
            callback({
                rawKeyArg: match[2]?.trim() ?? '',
                matchIndex: match.index,
                isWrite: match[1] === 'setItem',
                line: lines[lineNum - 1] ?? '',
                mutationLabel: "'.setItem()'"
            });
        }
        P_STORAGE_INDEXED.lastIndex = 0;
        while ((match = P_STORAGE_INDEXED.exec(content)) !== null) {
            const matchIndex = match.index;
            const lineNum = content.slice(0, matchIndex).split('\n').length;
            if (this.isIgnoredLine(lines, lineNum))
                continue;
            const rawKeyArg = match[1]?.trim() ?? '';
            const afterMatch = content.slice(matchIndex + match[0].length).trimStart();
            const isWrite = afterMatch.startsWith('=') && !afterMatch.startsWith('==') && !afterMatch.startsWith('=>');
            callback({
                rawKeyArg,
                matchIndex,
                isWrite,
                line: lines[lineNum - 1] ?? '',
                mutationLabel: "by indexed assignment ('[key] = ...')"
            });
        }
    }
    scanUncoordinatedSave(file, content) {
        const isAuthorizedFile = this.isAuthorizedSaveFile(file);
        if (isAuthorizedFile || this.saveKeyPrefixes.length === 0)
            return;
        this.forEachStorageAccess(content, ({ rawKeyArg, matchIndex, isWrite, line }) => {
            if (!isWrite)
                return;
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
        });
    }
    scanUntypedKey(file, content) {
        this.forEachStorageAccess(content, ({ rawKeyArg, matchIndex, line }) => {
            if (/^['"`][\w$-]+['"`]$/.test(rawKeyArg)) {
                this.addViolationAtMatch({
                    ruleId: 'persistence-client-untyped-key',
                    filePath: file,
                    content,
                    matchIndex,
                    message: `Storage key ${rawKeyArg} is a raw string literal — use typed constant or enum from canonical storage definitions.`,
                    context: line.trim()
                });
            }
        });
    }
    scanQuotaError(file, content) {
        this.forEachStorageAccess(content, ({ matchIndex, isWrite, line, mutationLabel }) => {
            if (isWrite && !this.isInsideTryCatch(content, matchIndex)) {
                this.addViolationAtMatch({
                    ruleId: 'persistence-client-unhandled-quota-error',
                    filePath: file,
                    content,
                    matchIndex,
                    message: `Web storage mutation ${mutationLabel} must be wrapped in try/catch to guard against QuotaExceededError on full or private storage.`,
                    context: line.trim()
                });
            }
        });
    }
    isIgnoredLine(lines, lineNum) {
        const line = lines[lineNum - 1] ?? '';
        const prevLine = lineNum >= 2 ? (lines[lineNum - 2] ?? '') : '';
        const prevPrevLine = lineNum >= 3 ? (lines[lineNum - 3] ?? '') : '';
        return (isCommentLine(line.trim()) ||
            this.hasStorageEscapeHatch(line) ||
            this.hasStorageEscapeHatch(prevLine) ||
            this.hasStorageEscapeHatch(prevPrevLine));
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