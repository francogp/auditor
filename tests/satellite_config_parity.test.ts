/**
 * tests/satellite_config_parity.test.ts
 *
 * Tests for the Universal Recursive Satellite Config Parity Engine.
 */

import { describe, expect, it } from 'vite-plus/test';

import {
  isGovernedSatelliteFile,
  deepCompareSatelliteConfig,
  mergeSatelliteConfigProjection,
  GOVERNED_SATELLITE_FILES
} from '../src/core/satelliteConfigParity.ts';

describe('satelliteConfigParity', () => {
  describe('isGovernedSatelliteFile', () => {
    it('recognizes all canonical governed satellite files', () => {
      for (const file of GOVERNED_SATELLITE_FILES) {
        expect(isGovernedSatelliteFile(file)).toBe(true);
        expect(isGovernedSatelliteFile(`sub/path/${file}`)).toBe(true);
        expect(isGovernedSatelliteFile(`C:\\project\\root\\${file}`)).toBe(true);
      }
    });

    it('rejects ordinary application or test source files', () => {
      expect(isGovernedSatelliteFile('src/index.ts')).toBe(false);
      expect(isGovernedSatelliteFile('src/components/Button.vue')).toBe(false);
      expect(isGovernedSatelliteFile('tests/app.test.ts')).toBe(false);
      expect(isGovernedSatelliteFile('package.json')).toBe(false);
      expect(isGovernedSatelliteFile('README.md')).toBe(false);
    });
  });

  describe('deepCompareSatelliteConfig', () => {
    it('returns empty diffs when satellite matches SSoT projection exactly', () => {
      const ssot = {
        duplicates: { nearMiss: true, mode: 'strict' },
        health: { maxCrap: 0 }
      };
      const actual = {
        duplicates: { nearMiss: true, mode: 'strict' },
        health: { maxCrap: 0 }
      };

      const diffs = deepCompareSatelliteConfig({
        ssotProjection: ssot,
        actualConfig: actual
      });

      expect(diffs).toHaveLength(0);
    });

    it('detects nested undeclared entries added clandestinely to satellite file', () => {
      const ssot = {
        duplicates: { nearMiss: true, mode: 'strict' }
      };
      const actual = {
        duplicates: {
          nearMiss: true,
          mode: 'strict',
          minLines: 20,
          minTokens: 120
        }
      };

      const diffs = deepCompareSatelliteConfig({
        ssotProjection: ssot,
        actualConfig: actual
      });

      expect(diffs).toHaveLength(2);
      expect(diffs.map((d) => d.path)).toEqual(['duplicates.minLines', 'duplicates.minTokens']);
      expect(diffs[0]?.kind).toBe('undeclared_entry');
      expect(diffs[0]?.message).toContain("Undeclared configuration entry 'duplicates.minLines'");
    });

    it('detects divergent values in nested properties', () => {
      const ssot = {
        duplicates: { mode: 'strict' },
        health: { maxCrap: 0 }
      };
      const actual = {
        duplicates: { mode: 'lenient' },
        health: { maxCrap: 500 }
      };

      const diffs = deepCompareSatelliteConfig({
        ssotProjection: ssot,
        actualConfig: actual
      });

      expect(diffs).toHaveLength(2);
      expect(diffs[0]?.path).toBe('duplicates.mode');
      expect(diffs[0]?.kind).toBe('divergent_value');
      expect(diffs[1]?.path).toBe('health.maxCrap');
      expect(diffs[1]?.kind).toBe('divergent_value');
    });

    it('respects allowedExtraKeys like $schema and extends', () => {
      const ssot = {
        duplicates: { mode: 'strict' }
      };
      const actual = {
        $schema: 'https://fallow.tools/schema/config.json',
        extends: ['some-preset'],
        duplicates: { mode: 'strict' }
      };

      const diffs = deepCompareSatelliteConfig({
        ssotProjection: ssot,
        actualConfig: actual,
        allowedExtraKeys: new Set(['$schema', 'extends'])
      });

      expect(diffs).toHaveLength(0);
    });
  });

  describe('mergeSatelliteConfigProjection', () => {
    it('projects SSoT values onto target and strips undeclared keys in governed sections', () => {
      const target: Record<string, unknown> = {
        $schema: 'https://schema.org',
        duplicates: {
          nearMiss: true,
          mode: 'lenient',
          minLines: 20
        },
        health: {
          maxCrap: 500
        }
      };

      const projection: Record<string, unknown> = {
        duplicates: {
          nearMiss: true,
          mode: 'strict'
        },
        health: {
          maxCrap: 0
        }
      };

      const modified = mergeSatelliteConfigProjection(target, projection);

      expect(modified).toBe(true);
      expect(target).toEqual({
        $schema: 'https://schema.org',
        duplicates: {
          nearMiss: true,
          mode: 'strict'
        },
        health: {
          maxCrap: 0
        }
      });
      expect((target.duplicates as Record<string, unknown>).minLines).toBeUndefined();
    });
  });
});
