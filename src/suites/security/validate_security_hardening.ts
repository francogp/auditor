import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES,
  resolveFileScanRoots
} from '../../core/auditorBase.ts';
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
    const securityRoots = resolveFileScanRoots(options);
    const secConfig = getAuditConfig(securityRoots.effectiveRoot);
    super({
      id: 'validate_security_hardening',
      name: 'Security Hardening & Threat Boundary Auditor',
      description: 'Security hardening, OWASP Top 10, and SSRF',
      family: 'security',
      packageName: 'SecHarden',
      icon: '🛡️',
      configKey: 'securityHardening.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      requiredPermissions: [],
      usesThirdPartyTool: false,
      roots: securityRoots.targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: SECURITY_HARDENING_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SECURITY_HARDENING_RULES, 'behavior'),
      ruleDescriptions: {
        'hardcoded-secrets': 'Hardcoded secret or token in code',
        'insecure-random': 'Math.random() for sensitive values',
        'vulnerable-regex-redos': 'Regular expression vulnerable to ReDoS',
        'raw-html-injection': 'HTML injection via v-html or innerHTML',
        'missing-csrf-token': 'POST form missing CSRF token',
        'eval-or-function-constructor': 'Use of eval() or dynamic new Function()',
        'permissive-cors': "Permissive CORS with origin '*'",
        'unvalidated-redirect': 'Open redirect without path validation'
      },
      ruleRemediations: {
        'hardcoded-secrets':
          '📖 REMEDIATION GUIDE: hardcoded-secrets\n' +
          '1. Root Cause: A hardcoded string matching an API key, secret token, password, or credential was detected in source code. This exposes credentials to leakages and security vulnerabilities.\n' +
          '2. Diagnosis: Locate the variable or constant at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Move secrets to environment variables (`process.env.VAR_NAME` or `.env.local` ignored by git).\n' +
          '   b) If this is dummy test data, isolate the fixture in `tests/` or break up the string so it does not match live token patterns.\n' +
          '   c) If this is an authorized false positive, annotate with `// secret-ok: <reason>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: `const apiKey = "AIzaSyD-fakeKeyExample123456789";`\n' +
          '   ✅ Correct:   `const apiKey = process.env.API_KEY ?? "";`',
        'insecure-random':
          '📖 REMEDIATION GUIDE: insecure-random\n' +
          '1. Root Cause: `Math.random()` was used for sensitive identifiers, session tokens, or keys. `Math.random()` is cryptographically weak and predictable (CWE-330).\n' +
          '2. Diagnosis: Review the use of `Math.random()` at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Use the native cryptographically secure random API: `crypto.randomUUID()` or `crypto.getRandomValues()` (`node:crypto` or `window.crypto`).\n' +
          '   b) If this is purely cosmetic (e.g., animation or visual effect with no security impact), annotate with `// random-ok: <reason>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: `const token = Math.random().toString(36).substring(2);`\n' +
          '   ✅ Correct:   `const token = crypto.randomUUID();`',
        'vulnerable-regex-redos':
          '📖 REMEDIATION GUIDE: vulnerable-regex-redos\n' +
          '1. Root Cause: A regular expression contains nested quantifiers or ambiguous patterns (e.g., `(a+)+`, `(\\d+)+`) that trigger catastrophic backtracking (ReDoS, CWE-1333) when processing adversarial inputs.\n' +
          '2. Diagnosis: Inspect the regex pattern at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Rewrite the regex to eliminate overlapping or nested repetitions.\n' +
          '   b) Use a linear procedural parser for complex validation rules.\n' +
          '   c) If input length is strictly bounded beforehand, annotate with `// redos-ok: <reason>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Vulnerable: `/([a-zA-Z0-9]+)+$/`\n' +
          '   ✅ Secure:     `/^[a-zA-Z0-9]+$/`',
        'raw-html-injection':
          '📖 REMEDIATION GUIDE: raw-html-injection\n' +
          '1. Root Cause: Direct use of `v-html`, `innerHTML`, or `outerHTML` with dynamic data introduces Cross-Site Scripting (XSS, CWE-79) attack vectors.\n' +
          '2. Diagnosis: Examine the `v-html` directive binding or assignment to `innerHTML`.\n' +
          '3. Canonical Solution:\n' +
          '   a) Replace `v-html` with safe text interpolation `{{ variable }}` or `v-text`.\n' +
          '   b) If rendering rich HTML from a trusted source is required, sanitize the string with a validated library (e.g., DOMPurify) and annotate with `// html-injection-ok: <reason>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Vulnerable: `<div v-html="userBio" />`\n' +
          '   ✅ Secure:     `<div>{{ userBio }}</div>`',
        'missing-csrf-token':
          '📖 REMEDIATION GUIDE: missing-csrf-token\n' +
          '1. Root Cause: An HTML form submitting state mutations via POST/PUT lacks a CSRF protection token or header (CWE-352).\n' +
          '2. Diagnosis: Inspect the `<form method="POST">` element.\n' +
          '3. Canonical Solution:\n' +
          '   a) Include a hidden input containing the CSRF token or configure the `X-CSRF-Token` header in AJAX requests.\n' +
          '   b) If the endpoint operates strictly via Bearer tokens or SameSite=Strict cookies without browser sessions, annotate with `// csrf-ok: <reason>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Add: `<input type="hidden" name="_csrf" :value="csrfToken" />`',
        'eval-or-function-constructor':
          '📖 REMEDIATION GUIDE: eval-or-function-constructor\n' +
          '1. Root Cause: Invocations of `eval()` or `new Function(...)` evaluate strings as executable code, permitting arbitrary code execution (CWE-95).\n' +
          '2. Diagnosis: Locate the call to `eval` or the `Function` constructor.\n' +
          '3. Canonical Solution: Eliminate dynamic code evaluation. Use object dictionaries, pure functions, dedicated parsers (e.g. `JSON.parse`), or state machines.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Vulnerable: `const result = eval(expression);`\n' +
          '   ✅ Secure:     `const result = mathEvaluator.parse(expression);`',
        'permissive-cors':
          '📖 REMEDIATION GUIDE: permissive-cors\n' +
          '1. Root Cause: CORS headers are configured with the overly permissive wildcard `Access-Control-Allow-Origin: *`, allowing arbitrary third-party origins to access internal resources.\n' +
          '2. Diagnosis: Check the CORS header configuration in the middleware or server file.\n' +
          '3. Canonical Solution: Restrict allowed origins to an explicit whitelist of trusted domains or the current host origin.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Insecure: `res.setHeader("Access-Control-Allow-Origin", "*");`\n' +
          '   ✅ Secure:   `res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(origin) ? origin : "");`',
        'unvalidated-redirect':
          '📖 REMEDIATION GUIDE: unvalidated-redirect\n' +
          '1. Root Cause: Navigation redirects (`window.location = target` or `router.push(target)`) to an external URL without verifying that the destination belongs to a trusted domain (Open Redirect, CWE-601).\n' +
          '2. Diagnosis: Review the redirection logic and how the destination URL is constructed.\n' +
          '3. Canonical Solution: Validate that the URL begins with `/` (relative path) or belongs to an allowed whitelist before navigating.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Insecure: `window.location.href = req.query.returnUrl;`\n' +
          '   ✅ Secure:   `if (isInternalUrl(returnUrl)) window.location.href = returnUrl;`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        SECURITY_HARDENING_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: securityRoots.effectiveRoot,
      coverage: deriveCoverageFromRoots(securityRoots.targetRoots, SCANNABLE_EXTS, securityRoots.effectiveRoot),
      exemptPaths: secConfig.securityHardening?.exemptPaths
    });
  }

  protected override scanFile(relPath: string, content: string): void {
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
      if (!content.includes('csrf-ok')) this.auditMissingCsrfToken(relPath, content, lines);
    });
    this.runSubAuditorSync('eval-or-function-constructor', () => {
      if (!isTest && !content.includes('eval-ok'))
        this.auditEvalOrFunctionConstructor(relPath, content, lines);
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
      /(?:api_key|apiSecret|client_secret)\s*[:=]\s*['"]([\w-]{24,})['"]/gi,
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
    const randomRegex =
      /(?:token|secret|salt|password|nonce|csrf|sessionId|auth)\w*\s*[:=][^;]*Math\.random\(\)/gi;
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

  private auditVulnerableRegexRedos(
    relPath: string,
    content: string,
    lines: readonly string[]
  ): void {
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
      (m) => {
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
      (m) => {
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
      (m) => {
        const inner = m[2] ?? '';
        return !/csrf|token|_csrf/i.test(inner);
      }
    );
  }

  private auditEvalOrFunctionConstructor(
    relPath: string,
    content: string,
    lines: readonly string[]
  ): void {
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
    const corsRegex =
      /cors\(\s*\{\s*origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/gi;
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

  private auditUnvalidatedRedirect(
    relPath: string,
    content: string,
    lines: readonly string[]
  ): void {
    const redirectRegex =
      /res\.redirect\s*\(\s*(?:req\.query|req\.body)|location\.href\s*=\s*(?:req\.query|new\s+URLSearchParams)/gi;
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
