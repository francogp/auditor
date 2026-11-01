/**
 * tests/config_ratchet_hardening_subsumption.test.ts
 *
 * Unit tests verifying that narrowing blanket directory globs (e.g. database/migrations/**)
 * to specific files (e.g. database/migrations/xxx.sql) is recognized as HARDENING
 * (zero relaxation, zero RELAX-xxxx required) across fields and subsystems.
 */

import { describe, it, expect } from 'vite-plus/test';

import {
  inspectAuditConfigChanges,
  collectAllOnlinePathExemptions,
  isPathCoveredByOnlineExemptions
} from '../src/core/configRatchet.ts';

describe('Config Ratchet Hardening & Subsumption', () => {
  describe('collectAllOnlinePathExemptions', () => {
    it('gathers all path exemptions from root and subsystems', () => {
      const onlineConfig = {
        paths: {
          ignoreGlobs: ['scratch/**', 'database/migrations/**'],
          dataRoots: ['src/data']
        },
        encoding: {
          exemptGlobs: ['database/backups/**']
        },
        fallow: {
          ignoreGlobs: ['.agents/**']
        }
      };

      const collected = collectAllOnlinePathExemptions(onlineConfig);
      expect(collected.has('scratch/**')).toBe(true);
      expect(collected.has('database/migrations/**')).toBe(true);
      expect(collected.has('src/data')).toBe(true);
      expect(collected.has('database/backups/**')).toBe(true);
      expect(collected.has('.agents/**')).toBe(true);
    });
  });

  describe('isPathCoveredByOnlineExemptions', () => {
    it('detects a specific SQL file is covered by an online directory glob', () => {
      const onlineExemptions = new Set(['database/migrations/**']);
      const isCovered = isPathCoveredByOnlineExemptions(
        'database/migrations/20260611120000_migrate_save_v3_ids.sql',
        new Set(),
        onlineExemptions
      );
      expect(isCovered).toBe(true);
    });

    it('rejects a file outside any online exemption', () => {
      const onlineExemptions = new Set(['database/migrations/**']);
      const isCovered = isPathCoveredByOnlineExemptions(
        'src/services/unauthorized.ts',
        new Set(),
        onlineExemptions
      );
      expect(isCovered).toBe(false);
    });
  });

  describe('inspectAuditConfigChanges Subsumption Scenarios', () => {
    it('recognizes replacing database/migrations/** in paths.ignoreGlobs with a specific file in encoding.exemptFiles as HARDENING', () => {
      const onlineConfig = {
        paths: {
          ignoreGlobs: ['scratch/**', 'database/migrations/**']
        },
        encoding: {
          enabled: true,
          exemptGlobs: ['database/backups/**']
        }
      };

      // Local config narrows the blanket ignore down to a single specific migration file in encoding.exemptFiles
      const localConfig = {
        paths: {
          ignoreGlobs: ['scratch/**']
        },
        encoding: {
          enabled: true,
          exemptGlobs: ['database/backups/**'],
          exemptFiles: ['database/migrations/20260611120000_migrate_save_v3_ids.sql']
        }
      };

      const relaxations = inspectAuditConfigChanges(onlineConfig, localConfig);
      // Hardening: zero relaxations
      expect(relaxations).toHaveLength(0);
    });

    it('recognizes narrowing exemptGlobs in the same subsystem as HARDENING', () => {
      const onlineConfig = {
        encoding: {
          enabled: true,
          exemptGlobs: ['database/migrations/**']
        }
      };

      const localConfig = {
        encoding: {
          enabled: true,
          exemptGlobs: ['database/migrations/20260611120000_migrate_save_v3_ids.sql']
        }
      };

      const relaxations = inspectAuditConfigChanges(onlineConfig, localConfig);
      expect(relaxations).toHaveLength(0);
    });

    it('flags legitimate relaxations when adding an unexempted path', () => {
      const onlineConfig = {
        paths: {
          ignoreGlobs: ['scratch/**']
        }
      };

      const localConfig = {
        paths: {
          ignoreGlobs: ['scratch/**', 'src/new-unauthorized-bypass/**']
        }
      };

      const relaxations = inspectAuditConfigChanges(onlineConfig, localConfig);
      expect(relaxations).toHaveLength(1);
      expect(relaxations[0]?.path).toBe('paths.ignoreGlobs');
      expect(relaxations[0]?.description).toContain('Added 1 new exemption(s)');
    });

    it('recognizes narrowing ignorePatterns subsumed by online exemptions as hardening', () => {
      const onlineConfig = {
        paths: {
          ignoreGlobs: ['docs/**']
        }
      };

      const localConfig = {
        markdownLint: {
          ignorePatterns: ['docs/drafts/specific_note.md']
        }
      };

      const relaxations = inspectAuditConfigChanges(onlineConfig, localConfig);
      expect(relaxations).toHaveLength(0);
    });
  });
});
