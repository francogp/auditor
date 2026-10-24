/**
 * scripts/auditors/architecture/validate_audit_headers.ts
 *
 * ILLEGAL AUDIT HEADERS & FILE-LEVEL SUPPRESSIONS AUDITOR (Node.js 26+)
 *
 * Enforces the project's Absolute Prohibition on File-Level Audit Ignores
 * and Zero-Ignore policies across the codebase:
 *   - Detects fallow file-level ignore directives.
 *   - Detects whole-file eslint-disable blocks.
 *   - Detects banned TypeScript compiler bypasses (@ts-nocheck, @ts-ignore, @ts-expect-error).
 *   - Detects auditor escape hatches misused as standalone file header comments.
 *   - Strictly respects project-level DIRECTORY IGNORES.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_audit_headers.ts
 *   npm run validate:audit-headers
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { safeReadFileSync } from '../../core/safeUtils.ts';
import type { FindingSeverity } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  FileScanAuditor,
  CANONICAL_IGNORE_DIRS,
  isPathIgnored,
  getEffectiveScannableRoots,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { normalizePosixPath } from '../../core/safePath.ts';

enableCompileCache();

export const MAX_HEADER_LINES_CHECK = 10;

export type HeaderRuleId =
  | 'file-level-fallow-ignore'
  | 'file-level-eslint-disable'
  | 'banned-ts-suppression'
  | 'banned-magic-suppression'
  | 'banned-style-suppression'
  | 'header-auditor-escape'
  | 'unjustified-escape-hatch';

export const HEADER_RULES: readonly HeaderRuleId[] = [
  'file-level-fallow-ignore',
  'file-level-eslint-disable',
  'banned-ts-suppression',
  'banned-magic-suppression',
  'banned-style-suppression',
  'header-auditor-escape',
  'unjustified-escape-hatch'
];

export interface HeaderViolation {
  readonly file: string;
  readonly line: number;
  readonly ruleId: HeaderRuleId;
  readonly message: string;
  readonly context: string;
  readonly severity: FindingSeverity;
}

export interface AuditHeadersResult {
  readonly filesScanned: number;
  readonly violations: readonly HeaderViolation[];
  readonly passed: boolean;
  readonly countsByRule: Record<string, number>;
}

export { CANONICAL_IGNORE_DIRS, isPathIgnored };

const FALLOW_IGNORE_REGEX =
  /(?:\/\/|\/\*|<!--)\s*fallow-ignore(?:-file)?\b(?!\s*-(?:next-line|line)\b)/i;
const TS_SUPPRESSION_REGEX = /^\s*\/\/\s*@ts-(?:nocheck|ignore|expect-error)\b/i;
const ESLINT_DISABLE_BLOCK_REGEX =
  /^\s*\/\*\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const ESLINT_DISABLE_TEMPLATE_REGEX =
  /^\s*<!--\s*(?:eslint|oxlint)-disable\b(?!\s*-(?:next-line|line)\b)/i;
const BANNED_MAGIC_SUPPRESSION_REGEX = /\/\/\s*(?:no-magic|magic-ok|number-ok)\b/i;
const BANNED_STYLE_SUPPRESSION_REGEX = /\/\/\s*(?:style-inherited|style-ok)\b/i;
const STANDALONE_ESCAPE_HATCHES_REGEX =
  /^\s*\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok)\s*$/i;
const UNJUSTIFIED_ESCAPE_HATCH_REGEX =
  /\/\/\s*(?:domain-ok|singleton-ok|string-ok|any-ok|boolean-ok|type-ok|value-ok|const-ok|o1-ok|linear-search-ok|map-ok|promise-ok|import-ok|result-ok|brand-ok|no-domain|text-ok|uuid-ok|infra-id-ok|spanish-ok|open-record|runtime-set|runtime-map|lib-duplicate-ok|fallback-ok)\b(?!\s*:\s*\S)/i;

function checkLineForIllegalHeaders(
  filePath: string,
  rawLine: string,
  lineNum: number
): HeaderViolation | null {
  const trimmed = rawLine.trim();

  // 1. Check for fallow suppression directives
  if (FALLOW_IGNORE_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-fallow-ignore',
      message: `Illegal 'fallow-ignore' directive detected. Silencing audits with fallow-ignore is STRICTLY PROHIBITED. Resolve the issue in source code or configure fallow cleanly.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 2. Check for @ts-nocheck, @ts-ignore, @ts-expect-error starting the comment line
  if (TS_SUPPRESSION_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-ts-suppression',
      message: `TypeScript suppression detected ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibited under Zero-Ignore policy.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 3. Check for file-level / block-level /* eslint-disable */
  if (ESLINT_DISABLE_BLOCK_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-eslint-disable',
      message: `File-level '/* eslint-disable */' or '/* oxlint-disable */' block detected. Use line-scoped directives only when strictly justified.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // Check for template-level <!-- eslint-disable -->
  if (ESLINT_DISABLE_TEMPLATE_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'file-level-eslint-disable',
      message: `Template-level '<!-- eslint-disable -->' or '<!-- oxlint-disable -->' directive detected. Avoid disabling rules across entire templates.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 4. Check for banned magic number suppression directives
  const bannedMagicMatch = rawLine.match(BANNED_MAGIC_SUPPRESSION_REGEX);
  if (bannedMagicMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-magic-suppression',
      message: `Banned escape directive '// ${bannedMagicMatch[1]}' detected. The Zero Magic Numbers policy requires declaring descriptive constants ('as const') without exceptions.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 5. Check for banned style inheritance/suppression directives
  const bannedStyleMatch = rawLine.match(BANNED_STYLE_SUPPRESSION_REGEX);
  if (bannedStyleMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'banned-style-suppression',
      message: `Banned escape directive '// ${bannedStyleMatch[1]}' detected. Vue 3 scoped styles do not penetrate child components; simulated style inheritance comments are prohibited. Each component with classes must declare or link its styles explicitly.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 6. Check for standalone escape hatches in header lines
  if (lineNum <= MAX_HEADER_LINES_CHECK && STANDALONE_ESCAPE_HATCHES_REGEX.test(rawLine)) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'header-auditor-escape',
      message: `Misplaced escape hatch '${trimmed}' used as file header. Escape annotations must only be added directly on active code statements.`,
      context: trimmed,
      severity: 'error'
    };
  }

  // 7. Check for banned legacy escape hatches or unjustified ignores
  const unjustifiedMatch = rawLine.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
  if (unjustifiedMatch) {
    return {
      file: filePath,
      line: lineNum,
      ruleId: 'unjustified-escape-hatch',
      message: `[ZERO-ESCAPE MANDATE] Escape hatch '// ${unjustifiedMatch[1]}' detected. Escape hatches and ignore comments are permanently eradicated. Static analysis violations must be resolved legitimately in source code or through typed domain configurations.`,
      context: trimmed,
      severity: 'error'
    };
  }

  return null;
}

