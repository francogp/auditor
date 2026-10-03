/**
 * tests/reproduce_demo_roots_magic_numbers.test.ts
 *
 * Reproduction test for first-class paths.demoRoots support.
 * Strictly adheres to Gate 1 of /systematic-debugging:
 * Assert that configuring paths.demoRoots cleanly exempts files under demoRoots
 * from magicNumbers without needing manual constants.exemptGlobs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  defineAuditConfig,
  setAuditConfig,
  resetAuditConfig
} from '../src/core/auditConfig.ts';
import { magicNumbers } from '../src/suites/architecture/audit_rules.ts';

describe('First-Class paths.demoRoots Governance', () => {
  beforeEach(() => {
    resetAuditConfig();
  });

  afterEach(() => {
    resetAuditConfig();
  });

  it('exempts files in paths.demoRoots from magicNumbers rule', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      paths: {
        srcRoots: ['src'],
        demoRoots: ['src/ui-demo', 'demo']
      },
      persistence: { engine: 'none', schemaQualified: false },
      styles: { zLayersEnabled: false }
    });
    setAuditConfig(config);

    const demoFilePath = 'src/ui-demo/components/MockCard.vue';
    const prodFilePath = 'src/components/RealCard.vue';
    const code = 'const demoWidth = 350;';

    const regex = new RegExp(magicNumbers.regex.source, magicNumbers.regex.flags);
    let match: RegExpExecArray | null;

    let demoFlagged = false;
    regex.lastIndex = 0;
    while ((match = regex.exec(code)) !== null) {
      if (magicNumbers.check?.(code, match, demoFilePath)) {
        demoFlagged = true;
      }
    }
    expect(demoFlagged).toBe(false);

    let prodFlagged = false;
    regex.lastIndex = 0;
    while ((match = regex.exec(code)) !== null) {
      if (magicNumbers.check?.(code, match, prodFilePath)) {
        prodFlagged = true;
      }
    }
    expect(prodFlagged).toBe(true);
  });
});
