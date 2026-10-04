/**
 * tests/audit_project_rules.test.ts
 *
 * Unit tests for audit_rules AST rules and ProjectArchitectureAuditor.
 */

import { describe, it, expect } from 'vitest';
import {
  matchesRule,
  forbiddenTypeCasts,
  magicNumbers,
  badConstantNames,
  noLiteralBooleanType,
  noInlineAnonymousObjectType,
  noFloatingPromises,
  noLeakedGlobalState,
  missingInteractiveId,
  noImportantOnTransforms,
  noImportantOnFilters,
  noSassAtImport,
  noLayoutAnimationInGsap,
  CANONICAL_DEFAULT_Z_LAYERS,
  Z_LAYERS
} from '../src/suites/architecture/audit_rules.ts';
import { ProjectArchitectureAuditor } from '../src/suites/architecture/audit_project.ts';

describe('Project Architecture Rules & Auditor', () => {
  describe('matchesRule helper', () => {
    it('matches rule by id, name, category, or alias', () => {
      const rule = {
        id: 'forbiddenTypeCasts',
        name: 'Forbidden Type Casts',
        category: 'TypeScript Integrity',
        aliases: ['any-cast', 'typecast']
      };

      expect(matchesRule(rule, new Set(['typecasts']))).toBe(true);
      expect(matchesRule(rule, new Set(['forbiddentypecasts']))).toBe(true);
      expect(matchesRule(rule, new Set(['any-cast']))).toBe(true);
      expect(matchesRule(rule, new Set(['unrelated-rule']))).toBe(false);
      expect(matchesRule(rule, new Set())).toBe(true); // empty set matches all
    });
  });

  describe('AST Audit Rules', () => {
    it('forbiddenTypeCasts detects as any and as unknown as', () => {
      forbiddenTypeCasts.regex.lastIndex = 0;
      expect(forbiddenTypeCasts.regex.test('const x = obj as any;')).toBe(true);

      forbiddenTypeCasts.regex.lastIndex = 0;
      expect(forbiddenTypeCasts.regex.test('const y = data as unknown as Target;')).toBe(true);

      forbiddenTypeCasts.regex.lastIndex = 0;
      expect(forbiddenTypeCasts.regex.test('const z: any = 123;')).toBe(true);

      forbiddenTypeCasts.regex.lastIndex = 0;
      expect(forbiddenTypeCasts.regex.test('const w = <any>val;')).toBe(true);
    });

    it('magicNumbers detects raw inline numbers without named constants', () => {
      magicNumbers.regex.lastIndex = 0;
      expect(magicNumbers.regex.test('const timeout = 5000;')).toBe(true);

      magicNumbers.regex.lastIndex = 0;
      expect(magicNumbers.regex.test('const margin = 24;')).toBe(true);
    });

    it('badConstantNames detects numeric suffixes in constant names', () => {
      badConstantNames.regex.lastIndex = 0;
      expect(badConstantNames.regex.test('const MAX_RETRIES_3 = 3;')).toBe(true);

      badConstantNames.regex.lastIndex = 0;
      expect(badConstantNames.regex.test('export const TIMEOUT_5000 = 5000;')).toBe(true);
    });

    it('noLiteralBooleanType bans : true and : false annotations', () => {
      noLiteralBooleanType.regex.lastIndex = 0;
      expect(noLiteralBooleanType.regex.test('const isSuccess: true = true;')).toBe(true);

      noLiteralBooleanType.regex.lastIndex = 0;
      expect(noLiteralBooleanType.regex.test('type Flag = false;')).toBe(true);
    });

    it('noInlineAnonymousObjectType bans Java-style anonymous object param signatures', () => {
      noInlineAnonymousObjectType.regex.lastIndex = 0;
      expect(noInlineAnonymousObjectType.regex.test('function updateUser(payload: { name: string; age: number }) {}')).toBe(true);
    });

    it('noFloatingPromises detects unhandled async calls', () => {
      noFloatingPromises.regex.lastIndex = 0;
      expect(noFloatingPromises.regex.test('refreshDatabaseAsync();')).toBe(true);

      noFloatingPromises.regex.lastIndex = 0;
      expect(noFloatingPromises.regex.test('await refreshDatabaseAsync();')).toBe(false);
    });

    it('noLeakedGlobalState detects exported module-level lets', () => {
      noLeakedGlobalState.regex.lastIndex = 0;
      expect(noLeakedGlobalState.regex.test('export let globalActiveIndex = 0;')).toBe(true);
    });

    it('missingInteractiveId detects buttons and inputs without id in template markup', () => {
      missingInteractiveId.regex.lastIndex = 0;
      expect(missingInteractiveId.regex.test('<button class="btn-primary">Click me</button>')).toBe(true);

      missingInteractiveId.regex.lastIndex = 0;
      expect(missingInteractiveId.regex.test('<input type="text" placeholder="Name" />')).toBe(true);
    });

    it('noImportantOnTransforms and noImportantOnFilters detect !important on animation properties', () => {
      noImportantOnTransforms.regex.lastIndex = 0;
      expect(noImportantOnTransforms.regex.test('transform: translate3d(0, 0, 0) !important;')).toBe(true);

      noImportantOnFilters.regex.lastIndex = 0;
      expect(noImportantOnFilters.regex.test('filter: blur(5px) !important;')).toBe(true);
    });

    it('noSassAtImport detects legacy @import in SCSS', () => {
      noSassAtImport.regex.lastIndex = 0;
      expect(noSassAtImport.regex.test('@import "variables";')).toBe(true);
    });

    it('noLayoutAnimationInGsap detects layout properties in GSAP tweens', () => {
      noLayoutAnimationInGsap.regex.lastIndex = 0;
      expect(noLayoutAnimationInGsap.regex.test('gsap.to(elem, { width: 200, duration: 0.3 });')).toBe(true);

      noLayoutAnimationInGsap.regex.lastIndex = 0;
      expect(noLayoutAnimationInGsap.regex.test('gsap.from(elem, { height: 0 });')).toBe(true);
    });

    it('Z_LAYERS contains canonical layer values', () => {
      expect(CANONICAL_DEFAULT_Z_LAYERS.BASE).toBe(0);
      expect(CANONICAL_DEFAULT_Z_LAYERS.MODAL).toBe(11000);
      expect(CANONICAL_DEFAULT_Z_LAYERS.TOOLTIP).toBe(15000);
      expect(Z_LAYERS.MODAL).toBe(11000);
    });
  });

  describe('ProjectArchitectureAuditor metadata and initialization', () => {
    it('initializes with correct properties and rule descriptions', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.id).toBe('audit_project');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Arquitectura');
      expect(auditor.ruleDescriptions).toBeDefined();
      if (auditor.ruleDescriptions) {
        expect(Object.keys(auditor.ruleDescriptions).length).toBeGreaterThanOrEqual(15);
        expect(auditor.ruleDescriptions['domain-type-violation']).toBeDefined();
      }
    });
  });
});