/**
 * Scans file contents for illegal suppression headers or file-level ignores.
 */
export function scanFileForIllegalHeaders(filePath: string, content: string): HeaderViolation[] {
  const violations: HeaderViolation[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const violation = checkLineForIllegalHeaders(filePath, lines[i]!, i + 1);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}

export interface AuditHeadersOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}

/**
 * Object-oriented FileScanAuditor implementation for Illegal Audit Headers.
 */
export class AuditHeadersAuditor extends FileScanAuditor<HeaderRuleId> {
  private readonly collectedViolations: HeaderViolation[] = [];

  constructor(options: AuditHeadersOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const headerRoots =
      options.roots ?? getEffectiveScannableRoots(getAuditConfig(projectRoot));
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: headerRoots,
      projectRoot,
      ruleCapabilities: createRuleCapabilities(HEADER_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_audit_headers',
      name: 'Audit Headers & Suppression Validator',
      description: 'Prohibits file-level suppressions and global ignores',
      family: 'architecture',
      ruleIds: HEADER_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(HEADER_RULES, 'polish'),
      packageName: 'Header',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '📰',
      ruleDescriptions: {
        'file-level-fallow-ignore': 'Prohibited file fallow-ignore',
        'file-level-eslint-disable': 'Prohibited global eslint-disable',
        'banned-ts-suppression': 'Prohibited @ts-ignore/@ts-nocheck',
        'banned-magic-suppression': 'Prohibited magic number suppression',
        'banned-style-suppression': 'Prohibited style suppression',
        'header-auditor-escape': 'Misplaced escape hatch',
        'unjustified-escape-hatch': 'Unjustified escape hatch'
      },
      ruleRemediations: {
        'file-level-fallow-ignore':
          '📖 REMEDIATION GUIDE: file-level-fallow-ignore\n' +
          '1. Root Cause: A fallow bypass comment was declared, masking static violations.\n' +
          '2. Diagnosis: Check the reported file for fallow suppression comments.\n' +
          '3. Canonical Solution: Remove the directive. Resolve violations in source code or configure fallow cleanly.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Banned:  Bypass directives masking analysis findings\n' +
          '   ✅ Clean:   Resolve violations legitimately without bypass directives.',
        'file-level-eslint-disable':
          '📖 REMEDIATION GUIDE: file-level-eslint-disable\n' +
          '1. Root Cause: An un-scoped /* eslint-disable */ or /* oxlint-disable */ directive was declared for the entire file or template.\n' +
          '2. Diagnosis: Check the top of the file for global linter disable comments.\n' +
          '3. Canonical Solution: Remove the global directive. Fix the lint issues or disable only the specific rule on the exact line using // eslint-disable-next-line <rule> -- <reason>.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Banned:  /* eslint-disable */\n' +
          '   ✅ Scoped:  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Interop with untyped 3rd-party library',
        'banned-ts-suppression':
          '📖 REMEDIATION GUIDE: banned-ts-suppression\n' +
          '1. Root Cause: Blind suppression directives (@ts-ignore or @ts-nocheck) were used, destroying type safety.\n' +
          '2. Diagnosis: Search for @ts-ignore or @ts-nocheck in the source file.\n' +
          '3. Canonical Solution: Correct the types in interfaces or functions. If an external untyped library causes an unavoidable type error, use @ts-expect-error with a mandatory explanation.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Banned:  // @ts-ignore\n' +
          '   ✅ Scoped:  // @ts-expect-error - External library emits incorrect types in v1.2',
        'banned-magic-suppression':
          '📖 REMEDIATION GUIDE: banned-magic-suppression\n' +
          '1. Root Cause: An attempt was made to suppress magic number auditing through non-canonical comments or file headers.\n' +
          '2. Diagnosis: Check for comments attempting to disable the magic numbers rule.\n' +
          '3. Canonical Solution: Extract numeric values into semantic constants or import them from design tokens.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Banned:  /' + '/ magic-ok\n' +
          '   ✅ Clean:   export const NETWORK_RETRY_DELAY_MS = 5000;',
        'banned-style-suppression':
          '📖 REMEDIATION GUIDE: banned-style-suppression\n' +
          '1. Root Cause: A global stylelint-disable suppression was detected in the file header or style block.\n' +
          '2. Diagnosis: Inspect stylelint-disable directives in .css, .scss, or Vue <style> blocks.\n' +
          '3. Canonical Solution: Fix CSS properties, nesting, or z-index values according to design guidelines. Do not disable Stylelint for entire files.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Use system z-index variables or correct the selector.',
        'header-auditor-escape':
          '📖 REMEDIATION GUIDE: header-auditor-escape\n' +
          '1. Root Cause: An auditor escape hatch was placed in the file header.\n' +
          '2. Diagnosis: Check for legacy escape hatch comments in file headers or imports.\n' +
          '3. Canonical Solution: Remove the escape hatch entirely. Escape hatches are permanently eradicated from the architecture; solve the issue legitimately in source code.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Delete the legacy escape comment and refactor code to satisfy architectural rules cleanly.',
        'unjustified-escape-hatch':
          '📖 REMEDIATION GUIDE: unjustified-escape-hatch\n' +
          '1. Root Cause: An escape hatch was used without technical justification or used to mask domain type defects.\n' +
          '2. Diagnosis: Check the escape hatch reported without valid explanation.\n' +
          '3. Canonical Solution: DO NOT USE ESCAPE HATCHES. Replace with canonical semantic types from @francogp/auditor:\n' +
          '   - DisplayText, LocalizedText, HexColor, AssetUri, IsoDateString, CssClassName, JsonObject, DomElementId, UserUuid\n' +
          '4. Example / Auto-fix command:\n' +
          '   Use canonical semantic data types instead of // *-ok: comments.'
      }
    });
  }

  public getViolations(): readonly HeaderViolation[] {
    return this.collectedViolations;
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // 1. fallow-ignore
    this.runSubAuditorSync('file-level-fallow-ignore', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (FALLOW_IGNORE_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-fallow-ignore' as const,
            message: `Illegal 'fallow-ignore' directive detected. Silencing audits with fallow-ignore is STRICTLY PROHIBITED. Resolve the issue in source code or configure fallow cleanly.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 2. banned-ts-suppression
    this.runSubAuditorSync('banned-ts-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (TS_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-ts-suppression' as const,
            message: `TypeScript suppression detected ('@ts-ignore/@ts-nocheck/@ts-expect-error'). Prohibited under Zero-Ignore policy.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 3. file-level-eslint-disable
    this.runSubAuditorSync('file-level-eslint-disable', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (ESLINT_DISABLE_BLOCK_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-eslint-disable' as const,
            message: `File-level '/* eslint-disable */' or '/* oxlint-disable */' block detected. Use line-scoped directives only when strictly justified.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        } else if (ESLINT_DISABLE_TEMPLATE_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'file-level-eslint-disable' as const,
            message: `Template-level '<!-- eslint-disable -->' or '<!-- oxlint-disable -->' directive detected. Avoid disabling rules across entire templates.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 4. banned-magic-suppression
    this.runSubAuditorSync('banned-magic-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (BANNED_MAGIC_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-magic-suppression' as const,
            message: `Banned magic number suppression detected ('/' + '/ no-magic', '/' + '/ magic-ok', '/' + '/ number-ok'). Centralize numbers into domain constants with 'as const' or explicit typing.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 5. banned-style-suppression
    this.runSubAuditorSync('banned-style-suppression', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (BANNED_STYLE_SUPPRESSION_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'banned-style-suppression' as const,
            message: `Banned style suppression detected ('/' + '/ style-inherited', '/' + '/ style-ok'). All .vue components MUST include their own <style lang="scss"> block per architecture governance.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 6. header-auditor-escape
    this.runSubAuditorSync('header-auditor-escape', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (STANDALONE_ESCAPE_HATCHES_REGEX.test(line)) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'header-auditor-escape' as const,
            message: `Orphan or misplaced escape hatch detected ('${line.trim()}'). Escape hatches must be on the same statement line or immediately preceding with ':' and the technical reason.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });

    // 7. unjustified-escape-hatch
    this.runSubAuditorSync('unjustified-escape-hatch', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const unjustifiedMatch = line.match(UNJUSTIFIED_ESCAPE_HATCH_REGEX);
        if (unjustifiedMatch) {
          const v = {
            file: relPath,
            line: i + 1,
            ruleId: 'unjustified-escape-hatch' as const,
            message: `[ZERO-ESCAPE MANDATE] Escape hatch '// ${unjustifiedMatch[1]}' detected. Escape hatches and ignore directives are permanently eradicated. Resolve static analysis defects legitimately in source code.`,
            context: line.trim(),
            severity: 'error' as const
          };
          this.collectedViolations.push(v);
          this.addViolation(v);
        }
      }
    });
  }
}

/**
 * Legacy procedural audit runner preserved for testing and external consumers.
 */
export function auditAuditHeaders(targetDir = process.cwd()): AuditHeadersResult {
  const config = getAuditConfig(targetDir);
  const scannableRoots = getEffectiveScannableRoots(config);
  const rootsToScan = scannableRoots.filter((r) => fs.existsSync(path.resolve(targetDir, r)));

  const auditor = new AuditHeadersAuditor({ projectRoot: targetDir, roots: rootsToScan });
  const files = auditor['context'].collectFiles(rootsToScan);
  for (const file of files) {
    const relPath = normalizePosixPath(path.relative(targetDir, file));
    const content = safeReadFileSync(file);
    if (content !== null) {
      auditor['recordScanned'](relPath);
      auditor['scanFile'](relPath, content);
    }
  }

  const violations = auditor.getViolations();
  const countsByRule: Record<string, number> = {};
  for (const r of HEADER_RULES) {
    countsByRule[r] = auditor.getCountsByRule().get(r) ?? 0;
  }

  return {
    filesScanned: auditor.getFilesScanned(),
    violations,
    passed: violations.length === 0,
    countsByRule
  };
}

// Direct CLI Execution Integration
await BaseAuditor.runCliIfMain(import.meta.url, new AuditHeadersAuditor());
