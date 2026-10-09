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
import { FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { isTestFileForCodeAudit } from '../../core/auditPathPredicates.ts';
import { isCommentLine } from '../../analyzers/auditRuleTypes.ts';

enableCompileCache();

export const PERSISTENCE_CLIENT_RULES = [
  'persistence-client-uncoordinated-save',
  'persistence-client-untyped-key',
  'persistence-client-unhandled-quota-error'
] as const;

export type PersistenceClientRuleId = (typeof PERSISTENCE_CLIENT_RULES)[number];

export interface ValidatePersistenceClientOptions {
  projectRoot?: string;
  roots?: readonly string[];
  authorizedSaveFiles?: readonly string[];
  saveKeyPrefixes?: readonly string[];
}

const EXTENSIONS = new Set(['.ts', '.vue']);

const P_STORAGE_SET_ITEM = /\b(?:localStorage|sessionStorage)\.setItem\s*\(\s*([^,\s][^,]*),/g;

export class ValidatePersistenceClientAuditor extends FileScanAuditor<PersistenceClientRuleId> {
  private readonly authorizedSaveFiles: ReadonlySet<string>;
  private readonly saveKeyPrefixes: readonly string[];

  constructor(options?: string | ValidatePersistenceClientOptions) {
    const rootPath = typeof options === 'string' ? options : options?.projectRoot;
    const cfg = getAuditConfig(rootPath);
    const codeRoots = typeof options === 'object' && options?.roots ? options.roots : (cfg.paths.codeRoots ?? ['src']);
    const customAuthorized = typeof options === 'object' && options?.authorizedSaveFiles ? options.authorizedSaveFiles : cfg.persistence?.authorizedSaveFiles ?? [];
    const customPrefixes = typeof options === 'object' && options?.saveKeyPrefixes ? options.saveKeyPrefixes : cfg.persistence?.saveKeyPrefixes ?? [];

    super({
      capabilities: { lint: true, ast: false, fix: false, heavy: false },
      id: 'validate_persistence_client',
      name: 'Client-Side Web Storage & Persistence Hygiene',
      description: 'Gobernanza de localStorage, cuotas y tipado de claves',
      family: 'persistence',
      ruleIds: PERSISTENCE_CLIENT_RULES,
      packageName: 'Storage',
      icon: '🗄️',
      configKey: 'persistence.enabled',
      defaultConfig: { enabled: true },
      ruleDescriptions: {
        'persistence-client-uncoordinated-save': 'Escritura no coordinada en storage',
        'persistence-client-untyped-key': 'Clave de storage no tipada',
        'persistence-client-unhandled-quota-error': 'SetItem sin captura de cuota'
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

  protected override scanFile(file: string, content: string): void {
    const config = getAuditConfig(this.projectRoot);
    if (config.persistence?.engine === 'none') {
      return;
    }

    if (isTestFileForCodeAudit(file, this.projectRoot)) return;

    const lines = content.split('\n');
    const isAuthorizedFile = this.isAuthorizedSaveFile(file);

    P_STORAGE_SET_ITEM.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = P_STORAGE_SET_ITEM.exec(content)) !== null) {
      const matchIndex = match.index;
      const lineNum = content.slice(0, matchIndex).split('\n').length;
      const line = lines[lineNum - 1] ?? '';

      if (isCommentLine(line.trim()) || this.hasStorageEscapeHatch(line)) continue;

      const rawKeyArg = match[1]?.trim() ?? '';

      // Check 1: Uncoordinated save bypass
      if (!isAuthorizedFile && this.saveKeyPrefixes.length > 0) {
        const matchesSavePrefix = this.saveKeyPrefixes.some(prefix =>
          rawKeyArg.includes(`'${prefix}`) ||
          rawKeyArg.includes(`"${prefix}`) ||
          rawKeyArg.includes(`\`${prefix}`)
        );

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
      }

      // Check 2: Untyped string key literal
      const isLiteralStringKey = /^['"`][\w$-]+['"`]$/.test(rawKeyArg);
      if (isLiteralStringKey) {
        this.addViolationAtMatch({
          ruleId: 'persistence-client-untyped-key',
          filePath: file,
          content,
          matchIndex,
          message: `Storage key ${rawKeyArg} is a raw string literal — use typed constant or enum from canonical storage definitions.`,
          context: line.trim()
        });
      }

      // Check 3: SetItem without try/catch handling for QuotaExceededError
      if (!this.isInsideTryCatch(content, matchIndex)) {
        this.addViolationAtMatch({
          ruleId: 'persistence-client-unhandled-quota-error',
          filePath: file,
          content,
          matchIndex,
          message: `Web storage mutation '.setItem()' must be wrapped in try/catch to guard against QuotaExceededError on full or private storage.`,
          context: line.trim()
        });
      }
    }
  }

  private isAuthorizedSaveFile(file: string): boolean {
    const normalized = file.split('\\').join('/');
    return Array.from(this.authorizedSaveFiles).some(auth => normalized.endsWith(auth) || normalized.includes(auth));
  }

  private hasStorageEscapeHatch(line: string): boolean {
    return line.includes('// storage-ok:') || line.includes('/* storage-ok:');
  }

  private isInsideTryCatch(content: string, position: number): boolean {
    const preceding = content.slice(0, position);
    const tryIndex = preceding.lastIndexOf('try');
    if (tryIndex === -1) return false;

    // Check if there is an unclosed try block between tryIndex and position
    const textBetween = content.slice(tryIndex, position);
    let openBraces = 0;
    for (const char of textBetween) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
    }
    return openBraces > 0;
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidatePersistenceClientAuditor());
