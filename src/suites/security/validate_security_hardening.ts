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
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    const config = getAuditConfig(effectiveRoot);
    super({
      usesThirdPartyTool: false,
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
      ruleRemediationPhases: createUniformRemediationPhases(SECURITY_HARDENING_RULES, 'behavior'),
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
      ruleRemediations: {
        'hardcoded-secrets':
          '📖 GUÍA DE REMEDIACIÓN: hardcoded-secrets\n' +
          '1. Causa Raíz: Se detectó una cadena que parece ser una clave de API, secreto, token o contraseña hardcodeada en el código fuente. Esto expone credenciales a fugas y vulnerabilidades de seguridad.\n' +
          '2. Diagnóstico: Ubica la variable o constante en la línea reportada.\n' +
          '3. Solución Canónica:\n' +
          '   a) Mueve el secreto a variables de entorno (`process.env.VAR_NAME` o archivo `.env.local` excluido de git).\n' +
          '   b) Si es un valor dummy para tests, aísla la fixture en `tests/` o concatena la cadena para no coincidir con patrones de tokens reales.\n' +
          '   c) Si es un falso positivo justificado, añade el comentario `// secret-ok: <justificación>`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: `const apiKey = "AIzaSyD-fakeKeyExample123456789";`\n' +
          '   ✅ Correcto:   `const apiKey = process.env.API_KEY ?? "";`',
        'insecure-random':
          '📖 GUÍA DE REMEDIACIÓN: insecure-random\n' +
          '1. Causa Raíz: Se utilizó `Math.random()` para generar tokens de sesión, IDs sensibles o claves. `Math.random()` es pseudo-aleatorio y predecible, lo que viola CWE-330.\n' +
          '2. Diagnóstico: Revisa el uso de `Math.random()` en la línea señalada.\n' +
          '3. Solución Canónica:\n' +
          '   a) Utiliza la API nativa criptográficamente segura: `crypto.randomUUID()` o `crypto.getRandomValues()` (`node:crypto` o `window.crypto`).\n' +
          '   b) Si es puramente cosmético (ej: animación o efecto visual sin impacto en seguridad), anota `// random-ok: <justificación>`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Incorrecto: `const token = Math.random().toString(36).substring(2);`\n' +
          '   ✅ Correcto:   `const token = crypto.randomUUID();`',
        'vulnerable-regex-redos':
          '📖 GUÍA DE REMEDIACIÓN: vulnerable-regex-redos\n' +
          '1. Causa Raíz: Una expresión regular contiene cuantificadores anidados o patrones ambiguos (ej: `(a+)+`, `(\\d+)+`) que pueden provocar retroceso catastrófico (ReDoS, CWE-1333) al procesar entradas maliciosas.\n' +
          '2. Diagnóstico: Inspecciona el patrón regex en la línea del reporte.\n' +
          '3. Solución Canónica:\n' +
          '   a) Reescribe la expresión regular eliminando solapamientos o cuantificadores anidados.\n' +
          '   b) Utiliza un parser procedural lineal si la validación es compleja.\n' +
          '   c) Si el tamaño de la entrada está acotado estrictamente de antemano, añade `// redos-ok: <justificación>`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Vulnerable: `/([a-zA-Z0-9]+)+$/`\n' +
          '   ✅ Seguro:     `/^[a-zA-Z0-9]+$/`',
        'raw-html-injection':
          '📖 GUÍA DE REMEDIACIÓN: raw-html-injection\n' +
          '1. Causa Raíz: Uso de directivas `v-html`, propiedades `innerHTML` o `outerHTML` con datos dinámicos, lo que abre vectores de inyección de código entre sitios (XSS, CWE-79).\n' +
          '2. Diagnóstico: Examina el enlace `v-html` o la asignación a `innerHTML`.\n' +
          '3. Solución Canónica:\n' +
          '   a) Reemplaza `v-html` por interpolación segura estándar `{{ variable }}` o `v-text`.\n' +
          '   b) Si es indispensable renderizar HTML enriquecido de origen confiable, sanea la cadena mediante una librería de sanitización validada (ej: DOMPurify) y anota `// html-injection-ok: <justificación>`.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Vulnerable: `<div v-html="userBio" />`\n' +
          '   ✅ Seguro:     `<div>{{ userBio }}</div>`',
        'missing-csrf-token':
          '📖 GUÍA DE REMEDIACIÓN: missing-csrf-token\n' +
          '1. Causa Raíz: Un formulario HTML que envía mutaciones de estado vía método POST/PUT carece de campo o encabezado de protección CSRF (CWE-352).\n' +
          '2. Diagnóstico: Inspecciona el `<form method="POST">` señalado.\n' +
          '3. Solución Canónica:\n' +
          '   a) Incluye un input oculto con el token CSRF o configura el encabezado `X-CSRF-Token` en las peticiones AJAX.\n' +
          '   b) Si el endpoint opera exclusivamente con tokens Bearer o cookies SameSite=Strict sin sesión de navegador, anota `// csrf-ok: <justificación>`.\n' +
          '4. Ejemplo:\n' +
          '   - Añadir: `<input type="hidden" name="_csrf" :value="csrfToken" />`',
        'eval-or-function-constructor':
          '📖 GUÍA DE REMEDIACIÓN: eval-or-function-constructor\n' +
          '1. Causa Raíz: Invocación de `eval()` o `new Function(...)` para evaluar cadenas como código. Esto permite ejecución remota o arbitraria de código (CWE-95).\n' +
          '2. Diagnóstico: Localiza la llamada a `eval` o al constructor `Function`.\n' +
          '3. Solución Canónica: Elimina el código dinámico. Utiliza mapeos de objetos, funciones puras, parsers dedicados (ej: JSON.parse) o autómatas finitos.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Vulnerable: `const result = eval(expression);`\n' +
          '   ✅ Seguro:     `const result = mathEvaluator.parse(expression);`',
        'permissive-cors':
          '📖 GUÍA DE REMEDIACIÓN: permissive-cors\n' +
          '1. Causa Raíz: Configuración de cabeceras CORS con comodín permisivo `Access-Control-Allow-Origin: *`, lo que permite a sitios maliciosos acceder a recursos internos.\n' +
          '2. Diagnóstico: Comprueba la cabecera CORS en el middleware o servidor.\n' +
          '3. Solución Canónica: Restringe los orígenes autorizados a una lista blanca explícita de dominios o al origen del host actual.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Inseguro: `res.setHeader("Access-Control-Allow-Origin", "*");`\n' +
          '   ✅ Seguro:   `res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(origin) ? origin : "");`',
        'unvalidated-redirect':
          '📖 GUÍA DE REMEDIACIÓN: unvalidated-redirect\n' +
          '1. Causa Raíz: Redirección de navegación (`window.location = target` o `router.push(target)`) hacia una URL externa sin validar que pertenezca a un dominio de confianza (Open Redirect, CWE-601).\n' +
          '2. Diagnóstico: Revisa la lógica de redirección y cómo se construye el destino.\n' +
          '3. Solución Canónica: Valida que la URL comience con `/` (ruta relativa) o pertenezca a un conjunto blanco cerrado antes de navegar.\n' +
          '4. Ejemplo:\n' +
          '   ❌ Inseguro: `window.location.href = req.query.returnUrl;`\n' +
          '   ✅ Seguro:   `if (isInternalUrl(returnUrl)) window.location.href = returnUrl;`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        SECURITY_HARDENING_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
      exemptPaths: config.securityHardening?.exemptPaths
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
