import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
enableCompileCache();
export const SECURITY_HARDENING_RULES = [
    'hardcoded-secrets',
    'insecure-random',
    'vulnerable-regex-redos',
    'raw-html-injection',
    'missing-csrf-token',
    'eval-or-function-constructor',
    'permissive-cors',
    'unvalidated-redirect'
];
const SCANNABLE_EXTS = new Set(['.ts', '.js', '.vue', '.html']);
export class ValidateSecurityHardeningAuditor extends FileScanAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            id: 'validate_security_hardening',
            name: 'Security Hardening & Threat Boundary Auditor',
            description: 'Endurecimiento de seguridad, OWASP Top 10 y SSRF',
            family: 'security',
            packageName: 'SecHarden',
            icon: '🛡️',
            configKey: 'securityHardening.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            roots: options.roots ?? ['src'],
            allowedExtensions: SCANNABLE_EXTS,
            ruleIds: SECURITY_HARDENING_RULES,
            ruleDescriptions: {
                'hardcoded-secrets': 'Secret o token hardcodeado en código',
                'insecure-random': 'Math.random() para valores sensibles',
                'vulnerable-regex-redos': 'Expresión regular vulnerable a ReDoS',
                'raw-html-injection': 'Inyección HTML con v-html o innerHTML',
                'missing-csrf-token': 'Formulario POST sin token CSRF',
                'eval-or-function-constructor': 'Uso de eval() o new Function() dinámico',
                'permissive-cors': "CORS permisivo con origen '*'",
                'unvalidated-redirect': 'Redirección abierta sin validar ruta'
            },
            ruleCapabilities: createRuleCapabilities(SECURITY_HARDENING_RULES, {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }),
            projectRoot: effectiveRoot,
            coverage: { include: ['src/**/*.{ts,js,vue,html}'] }
        });
    }
    scanFile(relPath, content) {
        const lines = content.split('\n');
        const isTest = isTestPath(relPath);
        this.runSubAuditorSync('hardcoded-secrets', () => {
            if (!isTest && !content.includes('secret-ok'))
                this.auditHardcodedSecrets(relPath, content, lines);
        });
        this.runSubAuditorSync('insecure-random', () => {
            if (!isTest && !content.includes('random-ok'))
                this.auditInsecureRandom(relPath, content, lines);
        });
        this.runSubAuditorSync('vulnerable-regex-redos', () => {
            if (!isTest && !content.includes('redos-ok'))
                this.auditVulnerableRegexRedos(relPath, content, lines);
        });
        this.runSubAuditorSync('raw-html-injection', () => {
            if (!content.includes('html-injection-ok'))
                this.auditRawHtmlInjection(relPath, content, lines);
        });
        this.runSubAuditorSync('missing-csrf-token', () => {
            if (!content.includes('csrf-ok'))
                this.auditMissingCsrfToken(relPath, content, lines);
        });
        this.runSubAuditorSync('eval-or-function-constructor', () => {
            if (!isTest && !content.includes('eval-ok'))
                this.auditEvalOrFunctionConstructor(relPath, content, lines);
        });
        this.runSubAuditorSync('permissive-cors', () => {
            if (!content.includes('cors-ok'))
                this.auditPermissiveCors(relPath, content, lines);
        });
        this.runSubAuditorSync('unvalidated-redirect', () => {
            if (!content.includes('redirect-ok'))
                this.auditUnvalidatedRedirect(relPath, content, lines);
        });
    }
    scanSecurityPattern(relPath, content, lines, pattern, escapeHatch, ruleId, message, filter) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
            if (filter && !filter(match))
                continue;
            const line = this.getLineNumber(content, match.index);
            const lineText = lines[line - 1] ?? '';
            const prevLineText = line > 1 ? (lines[line - 2] ?? '') : '';
            if (lineText.includes(escapeHatch) || prevLineText.includes(escapeHatch))
                continue;
            this.addViolation({
                ruleId,
                severity: 'error',
                message,
                file: relPath,
                line
            });
        }
    }
    auditHardcodedSecrets(relPath, content, lines) {
        const secretPatterns = [
            /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
            /(?:bearer\s+|jwt\s*[:=]\s*['"])(eyJ[\w-]{20,}\.[\w-]{20,})/gi,
            /(?:api_key|apiSecret|client_secret)\s*[:=]\s*['"]([\w\-]{24,})['"]/gi,
            /password\s*[:=]\s*['"](?!example|password|test|placeholder|admin)[\w!@#$%^&*()+]{8,}['"]/gi
        ];
        for (const pat of secretPatterns) {
            this.scanSecurityPattern(relPath, content, lines, pat, 'secret-ok', 'hardcoded-secrets', 'Credencial, token o secret hardcodeado en código fuente');
        }
    }
    auditInsecureRandom(relPath, content, lines) {
        const randomRegex = /(?:token|secret|salt|password|nonce|csrf|sessionId|auth)\w*\s*[:=][^;]*Math\.random\(\)/gi;
        this.scanSecurityPattern(relPath, content, lines, randomRegex, 'random-ok', 'insecure-random', 'Uso de Math.random() para generar valores sensibles o tokens; utilizar crypto seguro');
    }
    auditVulnerableRegexRedos(relPath, content, lines) {
        const redosRegex = /\/([^/\n\r]*\([^\n\r()]+[+*]\)[+*][^/\n\r]*)\/[gimuy]*/g;
        this.scanSecurityPattern(relPath, content, lines, redosRegex, 'redos-ok', 'vulnerable-regex-redos', 'Expresión regular vulnerable a ReDoS por cuantificadores anidados');
    }
    auditRawHtmlInjection(relPath, content, lines) {
        const vHtmlRegex = /v-html\s*=\s*["']([^"']+)["']/g;
        this.scanSecurityPattern(relPath, content, lines, vHtmlRegex, 'html-injection-ok', 'raw-html-injection', 'Directiva v-html sin sanitización con DOMPurify (riesgo de XSS)', m => {
            const expr = m[1] ?? '';
            return !expr.includes('DOMPurify.sanitize') && !expr.includes('sanitizeHtml');
        });
        const innerHtmlRegex = /\.innerHTML\s*=\s*([^;\n]+)/g;
        this.scanSecurityPattern(relPath, content, lines, innerHtmlRegex, 'html-injection-ok', 'raw-html-injection', 'Asignación directa a innerHTML sin sanitizar mediante DOMPurify (riesgo de XSS)', m => {
            const assigned = m[1] ?? '';
            return !assigned.includes('DOMPurify.sanitize') && !assigned.includes('sanitizeHtml');
        });
    }
    auditMissingCsrfToken(relPath, content, lines) {
        const formRegex = /<form\s+([^>]*?method=["']post["'][^>]*)>([\s\S]*?)<\/form>/gi;
        this.scanSecurityPattern(relPath, content, lines, formRegex, 'csrf-ok', 'missing-csrf-token', 'Formulario con método POST sin token de protección CSRF', m => {
            const inner = m[2] ?? '';
            return !/csrf|token|_csrf/i.test(inner);
        });
    }
    auditEvalOrFunctionConstructor(relPath, content, lines) {
        const evalRegex = /\b(?:eval\s*\(|new\s+Function\s*\()/g;
        this.scanSecurityPattern(relPath, content, lines, evalRegex, 'eval-ok', 'eval-or-function-constructor', 'Ejecución de código dinámico prohibida (eval o new Function)');
    }
    auditPermissiveCors(relPath, content, lines) {
        const corsRegex = /cors\(\s*\{\s*origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/gi;
        this.scanSecurityPattern(relPath, content, lines, corsRegex, 'cors-ok', 'permissive-cors', "Configuración CORS permisiva con origen '*' expuesta en API");
    }
    auditUnvalidatedRedirect(relPath, content, lines) {
        const redirectRegex = /res\.redirect\s*\(\s*(?:req\.query|req\.body)|location\.href\s*=\s*(?:req\.query|new\s+URLSearchParams)/gi;
        this.scanSecurityPattern(relPath, content, lines, redirectRegex, 'redirect-ok', 'unvalidated-redirect', 'Redirección abierta a parámetro de usuario sin validación de destino');
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecurityHardeningAuditor());
//# sourceMappingURL=validate_security_hardening.js.map