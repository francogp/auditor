/**
 * packages/auditor/src/suites/domain_data/validate_domain_types.ts
 *
 * DOMAIN TYPE INTEGRITY AUDITOR (Node.js 26+ Native)
 * Detects finite-domain values declared with loose runtime structures or
 * broad string types instead of strict TypeScript domain contracts.
 *
 * Enforces:
 *   1. Zero loose collections for finite domains (new Set, new Map without domain union).
 *   2. Zero string literal arrays without `as const`.
 *   3. Zero raw `string` fields, aliases or wildcard string sinks in contracts.
 *   4. Zero ambiguous unions mixing empty-string sentinels with null/undefined.
 *   5. Nominal compile-time safety for domain IDs via Brand<string, "IdName">.
 */
import fs from 'node:fs/promises';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { isTestPath } from "../../core/auditPathPredicates.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
enableCompileCache();
// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const EXTENSIONS = new Set(['.ts', '.vue']); // runtime-set: Fast O(1) membership lookup set
export const DEFAULT_TEST_PATH_MARKERS = ['.test.', '.spec.'];
export const DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS = 80;
const ESCAPE_HATCHES = ['domain-ok', 'string-ok', 'open-record', 'runtime-set', 'runtime-map', 'no-domain', 'lib-duplicate-ok', 'result-ok', 'nullable-ok', 'prop-ok', 'dto-ok', 'state-ok'];
export const CANONICAL_INFRA_ID_WHITELIST = [
    'suiteId',
    'ruleId',
    'runId',
    'buildId',
    'eslintRuleId',
    'candidate_id',
    'requiredSuiteId',
    'rule_id',
    'timerId',
    'wallClockTimerId',
    'intervalId',
    'timeoutId',
    'tickerId',
    'backgroundTickerId'
];
function isExemptDomainCastTarget(castTarget) {
    if (/^T[A-Z]/.test(castTarget))
        return true;
    const config = getAuditConfig();
    const infraList = [...CANONICAL_INFRA_ID_WHITELIST, ...(config.domain.infraIdWhitelist ?? [])].map(id => id.toLowerCase().replace(/_/g, ''));
    const lowerTarget = castTarget.toLowerCase().replace(/_/g, '');
    return infraList.some(infra => lowerTarget.includes(infra));
}
const MAX_FUNCTION_PARAM_SCAN_DISTANCE = 600;
function isFunctionParameterContext(content, matchIndex) {
    let i = matchIndex - 1;
    let parenDepth = 0;
    let braceDepth = 0;
    const limit = Math.max(0, matchIndex - MAX_FUNCTION_PARAM_SCAN_DISTANCE);
    while (i >= limit) {
        const ch = content[i];
        if (ch === ')')
            parenDepth++;
        else if (ch === '(') {
            if (parenDepth > 0)
                parenDepth--;
            else
                return braceDepth === 0;
        }
        else if (ch === '}')
            braceDepth++;
        else if (ch === '{') {
            if (braceDepth > 0)
                braceDepth--;
            else
                return false;
        }
        i--;
    }
    return false;
}
export const DOMAIN_TYPES_RULES = [
    'domain-naked-string-primitive',
    'domain-untyped-collection',
    'domain-ambiguous-union',
    'domain-unbranded-id'
];
// ─── Patterns ────────────────────────────────────────────────────────────────
const P_SET_STRING = /\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]/g;
const P_MAP_STRING = /\bnew\s+Map\s*(?:<[^>]+>\s*)?\(\s*\[\s*\[\s*['"`]/g;
const P_LITERAL_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*(?::\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>)\s*)?=\s*\[\s*['"`][\s\S]*?\](?:\s+as\s+const)?/g;
const P_TYPED_STRING_ARRAY_DECL = /\b(?:(?:export\s+)?const|let|var)\s+([A-Z_a-z]\w*)\s*:\s*(?:readonly\s+)?(?:string\[\]|Array\s*<\s*string\s*>|ReadonlyArray\s*<\s*string\s*>)/g;
const P_TYPE_ALIAS_STRING = /\b(?:export\s+)?type\s+\w+\s*=\s*string\s*;/g;
const P_STRING_SINK_UNION = /\b(?:export\s+)?type\s+\w+\s*=(?=[^;\n]*['"`][^'"`]+['"`])[^;\n]*\|\s*string\s*;/g;
const P_FIELD_WILDCARD_STRING_UNION = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:(?!\s*string\b)[^;\n]*\|\s*string\b[^;\n]*[;,]?/gm;
const P_INLINE_LITERAL_UNION_PROPERTY = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*(?:'[^']+'|"[^"]+")(?:\s*\|\s*(?:'[^']+'|"[^"]+"))+/gm;
const P_OPEN_STRING_INTERSECTION = /\b(?:export\s+)?type\s+\w+\s*=[^;\n]*string\s*&\s*\{\s*\}[^;\n]*;/g;
const P_RECORD_STRING_KEY = /\bRecord\s*<\s*string\s*,/g;
const P_RECORD_PROPERTY_KEY = /\bRecord\s*<\s*PropertyKey\s*,/g;
const P_INDEX_SIGNATURE = /\[\s*\w+\s*:\s*string\s*\]\s*:/g;
const P_DOMAIN_STRING_FIELD = /^\s*(?:readonly\s+)?([A-Z_a-z]\w*)\??:\s*string(?:\[\])?\s*[;,]?/gm;
const P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS = /^\s*(?:export\s+)?type\s+\w+\s*=[^;\n'"`]*(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*;|^\s*(?:export\s+)?type\s+\w+\s*=[^;\n]*(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*;/gm;
const P_AMBIGUOUS_EMPTY_NULL_FIELD = /^\s*(?:readonly\s+)?\w+\??:\s*(?:[^\s;][^;\n'"`]*)?(?:''|""|``)[^;\n]*\|\s*(?:null|undefined)[^;\n]*[;,]?|^\s*(?:readonly\s+)?\w+\??:\s*(?:[^\s;][^;\n]*)?(?:null|undefined)[^;\n]*\|\s*(?:''|""|``)[^;\n]*[;,]?/gm;
const P_TYPECAST_INLINE_DOMAIN_ID = /\bas\s+(?:[A-Z]\w*Id|keyof\s+typeof\s+[A-Z_a-z]\w*)\b/g;
const P_OBJECT_KEYS_CAST = /\bObject\.(?:keys|entries)\s*\([^)]+\)\s+as\s+(?:\([|\w\s]+\)|[A-Za-z]\w*)\[\]/g;
// Advanced Strict Domain Typing Patterns
const P_INLINE_ANONYMOUS_OBJECT_PARAM = /\(\s*(?:[A-Z_a-z]\w*\s*,\s*)*[A-Z_a-z]\w*\??\s*:\s*\{\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:\s*(?:string|number|boolean|unknown|any|[A-Z]\w*)(?:\[\])?\s*(?:;|,)\s*(?:readonly\s+)?[A-Z_a-z]\w*\??\s*:[^\n}]*\}\s*[,)]/g;
const P_UNBRANDED_DOMAIN_ID_ALIAS = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=\s*string\s*;/g;
const P_PARAM_WILDCARD_STRING_UNION = /\b(\w{2,}[iI]d)\s*\??:\s*[A-Z]\w*\s*\|\s*string\b/g;
const P_PARAM_DOMAIN_ID_NULLABLE = /\b(\w{2,}[iI]d)\s*:\s*[A-Z]\w*Id\s*\|\s*(?:null|undefined)\b|\b(\w{2,}[iI]d)\s*:\s*(?:null|undefined)\s*\|\s*[A-Z]\w*Id\b/g;
const P_DOMAIN_TYPE_NULLABLE = /\b(?:export\s+)?type\s+[A-Z]\w*Id\s*=[^;\n]*\|\s*(?:null|undefined)\b/g;
function toRepoPath(filePath) {
    return path.relative(ROOT, filePath).split(path.sep).join(path.posix.sep);
}
function hasEscapeHatch(line) {
    return ESCAPE_HATCHES.some(hatch => new RegExp(`//\\s*${hatch}:\\s*\\S+`).test(line));
}
function isTestFile(file) {
    const config = getAuditConfig();
    if (config.paths.includeTestsInCodeAudit)
        return false;
    return isTestPath(file);
}
function isContractFile(file) {
    const config = getAuditConfig();
    const contractRoots = [
        ...(config.paths.typesRoots ?? ['src/types']),
        ...(config.paths.dataRoots ?? ['src/data'])
    ];
    return contractRoots.some(r => file.includes(r.replace(/^\.?\//, ''))) || file.includes('/types/') || file.includes('/data/') || file.endsWith('.d.ts');
}
function isAmbientDeclarationFile(file) {
    return file.endsWith('.d.ts');
}
function isOpenUnknownDictionary(line) {
    return /Record\s*<\s*string\s*,\s*unknown\s*>|\[\s*\w+\s*:\s*string\s*\]\s*:\s*unknown/.test(line);
}
function findMatches(content, file, pattern, label, severity, ruleId, filter, overrideEscapeHatch) {
    const findings = [];
    const lines = content.split('\n');
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const leadingWs = match[0].match(/^\s*\n/)?.[0] ?? '';
        const matchStart = match.index + leadingWs.length;
        const before = content.slice(0, matchStart);
        const lineNum = (before.match(/\n/g) ?? []).length + 1;
        const lastNl = before.lastIndexOf('\n');
        const col = matchStart - lastNl;
        const line = lines[lineNum - 1] ?? '';
        if (isCommentLine(line) || isTestFile(file) || (!overrideEscapeHatch && hasEscapeHatch(line)))
            continue;
        if (filter && !filter(match, line, file))
            continue;
        findings.push({
            file,
            line: lineNum,
            col,
            pattern: label,
            snippet: match[0].slice(0, 100).replace(/\n/g, '↵'),
            severity: typeof severity === 'function' ? severity(match, line, file) : severity,
            ruleId
        });
    }
    return findings;
}
export async function auditFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const rel = toRepoPath(filePath);
    if (rel.endsWith('validate_domain_types.ts'))
        return [];
    const findings = [];
    // 1. Sets & Maps used for finite domains
    findings.push(...findMatches(content, rel, P_SET_STRING, 'Set used as finite-domain storage/validator (use `as const` array + derived type)', 'ERROR', 'domain-untyped-collection', (match, line) => {
        if (/\ballowedExtensions\s*:\s*new\s+Set/.test(line))
            return false;
        const NON_DOMAIN_SET_PATTERN = /\b\w*(?:FLAGS|DIRS|ROOTS|PATHS|COMMANDS|TAGS|ELEMENTS|SELECTORS|TOKENS|KEYWORDS|CHARS|GLOBS|FILES|EXTENSIONS|NAMES|KEYS|WORDS|ALIASES|SKILLS|SKIP|VARIANTS|CLASSES|BUILTINS|PACKAGES|ENTRIES|LINES|CHUNKS|ATTRIBUTES|PROPERTIES)\b/i;
        if (NON_DOMAIN_SET_PATTERN.test(line))
            return false;
        if (/\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]\.[a-zA-Z0-9]/.test(line))
            return false;
        if (line.includes('--') || line.includes('// runtime-set:') || line.includes('// no-domain:'))
            return false;
        const matchIdx = match.index;
        const prefix = content.slice(Math.max(0, matchIdx - DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS), matchIdx);
        if (/allowedExtensions\s*:\s*$/i.test(prefix.trim()))
            return false;
        if (NON_DOMAIN_SET_PATTERN.test(prefix.trim()))
            return false;
        const suffix = content.slice(matchIdx, matchIdx + DOMAIN_COLLECTION_CONTEXT_WINDOW_CHARS);
        if (/\bnew\s+Set\s*(?:<[^>]+>\s*)?\(\s*\[\s*['"`]\.[a-zA-Z0-9]/.test(suffix))
            return false;
        return true;
    }));
    findings.push(...findMatches(content, rel, P_MAP_STRING, 'Map with string/domain keys used as finite-domain map (use typed object/Record with union keys)', 'ERROR', 'domain-untyped-collection'));
    const NON_DOMAIN_COLLECTION_REGEX = /\b(?:let|const|var)\s+\w*(?:lines|parts|chunks|words|tokens|classes|errors|warnings|achievements|logs|results|missing|args|flags|files|entries|rows|queries|messages|diffs|patterns|findings|details|dirs|paths|roots|globs|labels|violations|items|commands|scripts|headers|steps|rules|types|extensions|modules|sections|subtitles|names|codes|tags|candidates|res|list|arr|output|buffer|elements|records|sources|targets|params|values|keys|props|attributes|variants|aliases|skills)\b/i;
    const isExemptCollectionLine = (line) => {
        const trimmed = line.trim();
        if (NON_DOMAIN_COLLECTION_REGEX.test(trimmed))
            return true;
        return line.includes('// no-domain:') || line.includes('// string-ok:') || line.includes('// array-ok:');
    };
    findings.push(...findMatches(content, rel, P_LITERAL_ARRAY_DECL, 'String literal array without `as const` — potential untyped domain (MUST use `as const satisfies readonly DomainType[]` or mark `// no-domain: Non-domain utility collection or data structure`)', 'ERROR', 'domain-untyped-collection', (match, line) => {
        if (match[0].includes('as const'))
            return false;
        return !isExemptCollectionLine(line);
    }));
    findings.push(...findMatches(content, rel, P_TYPED_STRING_ARRAY_DECL, 'String array type annotation (`string[]`) on constant/variable — derive array from `as const` tuple instead', 'ERROR', 'domain-untyped-collection', (_match, line) => !isExemptCollectionLine(line)));
    // 2. Naked string primitives, type aliases and open string sinks
    findings.push(...findMatches(content, rel, P_TYPE_ALIAS_STRING, '`type X = string` alias has zero nominal type safety — use `type X = (typeof X_VALUES)[number]` or `type X = Brand<string, "X">`', 'ERROR', 'domain-naked-string-primitive'));
    findings.push(...findMatches(content, rel, P_STRING_SINK_UNION, 'Domain-like type union ends with `| string` (open string sink) — defeats TypeScript exhaustiveness checking', 'ERROR', 'domain-naked-string-primitive'));
    findings.push(...findMatches(content, rel, P_FIELD_WILDCARD_STRING_UNION, 'Contract property has union with `| string` (e.g. `category: MyCategory | string`) — defeats nominal safety', 'ERROR', 'domain-naked-string-primitive', (_match, line, file) => isContractFile(file) && !isOpenUnknownDictionary(line)));
    findings.push(...findMatches(content, rel, P_INLINE_LITERAL_UNION_PROPERTY, 'Inline string literal union in property declaration — extract to a named canonical domain type alias', 'ERROR', 'domain-naked-string-primitive', (_match, line, file) => isContractFile(file) && !line.includes('// union-ok:')));
    findings.push(...findMatches(content, rel, P_OPEN_STRING_INTERSECTION, 'Open string intersection `string & {}` found — use a strict closed union or nominal Branded type', 'ERROR', 'domain-naked-string-primitive'));
    if (isContractFile(rel)) {
        findings.push(...findMatches(content, rel, P_RECORD_STRING_KEY, 'Record<string, ...> in type/data contract — use a finite union key when the domain is known', (_match, line, file) => (isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file) ? 'WARN' : 'ERROR'), 'domain-naked-string-primitive'));
        findings.push(...findMatches(content, rel, P_INDEX_SIGNATURE, 'Open string index signature in type/data contract — use explicit domain keys or a boundary adapter', (_match, line, file) => (isOpenUnknownDictionary(line) || isAmbientDeclarationFile(file) ? 'WARN' : 'ERROR'), 'domain-naked-string-primitive'));
        findings.push(...findMatches(content, rel, P_RECORD_PROPERTY_KEY, 'Record<PropertyKey, ...> in type/data contract is an open keyspace — use a finite union key', 'ERROR', 'domain-naked-string-primitive'));
    }
    findings.push(...findMatches(content, rel, P_DOMAIN_STRING_FIELD, 'Raw `string` field in type/data contract — use a strict domain type or mark truly open text (`// domain-ok: Open dynamic text or non-domain string payload` if genuinely open text)', 'ERROR', 'domain-naked-string-primitive', (_match, _line, file) => isContractFile(file) && !isAmbientDeclarationFile(file)));
    // 3. Ambiguous unions mixing empty-string and null/undefined
    findings.push(...findMatches(content, rel, P_AMBIGUOUS_EMPTY_NULL_TYPE_ALIAS, 'Ambiguous type alias mixes empty-string sentinel with null/undefined', 'ERROR', 'domain-ambiguous-union'));
    findings.push(...findMatches(content, rel, P_AMBIGUOUS_EMPTY_NULL_FIELD, 'Ambiguous field type mixes empty-string sentinel with null/undefined', 'ERROR', 'domain-ambiguous-union', (_match, _line, file) => isContractFile(file)));
    // 4. Unbranded domain ID aliases
    findings.push(...findMatches(content, rel, P_UNBRANDED_DOMAIN_ID_ALIAS, 'Unbranded domain ID alias detected — domain IDs should consume Brand<string, "IdName"> for nominal compile-time safety', 'ERROR', 'domain-unbranded-id', (_match, line) => !line.includes('// brand-ok: Domain branded primitive type') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload') && !line.includes('string-ok')));
    // 5. Additional domain checks
    findings.push(...findMatches(content, rel, P_TYPECAST_INLINE_DOMAIN_ID, 'Inline type assertion `as DomainId` used to force dynamic string into domain type — use boundary guard `isDomainId()` or `requireDomainId()`', 'ERROR', 'domain-naked-string-primitive', (_match, line) => {
        if (/\bfunction\s+(?:is|require)[A-Z_a-z]\w*/.test(line) || /\bis[A-Z_a-z]\w*\s*=\s*/.test(line))
            return false;
        if (line.includes('// domain-ok:') || line.includes('// infra-ok:') || line.includes('// type-ok:') || line.includes('// no-domain:'))
            return false;
        const castTarget = _match[0].replace(/^as\s+/, '').trim();
        return !isExemptDomainCastTarget(castTarget);
    }));
    findings.push(...findMatches(content, rel, P_OBJECT_KEYS_CAST, 'Type assertion on `Object.keys(...)` or `Object.entries(...)` to `as DomainId[]` — use typed helper or `isDomainId` filtering', 'ERROR', 'domain-naked-string-primitive', (_match, line) => {
        if (/\bfunction\s+is[A-Z_a-z]\w*/.test(line))
            return false;
        if (line.includes('// domain-ok:') || line.includes('// infra-ok:') || line.includes('// type-ok:') || line.includes('// no-domain:'))
            return false;
        const castTarget = _match[0].replace(/^Object\.(?:keys|entries)\s*\([^)]+\)\s+as\s+/, '').replace(/\[\]$/, '').trim();
        return !isExemptDomainCastTarget(castTarget);
    }));
    findings.push(...findMatches(content, rel, P_INLINE_ANONYMOUS_OBJECT_PARAM, 'Inline anonymous object type in function parameter prohibited — define a named interface or type contract', 'ERROR', 'domain-naked-string-primitive', (_match, line) => !line.includes('// type-ok: Type contract declaration') && !line.includes('// domain-ok: Open dynamic text or non-domain string payload') && !line.includes('withDefaults')));
    findings.push(...findMatches(content, rel, P_PARAM_WILDCARD_STRING_UNION, 'Function parameter mixes domain ID with loose `| string` — require strict domain ID', 'ERROR', 'domain-naked-string-primitive', (_match, line) => !line.includes('// domain-ok:') && !line.includes('// string-ok:')));
    findings.push(...findMatches(content, rel, P_PARAM_DOMAIN_ID_NULLABLE, 'Domain ID parameter is nullable — use undefined optional param `id?: DomainId` or explicit null-handling object', 'ERROR', 'domain-naked-string-primitive', (match, line) => {
        if (line.includes('// nullable-ok:') || line.includes('// domain-ok:') || line.includes('// prop-ok:') || line.includes('// dto-ok:') || line.includes('// state-ok:'))
            return false;
        const matchedText = match[0] ?? '';
        const idName = (match[1] || match[2] || '').trim();
        const typeName = matchedText.replace(/^[a-z_]\w*\s*:\s*/i, '').replace(/\s*\|\s*(?:null|undefined)/, '').replace(/(?:null|undefined)\s*\|\s*/, '').trim();
        if (isExemptDomainCastTarget(idName) || isExemptDomainCastTarget(typeName))
            return false;
        if (/(?:timer|timeout|interval|suite|rule|run|build)id/i.test(idName) || /(?:timer|timeout|interval|suite|rule|run|build)id/i.test(typeName))
            return false;
        if (line.trim().startsWith('private ') || line.trim().startsWith('protected ') || line.trim().startsWith('public ') || line.trim().startsWith('readonly '))
            return false;
        if (line.includes('defineProps') || line.includes('defineEmits'))
            return false;
        return isFunctionParameterContext(content, match.index);
    }));
    findings.push(...findMatches(content, rel, P_DOMAIN_TYPE_NULLABLE, 'Domain ID type alias includes null/undefined — domain types must represent valid present entities', 'ERROR', 'domain-naked-string-primitive', (_match, line) => !line.includes('// nullable-ok:') && !line.includes('// domain-ok:')));
    return findings;
}
export class DomainTypesAuditor extends BaseAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? (config.paths.includeTestsInCodeAudit
            ? [...(config.paths.codeRoots ?? ['src', 'scripts']), ...(config.paths.testRoots ?? ['tests'])]
            : (config.paths.codeRoots ?? ['src', 'scripts']));
        super({
            capabilities: { lint: true },
            id: 'validate_domain_types',
            name: 'Domain Types Integrity Audit',
            description: 'Uso de strings crudos en vez de tipos de dominio',
            family: 'domain_data',
            ruleIds: DOMAIN_TYPES_RULES,
            packageName: 'Dominio',
            configKey: 'domain.enabled',
            defaultConfig: { enabled: true },
            icon: '🔒',
            ruleDescriptions: {
                'domain-naked-string-primitive': 'String crudo en contratos de dominio',
                'domain-untyped-collection': 'Set, Map o Array sin as const',
                'domain-ambiguous-union': 'Unión con empty-string y null',
                'domain-unbranded-id': 'Alias de ID sin Brand nominal'
            },
            coverage: {
                include: deriveCoverageFromRoots(effectiveRoots, EXTENSIONS).include,
                exclude: ['scripts/auditors/**', 'scripts/lib/**', 'coverage/**', 'packages/**']
            },
            roots: effectiveRoots,
            allowedExtensions: EXTENSIONS,
            extraIgnorePatterns: ['scripts/auditors/**', 'scripts/lib/**', 'coverage/**', 'packages/**'],
            projectRoot
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Dominio desactivado en config')) {
            this.redeclareCoverage({ include: ['src/**/*.ts'], source: 'declared-only' });
            return;
        }
        for (const r of DOMAIN_TYPES_RULES) {
            this.markRuleEvaluated(r);
        }
        const filePaths = this.context.collectFiles(this.roots, this.allowedExtensions);
        if (filePaths.length === 0) {
            for (const r of DOMAIN_TYPES_RULES) {
                this.markRuleNotApplicable(r, 'No se encontraron archivos de código candidatos');
            }
            return;
        }
        const allFindings = [];
        let scannedCount = 0;
        for (const filePath of filePaths) {
            const rel = toRepoPath(filePath);
            this.recordScanned(rel);
            const findings = await auditFile(filePath);
            allFindings.push(...findings);
            scannedCount++;
        }
        for (const finding of allFindings) {
            this.addViolation({
                ruleId: finding.ruleId,
                severity: finding.severity === 'ERROR' ? 'error' : 'warning',
                file: finding.file,
                line: finding.line,
                column: finding.col,
                message: finding.pattern,
                context: finding.snippet
            });
        }
        this.context.setMetric('Scanned files', scannedCount);
        this.context.setMetric('Domain issues', allFindings.length);
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new DomainTypesAuditor());
//# sourceMappingURL=validate_domain_types.js.map