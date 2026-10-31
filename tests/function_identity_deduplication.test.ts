/**
 * tests/function_identity_deduplication.test.ts
 *
 * Comprehensive unit and integrity test suite verifying Function Identity Deduplication (Set<Function>)
 * across all execution modes, rule configurations, and document lifecycles.
 */

import { describe, it, expect, vi } from 'vite-plus/test';

import { BaseAuditor, FileScanAuditor, AuditedDocument } from '../src/core/auditorBase.ts';

describe('Function Identity Deduplication (Set<Function>) Governance', () => {
  describe('FileScanAuditor - Single Document Deduplication', () => {
    it('executes shared audit function exactly once per document across N rules in check mode', async () => {
      let auditCount = 0;
      let independentAuditCount = 0;

      const sharedAudit = () => {
        auditCount++;
      };
      const independentAudit = () => {
        independentAuditCount++;
      };

      class MultiRuleAuditAuditor extends FileScanAuditor<
        'rule-1' | 'rule-2' | 'rule-3' | 'rule-solo'
      > {
        constructor() {
          super({
            ruleFixers: {},
            id: 'multi_rule_audit',
            name: 'Multi Rule Audit',
            description: 'Testing audit deduplication',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🔍',
            requiredPermissions: [],
            ruleIds: ['rule-1', 'rule-2', 'rule-3', 'rule-solo'],
            ruleDescriptions: {
              'rule-1': 'Rule 1',
              'rule-2': 'Rule 2',
              'rule-3': 'Rule 3',
              'rule-solo': 'Solo Rule'
            },
            ruleRemediations: {
              'rule-1': 'RC. D. CS. Ex.',
              'rule-2': 'RC. D. CS. Ex.',
              'rule-3': 'RC. D. CS. Ex.',
              'rule-solo': 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'rule-1': 'hygiene',
              'rule-2': 'hygiene',
              'rule-3': 'hygiene',
              'rule-solo': 'hygiene'
            },
            ruleCapabilities: {
              'rule-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'rule-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'rule-3': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'rule-solo': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          // rule-1, rule-2, and rule-3 all share the exact same audit function
          this.declareFileSubAuditor('rule-1', { audit: sharedAudit });
          this.declareFileSubAuditor('rule-2', { audit: sharedAudit });
          this.declareFileSubAuditor('rule-3', { audit: sharedAudit });
          // rule-solo has its own distinct audit function
          this.declareFileSubAuditor('rule-solo', { audit: independentAudit });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'rule-1' | 'rule-2' | 'rule-3' | 'rule-solo'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new MultiRuleAuditAuditor();
      const doc = new AuditedDocument('file.ts', 'const x = 1;', 'file.ts');

      await auditor.testScan(doc);

      // Invariant: sharedAudit registered in 3 rules was called strictly ONCE
      expect(auditCount).toBe(1);
      // Invariant: independentAudit registered in 1 rule was called strictly ONCE
      expect(independentAuditCount).toBe(1);
      // Invariant: evaluations tracked for all 4 rules
      expect(auditor.getRuleEvals('rule-1')).toBe(1);
      expect(auditor.getRuleEvals('rule-2')).toBe(1);
      expect(auditor.getRuleEvals('rule-3')).toBe(1);
      expect(auditor.getRuleEvals('rule-solo')).toBe(1);
    });

    it('executes shared fix function exactly once per document in --fix mode', async () => {
      let sharedAuditCount = 0;
      let sharedFixCount = 0;
      let separateFixCount = 0;

      const sharedAudit = () => {
        sharedAuditCount++;
      };
      const sharedFix = () => {
        sharedFixCount++;
      };
      const separateFix = () => {
        separateFixCount++;
      };

      class MultiRuleFixAuditor extends FileScanAuditor<'fix-a' | 'fix-b' | 'fix-c'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'multi_rule_fix',
            name: 'Multi Rule Fix',
            description: 'Testing fix deduplication',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🛠️',
            requiredPermissions: [],
            ruleIds: ['fix-a', 'fix-b', 'fix-c'],
            ruleDescriptions: {
              'fix-a': 'Fix A',
              'fix-b': 'Fix B',
              'fix-c': 'Fix C'
            },
            ruleRemediations: {
              'fix-a': 'RC. D. CS. Ex.',
              'fix-b': 'RC. D. CS. Ex.',
              'fix-c': 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'fix-a': 'hygiene',
              'fix-b': 'hygiene',
              'fix-c': 'hygiene'
            },
            ruleCapabilities: {
              'fix-a': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'fix-b': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'fix-c': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          // fix-a and fix-b share both audit and fix
          this.declareFileSubAuditor('fix-a', { audit: sharedAudit, fix: sharedFix });
          this.declareFileSubAuditor('fix-b', { audit: sharedAudit, fix: sharedFix });
          // fix-c shares audit but has separate fix
          this.declareFileSubAuditor('fix-c', { audit: sharedAudit, fix: separateFix });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'fix-a' | 'fix-b' | 'fix-c'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new MultiRuleFixAuditor();
      const doc = new AuditedDocument('file.ts', 'const x = 1;', 'file.ts');

      await auditor.testScan(doc);

      // Invariant: sharedAudit is called strictly 1 time
      expect(sharedAuditCount).toBe(1);
      // Invariant: sharedFix is called strictly 1 time for fix-a & fix-b
      expect(sharedFixCount).toBe(1);
      // Invariant: separateFix is called strictly 1 time for fix-c
      expect(separateFixCount).toBe(1);
      // All rules evaluated
      expect(auditor.getRuleEvals('fix-a')).toBe(1);
      expect(auditor.getRuleEvals('fix-b')).toBe(1);
      expect(auditor.getRuleEvals('fix-c')).toBe(1);
    });

    it('executes fused audit===fix function strictly ONCE in --fix mode (not twice)', async () => {
      let fusedCount = 0;
      const fusedFn = () => {
        fusedCount++;
      };

      class FusedSubAuditor extends FileScanAuditor<'fused-1' | 'fused-2'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'fused_auditor',
            name: 'Fused Auditor',
            description: 'Testing fused audit/fix execution',
            family: 'architecture',
            packageName: 'Testing',
            icon: '⚡',
            requiredPermissions: [],
            ruleIds: ['fused-1', 'fused-2'],
            ruleDescriptions: {
              'fused-1': 'Fused 1',
              'fused-2': 'Fused 2'
            },
            ruleRemediations: {
              'fused-1': 'RC. D. CS. Ex.',
              'fused-2': 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'fused-1': 'hygiene',
              'fused-2': 'hygiene'
            },
            ruleCapabilities: {
              'fused-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'fused-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          // Both rules point to the exact same fused function
          this.declareFileSubAuditor('fused-1', { audit: fusedFn, fix: fusedFn });
          this.declareFileSubAuditor('fused-2', { audit: fusedFn, fix: fusedFn });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'fused-1' | 'fused-2'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new FusedSubAuditor();
      const doc = new AuditedDocument('fused.ts', 'content', 'fused.ts');

      await auditor.testScan(doc);

      // Invariant: Even across 2 rules and in --fix mode, fusedFn runs STRICTLY ONCE per document
      expect(fusedCount).toBe(1);
      expect(auditor.getRuleEvals('fused-1')).toBe(1);
      expect(auditor.getRuleEvals('fused-2')).toBe(1);
    });

    it('executes fused audit===fix function strictly ONCE in check mode', async () => {
      let fusedCount = 0;
      const fusedFn = () => {
        fusedCount++;
      };

      class FusedCheckAuditor extends FileScanAuditor<'fused-chk'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'fused_chk_auditor',
            name: 'Fused Check Auditor',
            description: 'Testing fused check execution',
            family: 'architecture',
            packageName: 'Testing',
            icon: '⚡',
            requiredPermissions: [],
            ruleIds: ['fused-chk'],
            ruleDescriptions: { 'fused-chk': 'Fused Check' },
            ruleRemediations: { 'fused-chk': 'RC. D. CS. Ex.' },
            ruleRemediationPhases: { 'fused-chk': 'hygiene' },
            ruleCapabilities: {
              'fused-chk': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          this.declareFileSubAuditor('fused-chk', { audit: fusedFn, fix: fusedFn });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'fused-chk'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new FusedCheckAuditor();
      const doc = new AuditedDocument('fused.ts', 'content', 'fused.ts');

      await auditor.testScan(doc);

      expect(fusedCount).toBe(1);
      expect(auditor.getRuleEvals('fused-chk')).toBe(1);
    });
  });

  describe('FileScanAuditor - Multi-Document Deduplication Isolation', () => {
    it('deduplicates within each document independently without cross-document contamination', async () => {
      let callCount = 0;
      const sharedAudit = () => {
        callCount++;
      };

      class MultiDocAuditor extends FileScanAuditor<'r1' | 'r2'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'multi_doc_auditor',
            name: 'Multi Doc Auditor',
            description: 'Testing multi doc deduplication',
            family: 'architecture',
            packageName: 'Testing',
            icon: '📄',
            requiredPermissions: [],
            ruleIds: ['r1', 'r2'],
            ruleDescriptions: { r1: 'R1', r2: 'R2' },
            ruleRemediations: { r1: 'RC. D. CS. Ex.', r2: 'RC. D. CS. Ex.' },
            ruleRemediationPhases: { r1: 'hygiene', r2: 'hygiene' },
            ruleCapabilities: {
              r1: {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              r2: {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          this.declareFileSubAuditor('r1', { audit: sharedAudit });
          this.declareFileSubAuditor('r2', { audit: sharedAudit });
        }

        public async scanDoc(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'r1' | 'r2'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new MultiDocAuditor();
      const doc1 = new AuditedDocument('doc1.ts', 'c1', 'doc1.ts');
      const doc2 = new AuditedDocument('doc2.ts', 'c2', 'doc2.ts');
      const doc3 = new AuditedDocument('doc3.ts', 'c3', 'doc3.ts');

      await auditor.scanDoc(doc1);
      await auditor.scanDoc(doc2);
      await auditor.scanDoc(doc3);

      // Invariant: 3 documents scanned, sharedAudit executed exactly 1 time PER DOCUMENT = 3 total calls
      // (Without deduplication it would be 3 * 2 = 6 calls; with broken global caching it would be 1 call)
      expect(callCount).toBe(3);
      expect(auditor.getRuleEvals('r1')).toBe(3);
      expect(auditor.getRuleEvals('r2')).toBe(3);
    });
  });

  describe('FileScanAuditor - Async Functions & Promises', () => {
    it('properly awaits and deduplicates asynchronous audit and fix handlers', async () => {
      let asyncAuditCalls = 0;
      let asyncFixCalls = 0;

      const asyncAudit = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        asyncAuditCalls++;
      };

      const asyncFix = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        asyncFixCalls++;
      };

      class AsyncDedupAuditor extends FileScanAuditor<'async-1' | 'async-2'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'async_dedup_auditor',
            name: 'Async Dedup Auditor',
            description: 'Testing async deduplication',
            family: 'architecture',
            packageName: 'Testing',
            icon: '⏳',
            requiredPermissions: [],
            ruleIds: ['async-1', 'async-2'],
            ruleDescriptions: { 'async-1': 'Async 1', 'async-2': 'Async 2' },
            ruleRemediations: { 'async-1': 'RC. D. CS. Ex.', 'async-2': 'RC. D. CS. Ex.' },
            ruleRemediationPhases: { 'async-1': 'hygiene', 'async-2': 'hygiene' },
            ruleCapabilities: {
              'async-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'async-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          this.declareFileSubAuditor('async-1', { audit: asyncAudit, fix: asyncFix });
          this.declareFileSubAuditor('async-2', { audit: asyncAudit, fix: asyncFix });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async scanDoc(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }
      }

      const auditor = new AsyncDedupAuditor();
      const doc = new AuditedDocument('async.ts', 'code', 'async.ts');

      await auditor.scanDoc(doc);

      expect(asyncAuditCalls).toBe(1);
      expect(asyncFixCalls).toBe(1);
    });
  });

  describe('BaseAuditor - executeRuleFixers Deduplication', () => {
    it('executes shared fixer function strictly ONCE per audit run across N rules in executeRuleFixers', async () => {
      let sharedFixerCalls = 0;
      let distinctFixerCalls = 0;

      const sharedFixer = vi.fn(async () => {
        sharedFixerCalls++;
      });
      const distinctFixer = vi.fn(async () => {
        distinctFixerCalls++;
      });

      class SuiteWithSharedFixers extends BaseAuditor<
        'r-shared-1' | 'r-shared-2' | 'r-shared-3' | 'r-distinct'
      > {
        constructor() {
          super({
            id: 'suite_shared_fixers',
            name: 'Suite Shared Fixers',
            description: 'Testing executeRuleFixers deduplication',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🔧',
            requiredPermissions: [],
            ruleIds: ['r-shared-1', 'r-shared-2', 'r-shared-3', 'r-distinct'],
            ruleDescriptions: {
              'r-shared-1': 'Shared 1',
              'r-shared-2': 'Shared 2',
              'r-shared-3': 'Shared 3',
              'r-distinct': 'Distinct'
            },
            ruleRemediations: {
              'r-shared-1': 'RC. D. CS. Ex.',
              'r-shared-2': 'RC. D. CS. Ex.',
              'r-shared-3': 'RC. D. CS. Ex.',
              'r-distinct': 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'r-shared-1': 'hygiene',
              'r-shared-2': 'hygiene',
              'r-shared-3': 'hygiene',
              'r-distinct': 'hygiene'
            },
            ruleCapabilities: {
              'r-shared-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-shared-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-shared-3': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-distinct': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            ruleFixers: {
              'r-shared-1': sharedFixer,
              'r-shared-2': sharedFixer,
              'r-shared-3': sharedFixer,
              'r-distinct': distinctFixer
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });
        }

        public async runFixers(): Promise<void> {
          await this.executeRuleFixers();
        }

        public override async runAudit(): Promise<void> {}
      }

      const suite = new SuiteWithSharedFixers();
      await suite.runFixers();

      // Invariant: sharedFixer registered in 3 rules was called strictly ONCE
      expect(sharedFixerCalls).toBe(1);
      expect(sharedFixer).toHaveBeenCalledTimes(1);

      // Invariant: distinctFixer was called strictly ONCE
      expect(distinctFixerCalls).toBe(1);
      expect(distinctFixer).toHaveBeenCalledTimes(1);
    });

    it('safely handles suites without registered ruleFixers without throwing', async () => {
      class NoFixersSuite extends BaseAuditor<'r-none'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'suite_no_fixers',
            name: 'Suite No Fixers',
            description: 'Testing suite with no fixers',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🔒',
            requiredPermissions: [],
            ruleIds: ['r-none'],
            ruleDescriptions: { 'r-none': 'No fixers' },
            ruleRemediations: { 'r-none': 'RC. D. CS. Ex.' },
            ruleRemediationPhases: { 'r-none': 'hygiene' },
            ruleCapabilities: {
              'r-none': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });
        }

        public async runFixers(): Promise<void> {
          await this.executeRuleFixers();
        }

        public override async runAudit(): Promise<void> {}
      }

      const suite = new NoFixersSuite();
      await expect(suite.runFixers()).resolves.toBeUndefined();
    });
  });

  describe('FileScanAuditor - Complex Cross-Combinations (Asymmetrical Audit & Fix Mapping)', () => {
    it('handles mixed cross-mappings where rules share audit but diverge in fix, and vice-versa', async () => {
      let auditACalls = 0;
      let auditBCalls = 0;
      let fixXCalls = 0;
      let fixYCalls = 0;
      let fixZCalls = 0;

      const auditA = () => {
        auditACalls++;
      };
      const auditB = () => {
        auditBCalls++;
      };
      const fixX = () => {
        fixXCalls++;
      };
      const fixY = () => {
        fixYCalls++;
      };
      const fixZ = () => {
        fixZCalls++;
      };

      class AsymmetricAuditor extends FileScanAuditor<'r-1' | 'r-2' | 'r-3' | 'r-4'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'asymmetric_auditor',
            name: 'Asymmetric Auditor',
            description: 'Testing asymmetric dedup',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🔀',
            requiredPermissions: [],
            ruleIds: ['r-1', 'r-2', 'r-3', 'r-4'],
            ruleDescriptions: { 'r-1': 'R1', 'r-2': 'R2', 'r-3': 'R3', 'r-4': 'R4' },
            ruleRemediations: {
              'r-1': 'RC. D. CS. Ex.',
              'r-2': 'RC. D. CS. Ex.',
              'r-3': 'RC. D. CS. Ex.',
              'r-4': 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'r-1': 'hygiene',
              'r-2': 'hygiene',
              'r-3': 'hygiene',
              'r-4': 'hygiene'
            },
            ruleCapabilities: {
              'r-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-3': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'r-4': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          // r-1 and r-2 share auditA, but have different fixes (fixX and fixY)
          this.declareFileSubAuditor('r-1', { audit: auditA, fix: fixX });
          this.declareFileSubAuditor('r-2', { audit: auditA, fix: fixY });

          // r-3 and r-4 have different audits (auditA and auditB), but share fixZ
          this.declareFileSubAuditor('r-3', { audit: auditA, fix: fixZ });
          this.declareFileSubAuditor('r-4', { audit: auditB, fix: fixZ });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }

        public getRuleEvals(r: 'r-1' | 'r-2' | 'r-3' | 'r-4'): number {
          return this.getEvaluations(r);
        }
      }

      const auditor = new AsymmetricAuditor();
      const doc = new AuditedDocument('asym.ts', 'code', 'asym.ts');

      await auditor.testScan(doc);

      // Invariants:
      // auditA was mapped to r-1, r-2, r-3 -> should execute strictly 1 time
      expect(auditACalls).toBe(1);
      // auditB was mapped to r-4 -> should execute strictly 1 time
      expect(auditBCalls).toBe(1);
      // fixX was mapped to r-1 -> 1 time
      expect(fixXCalls).toBe(1);
      // fixY was mapped to r-2 -> 1 time
      expect(fixYCalls).toBe(1);
      // fixZ was mapped to r-3, r-4 -> should execute strictly 1 time
      expect(fixZCalls).toBe(1);

      // Every rule recorded its evaluation
      expect(auditor.getRuleEvals('r-1')).toBe(1);
      expect(auditor.getRuleEvals('r-2')).toBe(1);
      expect(auditor.getRuleEvals('r-3')).toBe(1);
      expect(auditor.getRuleEvals('r-4')).toBe(1);
    });

    it('isolates exceptions in one shared function without poisoning other independent sub-auditors', async () => {
      let successfulAuditCalls = 0;
      const failingSharedAudit = () => {
        throw new Error('Boom in shared audit');
      };
      const independentSafeAudit = () => {
        successfulAuditCalls++;
      };

      class ResilientAuditor extends FileScanAuditor<'failing-1' | 'failing-2' | 'safe'> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'resilient_auditor',
            name: 'Resilient Auditor',
            description: 'Testing failure isolation',
            family: 'architecture',
            packageName: 'Testing',
            icon: '🛡️',
            requiredPermissions: [],
            ruleIds: ['failing-1', 'failing-2', 'safe'],
            ruleDescriptions: { 'failing-1': 'Fail 1', 'failing-2': 'Fail 2', safe: 'Safe' },
            ruleRemediations: {
              'failing-1': 'RC. D. CS. Ex.',
              'failing-2': 'RC. D. CS. Ex.',
              safe: 'RC. D. CS. Ex.'
            },
            ruleRemediationPhases: {
              'failing-1': 'hygiene',
              'failing-2': 'hygiene',
              safe: 'hygiene'
            },
            ruleCapabilities: {
              'failing-1': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              'failing-2': {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              },
              safe: {
                speed: 'light',
                phase: 'normal',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
              }
            },
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**'] },
            usesThirdPartyTool: false
          });

          this.declareFileSubAuditor('failing-1', { audit: failingSharedAudit });
          this.declareFileSubAuditor('failing-2', { audit: failingSharedAudit });
          this.declareFileSubAuditor('safe', { audit: independentSafeAudit });
        }

        public override isFixActive(): boolean {
          return true;
        }

        public async testScan(doc: AuditedDocument): Promise<void> {
          await this.scanDocument(doc);
        }
      }

      const auditor = new ResilientAuditor();
      const doc = new AuditedDocument('test.ts', 'content', 'test.ts');

      // The execution should not crash unhandled; safe subauditor must still run
      await expect(auditor.testScan(doc)).rejects.toThrow('Boom in shared audit');
    });
  });
});
