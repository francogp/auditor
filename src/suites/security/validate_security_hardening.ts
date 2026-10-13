import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, LINT_RULE_CAPABILITIES, resolveFileScanRoots } from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { isTestPath } from '../../core/auditTestPredicates.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

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
] as const;

export type SecurityHardeningRuleId = (typeof SECURITY_HARDENING_RULES)[number];

const SCANNABLE_EXTS = new Set(['.ts', '.js', '.vue', '.html']);

export class ValidateSecurityHardeningAuditor extends FileScanAuditor<SecurityHardeningRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    const config = getAuditConfig(effectiveRoot);
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
      roots: targetRoots,
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
      ruleCapabilities: createUniformRuleCapabilities(SECURITY_HARDENING_RULES, LINT_RULE_CAPABILITIES),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
      exemptPaths: config.securityHardening?.exemptPaths
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split('\n');
    const isTest = isTestPath(relPath);

    this.runSubAuditorSync('hardcoded-secrets', () => {
      if (!isTest && !content.includes('secret-ok')) this.auditHardcodedSecrets(relPath, content, lines);
    });
    this.runSubAuditorSync('insecure-random', () => {
      if (!isTest && !content.includes('random-ok')) this.auditInsecureRandom(relPath, content, lines);
    });
    this.runSubAuditorSync('vulnerable-regex-redos', () => {
      if (!isTest && !content.includes('redos-ok')) this.auditVulnerableRegexRedos(relPath, content, lines);
    });
    this.runSubAuditorSync('raw-html-injection', () => {
      if (!content.includes('html-injection-ok')) this.auditRawHtmlInjection(relPath, content, lines);
    });
    this.runSubAuditorSync('missing-csrf-token', () => {
      if (!content.includes('csrf-ok')) this.auditMissingCsrfToken(relPath, content, lines);
    });
    this.runSubAuditorSync('eval-or-function-constructor', () => {
      if (!isTest && !content.includes('eval-ok')) this.auditEvalOrFunctionConstructor(relPath, content, lines);
    });
    this.runSubAuditorSync('permissive-cors', () => {
      if (!content.includes('cors-ok')) this.auditPermissiveCors(relPath, content, lines);
    });
    this.runSubAuditorSync('unvalidated-redirect', () => {
      if (!content.includes('redirect-ok')) this.auditUnvalidatedRedirect(relPath, content, lines);
    });
  }

  private scanSecurityPattern(
    relPath: string,
    content: string,
    lines: readonly string[],
    pattern: RegExp,
    escapeHatch: string,
    ruleId: SecurityHardeningRuleId,
    message: string,
    filter?: (match: RegExpExecArray) => boolean
  ): void {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      if (filter && !filter(match)) continue;
      const line = this.getLineNumber(content, match.index);
      const lineText = lines[line - 1] ?? '';
      const prevLineText = line > 1 ? (lines[line - 2] ?? '') : '';
      if (lineText.includes(escapeHatch) || prevLineText.includes(escapeHatch)) continue;

      this.addViolation({
        ruleId,
        severity: 'error',
        message,
        file: relPath,
        line
      });
    }
  }

  private auditHardcodedSecrets(relPath: string, content: string, lines: readonly string[]): void {
    const secretPatterns = [
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
      /(?:bearer\s+|jwt\s*[:=]\s*['"])(eyJ[\w-]{20,}\.[\w-]{20,})/gi,
      /(?:api_key|apiSecret|client_secret)\s*[:=]\s*['"]([\w\-]{24,})['"]/gi,
      /password\s*[:=]\s*['"](?!example|password|test|placeholder|admin)[\w!@#$%^&*()+]{8,}['"]/gi
    ];

    for (const pat of secretPatterns) {
      this.scanSecurityPattern(
        relPath,
        content,
        lines,
        pat,
        'secret-ok',
        'hardcoded-secrets',
        'Credencial, token o secret hardcodeado en código fuente'
      );
    }
  }

  private auditInsecureRandom(relPath: string, content: string, lines: readonly string[]): void {
    const randomRegex = /(?:token|secret|salt|password|nonce|csrf|sessionId|auth)\w*\s*[:=][^;]*Math\.random\(\)/gi;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      randomRegex,
      'random-ok',
      'insecure-random',
      'Uso de Math.random() para generar valores sensibles o tokens; utilizar crypto seguro'
    );
  }

  private auditVulnerableRegexRedos(relPath: string, content: string, lines: readonly string[]): void {
    const redosRegex = /\/([^/\n\r]*\([^\n\r()]+[+*]\)[+*][^/\n\r]*)\/[gimuy]*/g;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      redosRegex,
      'redos-ok',
      'vulnerable-regex-redos',
      'Expresión regular vulnerable a ReDoS por cuantificadores anidados'
    );
  }

  private auditRawHtmlInjection(relPath: string, content: string, lines: readonly string[]): void {
    const vHtmlRegex = /v-html\s*=\s*["']([^"']+)["']/g;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      vHtmlRegex,
      'html-injection-ok',
      'raw-html-injection',
      'Directiva v-html sin sanitización con DOMPurify (riesgo de XSS)',
      m => {
        const expr = m[1] ?? '';
        return !expr.includes('DOMPurify.sanitize') && !expr.includes('sanitizeHtml');
      }
    );

    const innerHtmlRegex = /\.innerHTML\s*=\s*([^;\n]+)/g;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      innerHtmlRegex,
      'html-injection-ok',
      'raw-html-injection',
      'Asignación directa a innerHTML sin sanitizar mediante DOMPurify (riesgo de XSS)',
      m => {
        const assigned = (m[1] ?? '').trim();
        // Safe container reset: empty string or empty template literal
        if (assigned === "''" || assigned === '""' || assigned === '``') return false;
        if (/^['"]\s*['"]$/.test(assigned)) return false;
        return !assigned.includes('DOMPurify.sanitize') && !assigned.includes('sanitizeHtml');
      }
    );
  }

  private auditMissingCsrfToken(relPath: string, content: string, lines: readonly string[]): void {
    const formRegex = /<form\s+([^>]*?method=["']post["'][^>]*)>([\s\S]*?)<\/form>/gi;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      formRegex,
      'csrf-ok',
      'missing-csrf-token',
      'Formulario con método POST sin token de protección CSRF',
      m => {
        const inner = m[2] ?? '';
        return !/csrf|token|_csrf/i.test(inner);
      }
    );
  }

  private auditEvalOrFunctionConstructor(relPath: string, content: string, lines: readonly string[]): void {
    const evalRegex = /\b(?:eval\s*\(|new\s+Function\s*\()/g;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      evalRegex,
      'eval-ok',
      'eval-or-function-constructor',
      'Ejecución de código dinámico prohibida (eval o new Function)'
    );
  }

  private auditPermissiveCors(relPath: string, content: string, lines: readonly string[]): void {
    const corsRegex = /cors\(\s*\{\s*origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/gi;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      corsRegex,
      'cors-ok',
      'permissive-cors',
      "Configuración CORS permisiva con origen '*' expuesta en API"
    );
  }

  private auditUnvalidatedRedirect(relPath: string, content: string, lines: readonly string[]): void {
    const redirectRegex = /res\.redirect\s*\(\s*(?:req\.query|req\.body)|location\.href\s*=\s*(?:req\.query|new\s+URLSearchParams)/gi;
    this.scanSecurityPattern(
      relPath,
      content,
      lines,
      redirectRegex,
      'redirect-ok',
      'unvalidated-redirect',
      'Redirección abierta a parámetro de usuario sin validación de destino'
    );
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecurityHardeningAuditor());
