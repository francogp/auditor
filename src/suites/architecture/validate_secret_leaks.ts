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
import {
  BaseAuditor,
  createUniformRemediationPhases,
  FileScanAuditor,
  matchesSinglePattern,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { tryOrNullAsync } from '../../core/safeUtils.ts';

enableCompileCache();

export const SECRET_LEAKS_RULES = ['secret-leak-detected', 'secret-leak-private-key'] as const;
export type SecretLeaksRuleId = (typeof SECRET_LEAKS_RULES)[number];

export const SECRET_SCAN_EXTENSIONS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
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
    ruleDescription: 'Secrets: Exposed credential or key',
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
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(SECRET_LEAKS_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_secret_leaks',
      name: 'Secret Leaks & Credentials Auditor',
      description: 'Detects exposed credentials, tokens, and secrets',
      family: 'architecture',
      packageName: 'Secrets',
      icon: '🔑',
      ruleIds: SECRET_LEAKS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(SECRET_LEAKS_RULES, 'behavior'),
      ruleDescriptions: {
        'secret-leak-detected': 'Exposed token, secret, or credential',
        'secret-leak-private-key': 'Exposed private cryptographic key'
      },
      ruleRemediations: {
        'secret-leak-detected':
          '📖 REMEDIATION GUIDE: secret-leak-detected\n' +
          '1. Root Cause: Security analyzer (`@secretlint`) detected an API token, connection string, or private secret exposed in plain text within code or configuration.\n' +
          '2. Diagnosis: Inspect the line and column reported. The pattern matches known provider token signatures (GitHub, AWS, Google Cloud, Slack, Stripe, JWT, etc.).\n' +
          '3. Canonical Solution:\n' +
          '   a) Immediately revoke or invalidate the credential in the provider dashboard if ever committed.\n' +
          '   b) Move secrets to environment variables (`.env.local` excluded in `.gitignore` or CI/CD secret vaults).\n' +
          '   c) If this is synthetic test data, alter the entropy or prefix to avoid triggering live pattern heuristics, or add an exemption in configuration.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Exposed: `const API_TOKEN = "sk_' + 'live_secret12345";`\n' +
          '   ✅ Secure:   `const API_TOKEN = process.env.API_TOKEN ?? "";`',
        'secret-leak-private-key':
          '📖 REMEDIATION GUIDE: secret-leak-private-key\n' +
          '1. Root Cause: A cryptographic private key block (' + '`-----BEGIN ' + 'PRIVATE KEY-----`, ' + 'or similar) was found in the repository.\n' +
          '2. Diagnosis: Check the file and line number where the private key was detected.\n' +
          '3. Canonical Solution:\n' +
          '   a) Immediately remove the private key block from source files and revoke associated certificates.\n' +
          '   b) Inject keys at runtime via environment variables or protected secret stores (KMS, Vault).\n' +
          '   c) If this is a public certificate or non-sensitive test fixture, isolate it under `tests/fixtures/`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Exposed: PEM key pasted directly into source file.\n' +
          '   ✅ Secure:   `const privateKey = process.env.AUTH_PRIVATE_KEY;`'
      },
      roots: options.roots,
      allowedExtensions: SECRET_SCAN_EXTENSIONS,
      projectRoot: effectiveRoot,
      configKey: 'secretLeaks.enabled',
      defaultConfig: { enabled: true, maskSecrets: true },
      criticalConfig: {}
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

    let messages: Array<{
      message: string;
      messageId?: string;
      ruleId: string;
      loc?: { start?: { line?: number; column?: number } };
    }> = [];

    const result = await tryOrNullAsync(() =>
      lintSource({
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
      })
    );
    if (result) {
      messages = result.messages as typeof messages;
    }

    this.runSubAuditorSync('secret-leak-detected', () => {
      const regularMessages = messages.filter(
        (msg) => msg.messageId !== 'PrivateKey' && !msg.ruleId.includes('privatekey')
      );
      for (const msg of regularMessages) {
        const finding = mapSecretLintMessageToFinding(msg, relPath);
        this.addViolation({
          ruleId: 'secret-leak-detected',
          severity: finding.severity,
          file: finding.file,
          line: finding.line,
          col: finding.col,
          context: finding.context,
          message: finding.message
        });
      }
    });

    this.runSubAuditorSync('secret-leak-private-key', () => {
      const keyMessages = messages.filter(
        (msg) => msg.messageId === 'PrivateKey' || msg.ruleId.includes('privatekey')
      );
      for (const msg of keyMessages) {
        const finding = mapSecretLintMessageToFinding(msg, relPath);
        this.addViolation({
          ruleId: 'secret-leak-private-key',
          severity: finding.severity,
          file: finding.file,
          line: finding.line,
          col: finding.col,
          context: finding.context,
          message: finding.message
        });
      }
    });
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecretLeaksAuditor());
