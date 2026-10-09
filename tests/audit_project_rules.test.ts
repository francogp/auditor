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
  noSassAtImport,
  viewport,
  legacyDates,
  hardcodedTimezone,
  nodePrefix,
  esmExtensions,
  tsIgnore,
  noAliasConstants,
  noLiteralSuffixInConstantName,
  timersPromises,
  explicitResource,
  jsonStringifyInWatch,
  intersectionObserverRoot,
  forbiddenFallbacks,
  noDomainIdFallbacks,
  isDomainAuditTarget,
  isAllowedDatabaseFile,
  strictDomainParamTypes,
  noInlineTypeImports,
  noInlineLiteralUnions,
  noRawJsonImportsOutsideData,
  zeroTimerLogic,
  functionCallsInTemplates,
  zIndexAudit,
  zIndexConstantDeclaration,
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


    it('noSassAtImport detects legacy @import in SCSS', () => {
      noSassAtImport.regex.lastIndex = 0;
      expect(noSassAtImport.regex.test('@import "variables";')).toBe(true);
    });

    it('legacyDates and hardcodedTimezone detect legacy Date and hardcoded timezones', () => {
      legacyDates.regex.lastIndex = 0;
      expect(legacyDates.regex.test('const d = new Date();')).toBe(true);
      legacyDates.regex.lastIndex = 0;
      expect(legacyDates.regex.test('const ms = Date.now();')).toBe(true);

      hardcodedTimezone.regex.lastIndex = 0;
      expect(hardcodedTimezone.regex.test("toZonedDateTimeISO('America/Argentina/Buenos_Aires')")).toBe(true);
      hardcodedTimezone.regex.lastIndex = 0;
      expect(hardcodedTimezone.regex.test("Temporal.TimeZone.from('UTC')")).toBe(true);
    });

    it('nodePrefix and esmExtensions enforce Node 26 native imports', () => {
      nodePrefix.regex.lastIndex = 0;
      const rawNodeImport = 'import fs from ' + "'fs';";
      expect(nodePrefix.regex.test(rawNodeImport)).toBe(true);
      expect(nodePrefix.fix?.(rawNodeImport)).toBe("import fs from 'node:fs';");

      esmExtensions.regex.lastIndex = 0;
      const rawRelImport = 'import { foo } from ' + "'./foo';";
      expect(esmExtensions.regex.test(rawRelImport)).toBe(true);
      expect(esmExtensions.fix?.(rawRelImport)).toBe("import { foo } from './foo.ts';");
    });

    it('tsIgnore bans @ts-ignore and @ts-nocheck annotations', () => {
      tsIgnore.regex.lastIndex = 0;
      expect(tsIgnore.regex.test('// @ts-' + 'ignore')).toBe(true);
      tsIgnore.regex.lastIndex = 0;
      expect(tsIgnore.regex.test('// @ts-' + 'nocheck')).toBe(true);
    });

    it('noAliasConstants and noLiteralSuffixInConstantName detect constant naming defects', () => {
      noAliasConstants.regex.lastIndex = 0;
      expect(noAliasConstants.regex.test('const FOO_ALIAS = ORIGINAL_FOO;')).toBe(true);

      noLiteralSuffixInConstantName.regex.lastIndex = 0;
      expect(noLiteralSuffixInConstantName.regex.test('const TIMEOUT_5000 = 5000;')).toBe(true);
    });

    it('timersPromises and explicitResource detect resource leaks and manual timers', () => {
      timersPromises.regex.lastIndex = 0;
      expect(timersPromises.regex.test('new Promise(r => setTimeout(r, 100))')).toBe(true);

      explicitResource.regex.lastIndex = 0;
      expect(explicitResource.regex.test('const db = new DatabaseSync(":memory:")')).toBe(true);
      expect(explicitResource.fix?.('const db = new DatabaseSync(":memory:")')).toBe('using db = new DatabaseSync(":memory:")');
    });

    it('jsonStringifyInWatch and intersectionObserverRoot detect reactivity and template defects', () => {
      jsonStringifyInWatch.regex.lastIndex = 0;
      const watchStr = 'watch(' + '() => JSON.stringify(state));';
      expect(jsonStringifyInWatch.regex.test(watchStr)).toBe(true);

      intersectionObserverRoot.regex.lastIndex = 0;
      const ioStr = 'new Intersection' + 'Observer(cb, { root: el });';
      expect(intersectionObserverRoot.regex.test(ioStr)).toBe(true);
    });

    it('forbiddenFallbacks, strictDomainParamTypes, and type import rules detect domain defects', () => {
      forbiddenFallbacks.regex.lastIndex = 0;
      expect(forbiddenFallbacks.regex.test('const x = user.id || user.name;')).toBe(true);
      forbiddenFallbacks.regex.lastIndex = 0;
      expect(forbiddenFallbacks.regex.test('const p = dataProvider.getUser() || fallback;')).toBe(true);

      noDomainIdFallbacks.regex.lastIndex = 0;
      expect(noDomainIdFallbacks.regex.test("const targetId = userId ?? ''")).toBe(true);

      strictDomainParamTypes.regex.lastIndex = 0;
      expect(strictDomainParamTypes.regex.test('function getUser(userId: string) {}')).toBe(true);
      strictDomainParamTypes.regex.lastIndex = 0;
      expect(strictDomainParamTypes.regex.test('function setItem(itemId: ItemId | string) {}')).toBe(true);

      noInlineTypeImports.regex.lastIndex = 0;
      expect(noInlineTypeImports.regex.test("const user: import('./user').User = data;")).toBe(true);

      noInlineLiteralUnions.regex.lastIndex = 0;
      expect(noInlineLiteralUnions.regex.test("const status: 'pending' | 'active' | 'archived' = 'active';")).toBe(true);

      noRawJsonImportsOutsideData.regex.lastIndex = 0;
      expect(noRawJsonImportsOutsideData.regex.test("import config from './config.json';")).toBe(true);

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test('sleep(100);')).toBe(true);

      functionCallsInTemplates.regex.lastIndex = 0;
      expect(functionCallsInTemplates.regex.test('{{ computeTotal(item)}}')).toBe(true);

      zIndexAudit.regex.lastIndex = 0;
      expect(zIndexAudit.regex.test('z-index: 100')).toBe(true);

      zIndexConstantDeclaration.regex.lastIndex = 0;
      expect(zIndexConstantDeclaration.regex.test('const MODAL_Z_INDEX = 100;')).toBe(true);
    });

    it('viewport detects mobile viewports dvh and dvw', () => {
      viewport.regex.lastIndex = 0;
      expect(viewport.regex.test('height: 100vh;')).toBe(true);
      viewport.regex.lastIndex = 0;
      expect(viewport.regex.test('width: 100vw;')).toBe(true);
      viewport.regex.lastIndex = 0;
      expect(viewport.regex.test('height: 100dvh;')).toBe(false);
    });

    it('nodePrefix, esmExtensions, and tsIgnore detect and repair module hygiene', () => {
      const bareImport = 'import fs from ' + "'fs';";
      nodePrefix.regex.lastIndex = 0;
      expect(nodePrefix.regex.test(bareImport)).toBe(true);
      expect(nodePrefix.fix?.(bareImport)).toBe('import fs from ' + "'node:fs';");

      const extlessImport = 'import { helper } from ' + "'./utils';";
      esmExtensions.regex.lastIndex = 0;
      expect(esmExtensions.regex.test(extlessImport)).toBe(true);
      expect(esmExtensions.fix?.(extlessImport)).toBe('import { helper } from ' + "'./utils.ts';");

      tsIgnore.regex.lastIndex = 0;
      expect(tsIgnore.regex.test('// @ts-' + 'ignore')).toBe(true);
      expect(tsIgnore.fix?.('// @ts-' + 'ignore')).toBe('');
    });

    it('database and domain predicates correctly validate allowed files', () => {
      expect(isAllowedDatabaseFile('src/database.types.ts')).toBe(true);
      expect(isAllowedDatabaseFile('src/supabase.types.ts')).toBe(true);
      expect(isAllowedDatabaseFile('src/domain/user.ts')).toBe(false);
      expect(isDomainAuditTarget('src/domain/user.ts')).toBe(true);
      expect(isDomainAuditTarget('node_modules/pkg/index.ts')).toBe(false);
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
        expect(Object.keys(auditor.ruleDescriptions).length).toBeGreaterThanOrEqual(6);
        expect(auditor.ruleDescriptions['zeroTimerLogic']).toBeDefined();
      }
    });
  });
});
