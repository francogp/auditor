/**
 * tests/node/auditors/audit_metadata_contract.test.ts
 *
 * Dedicated unit test suite verifying the Audit Metadata and Anti-Staleness contract:
 * - AuditRunMetadata integrity and fields
 * - assertAuditorExecuted behavior on missing meta, partial audits, and omitted suites
 * - Success assertion on fully executed suites
 */

import { describe, it, expect } from 'vitest';
import {
  assertAuditorExecuted,
  type ConsolidatedAuditReport,
  type AuditRunMetadata
} from '../src/core/auditContract.ts';

describe('Audit Metadata & Anti-Staleness Contract', () => {
  const createMockReport = (overrides: Partial<AuditRunMetadata> = {}): ConsolidatedAuditReport => ({
    meta: {
      version: '2.0.0',
      timestamp: Temporal.Now.instant().toString(),
      isFullAudit: true,
      runMode: 'full',
      preset: null,
      targetFamily: null,
      totalDiscoveredSuites: 35,
      executedSuiteCount: 35,
      executedSuites: ['audit_project', 'validate_domain_types', 'validate_markdown_links'],
      omittedSuites: [],
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd()
      },
      ...overrides
    },
    status: 'passed',
    summary: {
      totalViolations: 0,
      errors: 0,
      warnings: 0,
      suitesTotal: 35,
      suitesPassed: 35,
      suitesFailed: 0,
      durationMs: 1200
    },
    families: {
      architecture: { title: 'Architecture', suites: [] },
      domain_data: { title: 'Domain Data', suites: [] },
      persistence: { title: 'Persistence', suites: [] },
      documentation: { title: 'Documentation', suites: [] }
    },
    allFindings: []
  });

  describe('assertAuditorExecuted', () => {
    it('throws when report is null or undefined', () => {
      expect(() => assertAuditorExecuted(null, 'audit_project', 'TestConsumer'))
        .toThrowError(/no contiene la cabecera de metadatos 'meta'/);

      expect(() => assertAuditorExecuted(undefined, 'audit_project', 'TestConsumer'))
        .toThrowError(/no contiene la cabecera de metadatos 'meta'/);
    });

    it('throws when report.meta is missing', () => {
      const corruptReport = { status: 'passed' as const };
      expect(() => assertAuditorExecuted(corruptReport, 'audit_project', 'TestConsumer'))
        .toThrowError(/no contiene la cabecera de metadatos 'meta'/);
    });

    it('throws when suite was omitted in a partial audit (runMode: preset)', () => {
      const partialReport = createMockReport({
        isFullAudit: false,
        runMode: 'preset',
        preset: 'md',
        executedSuiteCount: 5,
        executedSuites: ['validate_markdown_links', 'validate_markdown_lint'],
        omittedSuites: ['audit_project', 'validate_domain_types']
      });

      expect(() => assertAuditorExecuted(partialReport, 'audit_project', 'ComplexityReport'))
        .toThrowError(/\[ComplexityReport\] La suite requerida 'audit_project' NO fue ejecutada en la última auditoría/);
    });

    it('throws when suite is not in executedSuites even if omittedSuites is empty', () => {
      const report = createMockReport({
        isFullAudit: false,
        runMode: 'single',
        executedSuites: ['validate_markdown_links'],
        omittedSuites: []
      });

      expect(() => assertAuditorExecuted(report, 'audit_project', 'FallowReport'))
        .toThrowError(/\[FallowReport\] La suite requerida 'audit_project' NO fue ejecutada/);
    });

    it('throws when report timestamp is older than 5 minutes (stale audit)', () => {
      const sixMinutesAgo = Temporal.Now.instant().subtract({ minutes: 6 }).toString();
      const staleReport = createMockReport({ timestamp: sixMinutesAgo });

      expect(() => assertAuditorExecuted(staleReport, 'audit_project', 'ComplexityReport'))
        .toThrowError(/\[ComplexityReport\] scratch\/audits\/latest_audit\.json está OBSOLETO \(6 minutos de antigüedad, límite: 5 min\)/);
    });

    it('allows stale report if allowStale option is explicitly set to true', () => {
      const tenMinutesAgo = Temporal.Now.instant().subtract({ minutes: 10 }).toString();
      const staleReport = createMockReport({ timestamp: tenMinutesAgo });

      expect(() => assertAuditorExecuted(staleReport, 'audit_project', 'ComplexityReport', { allowStale: true }))
        .not.toThrow();
    });

    it('succeeds without throwing when suite was executed and is not omitted', () => {
      const fullReport = createMockReport();
      expect(() => assertAuditorExecuted(fullReport, 'audit_project', 'ComplexityReport')).not.toThrow();
      expect(() => assertAuditorExecuted(fullReport, 'validate_domain_types', 'DomainTypesChecker')).not.toThrow();
    });
  });
});
