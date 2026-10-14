/**
 * TEMPLATE: FileScanAuditor (Line-by-Line File Scanner)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor scans source files (e.g. .vue, .ts, .json, .md)
 * line-by-line to detect forbidden tokens, anti-patterns, missing attributes, or syntax errors.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  hasLineSuppression,
  createUniformRuleCapabilities,
  resolveFileScanRoots,
  deriveCoverageFromRoots,
  getAuditConfig,
  type GitIgnoreRequirement
} from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-pattern'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-pattern',
  'my-feature-missing-attribute'
] as const;

export interface MyFeatureAuditorOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
  readonly exemptPaths?: readonly (string | RegExp)[];
}

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [];

  constructor(options: MyFeatureAuditorOptions = {}) {
    const config = getAuditConfig(options.projectRoot);
    const { effectiveRoot, targetRoots } = resolveFileScanRoots({
      projectRoot: options.projectRoot,
      roots: options.roots,
      configRoots: config.paths?.srcRoots
    });
    const allowedExtensions = new Set(['.vue', '.ts']);

    super({
      // Mandatory: Explicit 7-field orthogonal rule capabilities (Zero Fallbacks Mandate)
      ruleCapabilities: createUniformRuleCapabilities(MY_FEATURE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyFeatureAuditor.gitIgnoreEntries,
      id: 'validate_my_feature',
      name: 'My Feature Auditor',
      description: 'Valida tokens prohibidos y atributos en src/',
      icon: '🔍', // Mandatory thematic emoji representing this auditor
      family: 'architecture', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_FEATURE_RULES,
      packageName: 'MiModulo',
      // Configuration Governance:
      // Case 1 (Standalone feature): Declare dedicated section in .auditor/audit.config.ts:
      //   configKey: 'myFeature',
      //   defaultConfig: { enabled: true }
      // Case 2 (General scanner): Reuses core paths with no dedicated config section:
      //   configKey: 'paths',
      //   defaultConfig: {}
      configKey: 'myFeature',
      defaultConfig: {
        enabled: true
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-feature-forbidden-pattern': 'Token prohibido en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules:
      ruleRemediations: {
        'my-feature-forbidden-pattern':
          'Se detectó un token o patrón prohibido por las normas arquitecturales.\n' +
          '1. Abre el archivo y línea señalados.\n' +
          '2. Reemplaza el token prohibido por la alternativa canónica del proyecto.\n' +
          '3. Si es una excepción legítima documentada, utiliza el comentario de escape "// my-feature-ok".',
        'my-feature-missing-attribute':
          'Falta un atributo obligatorio requerido por las normas del componente o marcado.\n' +
          '1. Agrega el atributo requerido en el elemento indicado.\n' +
          '2. Verifica la documentación del componente para conocer los valores válidos.'
      },
      roots: targetRoots,
      allowedExtensions,
      // Dynamic Exemption Architecture: automatically skips documents matching strings or RegExps.
      // Prohibits hardcoding ignores or candidate file arrays in code.
      exemptPaths: options.exemptPaths,
      coverage: deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
      projectRoot: effectiveRoot
    });

    // ARCHITECTURAL NOTE: FileScanAuditor supports two canonical authoring patterns:
    // Option A (Declarative): Register sub-auditors in the constructor via:
    //   this.declarePatternSubAuditor('my-feature-forbidden-pattern', { pattern: /forbiddenToken/, message: '...' });
    //   this.declareFileSubAuditor('my-feature-missing-attribute', (doc) => { /* check doc.rawContent */ });
    // Option B (Per-file scanner): Override scanFile(relPath, content) with runSubAuditorSync (shown below).
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // Rule 1: Forbidden pattern check
    // runSubAuditorSync automatically measures duration and marks the rule evaluated.
    // Do NOT manually call markRuleEvaluated beforehand.
    this.runSubAuditorSync('my-feature-forbidden-pattern', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        if (this.isLineIgnored(line, ['my-feature-ok']) || hasLineSuppression(line, 'my-feature-forbidden-pattern', lines, i)) continue;

        if (line.includes('forbiddenToken')) {
          this.addViolation({
            ruleId: 'my-feature-forbidden-pattern',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Detected forbidden token 'forbiddenToken'. Replace with canonical helper.`,
            context: line.trim()
          });
        }
      }
    });

    // Rule 2: Missing attribute check
    this.runSubAuditorSync('my-feature-missing-attribute', () => {
      if (relPath.endsWith('.vue') && content.includes('<custom-widget') && !content.includes('aria-label=')) {
        this.addViolation({
          ruleId: 'my-feature-missing-attribute',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `<custom-widget> requires an 'aria-label' attribute.`,
          context: '<custom-widget'
        });
      }
    });
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());

