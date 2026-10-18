import { describe, it, expect } from 'vite-plus/test';

import {
  REMEDIATION_PHASE_IDS,
  REMEDIATION_PHASES,
  isRemediationPhaseId,
  getRemediationPhaseMetadata
} from '../src/core/remediationPhases.ts';

describe('remediationPhases Core Engine', () => {
  it('declares exactly 7 canonical strategic phases in strict sequence', () => {
    expect(REMEDIATION_PHASE_IDS).toEqual([
      'setup',
      'prune',
      'dedup',
      'contracts',
      'behavior',
      'hygiene',
      'polish'
    ]);
  });

  it('provides complete metadata for every canonical phase', () => {
    for (let i = 0; i < REMEDIATION_PHASE_IDS.length; i++) {
      const phaseId = REMEDIATION_PHASE_IDS[i]!;
      const meta = REMEDIATION_PHASES[phaseId];
      expect(meta.id).toBe(phaseId);
      expect(meta.order).toBe(i + 1);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.rationale.length).toBeGreaterThan(0);
    }
  });

  it('validates phase ID strings accurately via isRemediationPhaseId', () => {
    for (const phaseId of REMEDIATION_PHASE_IDS) {
      expect(isRemediationPhaseId(phaseId)).toBe(true);
    }
    expect(isRemediationPhaseId('invalid')).toBe(false);
    expect(isRemediationPhaseId('')).toBe(false);
    expect(isRemediationPhaseId(123)).toBe(false);
    expect(isRemediationPhaseId(null)).toBe(false);
    expect(isRemediationPhaseId(undefined)).toBe(false);
  });

  it('retrieves phase metadata accurately via getRemediationPhaseMetadata', () => {
    const setupMeta = getRemediationPhaseMetadata('setup');
    expect(setupMeta.id).toBe('setup');
    expect(setupMeta.order).toBe(1);
    expect(setupMeta.icon).toBe('⚙️');

    const polishMeta = getRemediationPhaseMetadata('polish');
    expect(polishMeta.id).toBe('polish');
    expect(polishMeta.order).toBe(7);

    const dedupMeta = getRemediationPhaseMetadata('dedup');
    expect(dedupMeta.id).toBe('dedup');
    expect(dedupMeta.order).toBe(3);
    expect(dedupMeta.icon).toBe('🧩');

    const contractsMeta = getRemediationPhaseMetadata('contracts');
    expect(contractsMeta.id).toBe('contracts');
    expect(contractsMeta.order).toBe(4);
    expect(contractsMeta.icon).toBe('🔒');
  });

  it('guarantees unique icons and unique order numbers across all phases', () => {
    const orders = new Set<number>();
    const icons = new Set<string>();

    for (const phaseId of REMEDIATION_PHASE_IDS) {
      const meta = REMEDIATION_PHASES[phaseId];
      expect(orders.has(meta.order)).toBe(false);
      expect(icons.has(meta.icon)).toBe(false);
      orders.add(meta.order);
      icons.add(meta.icon);
    }

    expect(orders.size).toBe(REMEDIATION_PHASE_IDS.length);
    expect(icons.size).toBe(REMEDIATION_PHASE_IDS.length);
  });
});
