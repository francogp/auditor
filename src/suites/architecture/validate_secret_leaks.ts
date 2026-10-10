/**
 * src/suites/architecture/validate_secret_leaks.ts
 *
 * SECRET LEAKS & CREDENTIALS AUDITOR (Node.js 26+ Native)
 * Scans repository files for leaked credentials, API tokens, cryptographic private keys,
 * database URLs with passwords, and cloud access keys using @secretlint/core.
 *
 * Rules:
 *   - secret-leak-detected: Detects exposed API keys, tokens, basic auth credentials, and cloud secrets.
 *   - secret-leak-private-key: Detects unencrypted private cryptographic keys (RSA, EC, OPENSSH).
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { lintSource, type SecretLintSourceOptions } from '@secretlint/core';
import { rules as presetRules } from '@secretlint/secretlint-rule-preset-recommend';
import { BaseAuditor, FileScanAuditor, matchesSinglePattern } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';

enableCompileCache();

export const SECRET_LEAKS_RULES = [
  'secret-leak-detected',
  'secret-leak-private-key'
] as const;
export type SecretLeaksRuleId = (typeof SECRET_LEAKS_RULES)[number];

export const SECRET_SCAN_EXTENSIONS: ReadonlySet<string> = new Set([ // runtime-set: Fast O(1) membership lookup set
  '.ts',
  '.js',
  '.vue',
  '.cjs',
  '.mjs',
  '.json',
  '.yaml',
  '.yml'
]);

type SecretLintConfig = SecretLintSourceOptions['options']['config'];

function buildSecretLintConfig(): SecretLintConfig {
  return {
    rules: presetRules.map((rule: (typeof presetRules)[number]) => ({
      id: rule.meta.id,
      rule,
      options: {}
    }))
  };
}

/**
 * Maps a single secretlint message to a canonical AuditFinding.
 */
export function mapSecretLintMessageToFinding(
  msg: {
    message: string;
    messageId?: string;
    ruleId: string;
    loc?: { start?: { line?: number; column?: number } };
  },
  relPath: string
): AuditFinding {
  const isPrivateKey = msg.messageId === 'PrivateKey' || msg.ruleId.includes('privatekey');
  const ruleId: SecretLeaksRuleId = isPrivateKey
    ? 'secret-leak-private-key'
    : 'secret-leak-detected';

  return {
    suiteId: 'validate_secret_leaks',
    suiteName: 'Secret Leaks & Credentials Auditor',
    ruleId,
    ruleDescription: 'Secretos: Credencial o clave expuesta',
    severity: 'error',
    file: relPath,
    line: msg.loc?.start?.line ?? 1,
    col: msg.loc?.start?.column ?? 1,
    context: msg.ruleId,
    message: msg.message
  };
}

export class ValidateSecretLeaksAuditor extends FileScanAuditor<SecretLeaksRuleId> {
  private readonly secretLintConfig: SecretLintConfig;

  constructor(options: { projectRoot?: string; roots?: readonly string[] } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      id: 'validate_secret_leaks',
      name: 'Secret Leaks & Credentials Auditor',
      description: 'Detecta credenciales, tokens y secretos expuestos',
      family: 'architecture',
      packageName: 'Secretos',
      icon: '🔑',
      ruleIds: SECRET_LEAKS_RULES,
      ruleDescriptions: {
        'secret-leak-detected': 'Token, secreto o credencial expuesta',
        'secret-leak-private-key': 'Clave criptográfica privada expuesta'
      },
      roots: options.roots,
      allowedExtensions: SECRET_SCAN_EXTENSIONS,
      projectRoot: effectiveRoot,
      configKey: 'secretLeaks.enabled',
      defaultConfig: { enabled: true, maskSecrets: true },
      criticalConfig: {},
    });

    this.secretLintConfig = buildSecretLintConfig();
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Secret leaks audit desactivado en config')) {
      return;
    }
    await super.runAudit();
  }

  protected override async scanFile(relPath: string, content: string): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    const exemptGlobs = config.secretLeaks?.exemptGlobs ?? [];
    for (const glob of exemptGlobs) {
      if (matchesSinglePattern(relPath, glob)) {
        return;
      }
    }

    const maskSecrets = config.secretLeaks?.maskSecrets ?? true;
    const ext = path.extname(relPath) || '.txt';

    try {
      const result = await lintSource({
        source: {
          filePath: relPath,
          content,
          ext,
          contentType: 'text'
        },
        options: {
          config: this.secretLintConfig,
          maskSecrets
        }
      });

      for (const msg of result.messages) {
        const finding = mapSecretLintMessageToFinding(msg, relPath);
        this.addViolation({
          ruleId: finding.ruleId as SecretLeaksRuleId,
          severity: finding.severity,
          file: finding.file,
          line: finding.line,
          col: finding.col,
          context: finding.context,
          message: finding.message
        });
      }
    } catch {
      // catch-ok: Ignore unparseable or binary files during secret scanning
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecretLeaksAuditor());
