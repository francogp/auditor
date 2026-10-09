/**
 * tests/audit_rules_deep_coverage.test.ts
 *
 * Comprehensive hermetic test suite expanding unit coverage across audit_rules.ts:
 * - Covers rule checks, fix methods, appliesTo filters, escape hatches, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  viewport,
  legacyDates,
  hardcodedTimezone,
  nodePrefix,
  esmExtensions,
  tsIgnore,
  timersPromises,
  explicitResource,
  zeroTimerLogic,
  jsonStringifyInWatch,
  intersectionObserverRoot,
  functionCallsInTemplates,
  forbiddenFallbacks,
  noDomainIdFallbacks,
  forbiddenTypeCasts,
  noLiteralBooleanType,
  noInlineAnonymousObjectType,
  noFloatingPromises,
  noLeakedGlobalState,
  strictDomainParamTypes,
  noInlineTypeImports,
  noInlineLiteralUnions,
  noRawJsonImportsOutsideData,
  noSassAtImport,
  isDomainAuditTarget,
  isAllowedDatabaseFile,
  getDomainIdFallbackRegex
} from '../src/suites/architecture/audit_rules.ts';

describe('Audit Rules Deep Coverage', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('viewport rule', () => {
    it('generates message and fixes viewport units to dynamic equivalents', () => {
      const msg = typeof viewport.message === 'function' ? viewport.message('100vh') : viewport.message;
      expect(msg).toContain('dvh');

      expect(viewport.fix?.('100vh')).toBe('dvh');
      expect(viewport.fix?.('50vw')).toBe('dvw');
    });
  });

  describe('legacyDates rule', () => {
    it('evaluates appliesTo and check filters correctly', () => {
      expect(legacyDates.appliesTo?.('eslint.config.js')).toBe(false);
      expect(legacyDates.appliesTo?.('src/utils/time.ts')).toBe(true);

      const fakeMatch = {} as RegExpExecArray;
      expect(legacyDates.check?.('', fakeMatch, 'eslint.config.js')).toBe(false);
      expect(legacyDates.check?.('', fakeMatch, 'src/utils/time.ts')).toBe(true);
      expect(legacyDates.check?.('', fakeMatch, undefined)).toBe(false);
    });
  });

  describe('hardcodedTimezone rule', () => {
    it('evaluates message, appliesTo, and check correctly', () => {
      const msg = typeof hardcodedTimezone.message === 'function'
        ? hardcodedTimezone.message('America/New_York')
        : hardcodedTimezone.message;
      expect(msg).toContain('Timezone hardcodeado');

      expect(hardcodedTimezone.appliesTo?.('src/utils/time.ts')).toBe(true);
      expect(hardcodedTimezone.check?.('', {} as RegExpExecArray, 'src/utils/time.ts')).toBe(true);
    });
  });

  describe('nodePrefix rule', () => {
    it('ignores audit_rules.ts itself and fixes import statements with node: prefix', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(nodePrefix.check?.('', fakeMatch, 'src/suites/architecture/audit_rules.ts')).toBe(false);
      expect(nodePrefix.check?.('', fakeMatch, 'src/utils/fsHelper.ts')).toBe(true);
      expect(nodePrefix.check?.('', fakeMatch, undefined)).toBe(false);

      const fixed = nodePrefix.fix?.('import fs ' + "from 'fs'");
      expect(fixed).toBe("import fs from 'node:fs'");
    });
  });

  describe('esmExtensions rule', () => {
    it('checks relative imports and appends .ts extension when missing', () => {
      const matchMissing = Object.assign(['import { x } ' + 'from "./helper"', './helper'], { index: 0 }) as unknown as RegExpExecArray;
      const matchWithExt = Object.assign(['import { x } ' + 'from "./helper.ts"', './helper.ts'], { index: 0 }) as unknown as RegExpExecArray;

      expect(esmExtensions.check?.('', matchMissing, 'src/utils/file.ts')).toBe(true);
      expect(esmExtensions.check?.('', matchWithExt, 'src/utils/file.ts')).toBe(false);
      expect(esmExtensions.check?.('', matchMissing, 'src/components/Comp.vue')).toBe(false);
      expect(esmExtensions.check?.('', matchMissing, 'src/suites/architecture/audit_rules.ts')).toBe(false);

      const fixed = esmExtensions.fix?.('import { x } ' + "from './helper'");
      expect(fixed).toBe("import { x } from './helper.ts'");
    });
  });

  describe('tsIgnore rule', () => {
    it('fixes ts-ignore annotations by clearing them', () => {
      expect(tsIgnore.fix?.('// @ts-ignore')).toBe('');
    });
  });

  describe('timersPromises rule', () => {
    it('flags setTimeout promises in scripts but not in normal components', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(timersPromises.check?.('', fakeMatch, 'scripts/runner.ts')).toBe(true);
      expect(timersPromises.check?.('', fakeMatch, 'src/components/Modal.vue')).toBe(false);
    });
  });

  describe('explicitResource rule', () => {
    it('detects unmanaged resource creation and respects resource-ok comments', () => {
      const codeUnmanaged = 'const db = new DatabaseSync("app.db");';
      const codeManaged = 'const db = new DatabaseSync("app.db"); // resource-ok: test fixture';
      const codeCommented = '// const db = new DatabaseSync("app.db");';

      const match = Object.assign(['const db = new DatabaseSync', 'db', 'new DatabaseSync'], { index: 0 }) as unknown as RegExpExecArray;

      expect(explicitResource.check?.(codeUnmanaged, match, 'scripts/seed.ts')).toBe(true);
      expect(explicitResource.check?.(codeManaged, match, 'scripts/seed.ts')).toBe(false);
      expect(explicitResource.check?.(codeCommented, match, 'scripts/seed.ts')).toBe(false);
      expect(explicitResource.check?.(codeUnmanaged, match, 'src/views/Home.vue')).toBe(false);

      expect(explicitResource.fix?.(codeUnmanaged)).toBe('using db = new DatabaseSync("app.db");');
    });
  });

  describe('zeroTimerLogic rule', () => {
    it('detects sleep() in core code and honors audit-disable timers', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(zeroTimerLogic.check?.('sleep(100);', fakeMatch, 'src/core/engine.ts')).toBe(true);
      expect(zeroTimerLogic.check?.('/* audit-disable timers */ sleep(100);', fakeMatch, 'src/core/engine.ts')).toBe(false);
      expect(zeroTimerLogic.check?.('sleep(100);', fakeMatch, 'src/suites/architecture/audit_rules.ts')).toBe(false);
    });
  });

  describe('jsonStringifyInWatch rule', () => {
    it('detects JSON.stringify calls inside watch handlers', () => {
      jsonStringifyInWatch.regex.lastIndex = 0;
      expect(jsonStringifyInWatch.regex.test('watch(() => ' + 'JSON.stringify(props.filters), () => {})')).toBe(true);
    });
  });

  describe('intersectionObserverRoot rule', () => {
    it('flags non-null root in IntersectionObserver', () => {
      intersectionObserverRoot.regex.lastIndex = 0;
      expect(intersectionObserverRoot.regex.test('new ' + 'IntersectionObserver(callback, { root: containerEl })')).toBe(true);
      intersectionObserverRoot.regex.lastIndex = 0;
      expect(intersectionObserverRoot.regex.test('new ' + 'IntersectionObserver(callback, { root: null })')).toBe(false);
    });
  });

  describe('functionCallsInTemplates rule', () => {
    it('allows safe formatting helpers and flags heavy database/array operations in templates', () => {
      const matchSafe = Object.assign(['formatNumber(val)', undefined, 'formatNumber'], { index: 0 }) as unknown as RegExpExecArray;
      expect(functionCallsInTemplates.check?.('', matchSafe, 'src/components/Card.vue')).toBe(false);

      const contentHeavy = `<template><div>{{ getFilteredUsers(items) }}</div></template>
<script setup lang="ts">
function getFilteredUsers(list) {
  return list.filter(x => x.active).map(x => x.name);
}
</script>`;
      const matchHeavy = Object.assign(['{{ getFilteredUsers(items) }}', undefined, 'getFilteredUsers'], { index: 18 }) as unknown as RegExpExecArray;
      expect(functionCallsInTemplates.check?.(contentHeavy, matchHeavy, 'src/components/Card.vue')).toBe(true);

      const contentWithoutScript = '<template><div>{{ doSomething() }}</div></template>';
      const matchDoSomething = Object.assign(['{{ doSomething() }}', undefined, 'doSomething'], { index: 18 }) as unknown as RegExpExecArray;
      expect(functionCallsInTemplates.check?.(contentWithoutScript, matchDoSomething, 'src/components/Card.vue')).toBe(false);
    });
  });

  describe('forbiddenFallbacks rule', () => {
    it('flags silent fallbacks in domain code', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(forbiddenFallbacks.check?.('', fakeMatch, 'src/domain/user.ts')).toBe(true);
      expect(forbiddenFallbacks.check?.('', fakeMatch, undefined)).toBe(false);
    });
  });

  describe('forbiddenTypeCasts rule', () => {
    it('detects type casts and honors escape hatches', () => {
      const match = Object.assign(['as any'], { index: 13 }) as unknown as RegExpExecArray;

      expect(forbiddenTypeCasts.check?.('const x = val as any;', match, 'src/domain/calc.ts')).toBe(true);
      expect(forbiddenTypeCasts.check?.('const x = val as any; // type-ok: raw bridge', match, 'src/domain/calc.ts')).toBe(false);
      expect(forbiddenTypeCasts.check?.('// const x = val as any;', match, 'src/domain/calc.ts')).toBe(false);
      expect(forbiddenTypeCasts.check?.('const x = val as any;', match, undefined)).toBe(false);
    });
  });

  describe('noLiteralBooleanType rule', () => {
    it('detects literal boolean annotations and auto-fixes them to : boolean', () => {
      const match = Object.assign(['const isReady: true'], { index: 0 }) as unknown as RegExpExecArray;

      expect(noLiteralBooleanType.check?.('const isReady: true = true;', match, 'src/types/flag.ts')).toBe(true);
      expect(noLiteralBooleanType.check?.('const isReady: true = true; // boolean-ok: Explicit boolean flag annotation', match, 'src/types/flag.ts')).toBe(false);

      expect(noLiteralBooleanType.fix?.('const isReady: true = true;')).toBe('const isReady: boolean = true;');
    });
  });

  describe('noInlineAnonymousObjectType rule', () => {
    it('flags inline anonymous object types in function parameters', () => {
      const match = Object.assign(['(user: { id: string; name: string })'], { index: 10 }) as unknown as RegExpExecArray;

      expect(noInlineAnonymousObjectType.check?.('function f(user: { id: string; name: string }) {}', match, 'src/api/user.ts')).toBe(true);
      expect(noInlineAnonymousObjectType.check?.('function f(user: { id: string; name: string }) {} // type-ok: Type contract declaration', match, 'src/api/user.ts')).toBe(false);
    });
  });

  describe('noFloatingPromises rule', () => {
    it('flags floating async promises and auto-fixes them with void prefix', () => {
      const match = Object.assign(['saveDataAsync();'], { index: 0 }) as unknown as RegExpExecArray;

      expect(noFloatingPromises.check?.('saveDataAsync();', match, 'src/services/data.ts')).toBe(true);
      expect(noFloatingPromises.check?.('saveDataAsync(); // promise-ok: Background promise handler', match, 'src/services/data.ts')).toBe(false);

      expect(noFloatingPromises.fix?.('saveDataAsync();')).toBe('void saveDataAsync();');
    });
  });

  describe('noLeakedGlobalState rule', () => {
    it('flags module-level mutable let variables', () => {
      const match = Object.assign(['let count = 0'], { index: 0 }) as unknown as RegExpExecArray;

      expect(noLeakedGlobalState.check?.('let count = 0;', match, 'src/state/global.ts')).toBe(true);
      expect(noLeakedGlobalState.check?.('let count = 0; // singleton-ok: Cached singleton', match, 'src/state/global.ts')).toBe(false);
    });
  });

  describe('strictDomainParamTypes rule', () => {
    it('differentiates domain IDs, instance UIDs, infra IDs, and escapes', () => {
      const matchDomainId = Object.assign(['pokemonId: string', 'pokemonId'], { index: 10 }) as unknown as RegExpExecArray;
      const matchWildcard = Object.assign(['pokemonId: PokemonId | string', 'pokemonId'], { index: 10 }) as unknown as RegExpExecArray;
      const matchInstanceUid = Object.assign(['targetUid: string', 'targetUid'], { index: 10 }) as unknown as RegExpExecArray;
      const matchInfraId = Object.assign(['userId: string', 'userId'], { index: 10 }) as unknown as RegExpExecArray;
      const matchRpcInfraId = Object.assign(['p_userId: string', 'p_userId'], { index: 10 }) as unknown as RegExpExecArray;

      const codeNormal = 'function test(pokemonId: string) {}';
      const codeEscaped = 'function test(pokemonId: string) {} // domain-ok: legacy bridge';

      expect(strictDomainParamTypes.check?.(codeNormal, matchDomainId, 'src/services/battle.ts')).toBe(true);
      expect(strictDomainParamTypes.check?.(codeNormal, matchWildcard, 'src/services/battle.ts')).toBe(true);
      expect(strictDomainParamTypes.check?.(codeNormal, matchInstanceUid, 'src/services/battle.ts')).toBe(false);
      expect(strictDomainParamTypes.check?.(codeNormal, matchInfraId, 'src/services/battle.ts')).toBe(false);
      expect(strictDomainParamTypes.check?.(codeNormal, matchRpcInfraId, 'src/services/battle.ts')).toBe(false);
      expect(strictDomainParamTypes.check?.(codeEscaped, matchDomainId, 'src/services/battle.ts')).toBe(false);
      expect(strictDomainParamTypes.check?.(codeNormal, matchDomainId, 'src/services/database.ts')).toBe(false);
    });
  });

  describe('noInlineTypeImports rule', () => {
    it('disallows inline type imports in source files but permits them in .d.ts', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(noInlineTypeImports.check?.('', fakeMatch, 'src/types/data.ts')).toBe(true);
      expect(noInlineTypeImports.check?.('', fakeMatch, 'src/types/ambient.d.ts')).toBe(false);
    });
  });

  describe('noInlineLiteralUnions rule', () => {
    it('flags inline literal unions in source code and respects domain-ok comments', () => {
      const match = Object.assign([": 'admin' | 'user'"], { index: 10 }) as unknown as RegExpExecArray;
      const codeNormal = "type Role = 'admin' | 'user';";
      const codeEscaped = "type Role = 'admin' | 'user'; // domain-ok: UI selector only";

      expect(noInlineLiteralUnions.check?.(codeNormal, match, 'src/domain/role.ts')).toBe(true);
      expect(noInlineLiteralUnions.check?.(codeEscaped, match, 'src/domain/role.ts')).toBe(false);
      expect(noInlineLiteralUnions.check?.(codeNormal, match, 'tests/role.test.ts')).toBe(false);
    });
  });

  describe('noRawJsonImportsOutsideData rule', () => {
    it('flags static JSON imports outside data roots and scripts', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(noRawJsonImportsOutsideData.check?.('', fakeMatch, 'src/components/Card.vue')).toBe(true);
      expect(noRawJsonImportsOutsideData.check?.('', fakeMatch, 'src/data/items.ts')).toBe(false);
      expect(noRawJsonImportsOutsideData.check?.('', fakeMatch, 'scripts/seed.ts')).toBe(false);
    });
  });

  describe('noSassAtImport rule', () => {
    it('flags @import in scss/css files and in Vue SFCs with scss lang', () => {
      const fakeMatch = {} as RegExpExecArray;
      expect(noSassAtImport.check?.('', fakeMatch, 'src/styles/app.scss')).toBe(true);
      expect(noSassAtImport.check?.('', fakeMatch, 'src/styles/app.css')).toBe(true);
      expect(noSassAtImport.check?.('<style lang="scss">@import "var";</style>', fakeMatch, 'src/views/Home.vue')).toBe(true);
      expect(noSassAtImport.check?.('<style>@import "var";</style>', fakeMatch, 'src/views/Home.vue')).toBe(false);
      expect(noSassAtImport.check?.('', fakeMatch, 'src/logic/math.ts')).toBe(false);
    });
  });

  describe('noDomainIdFallbacks and domain helpers', () => {
    it('evaluates isDomainAuditTarget and isAllowedDatabaseFile helpers', () => {
      expect(isDomainAuditTarget('src/domain/order.ts')).toBe(true);
      expect(isDomainAuditTarget(undefined)).toBe(false);

      expect(isAllowedDatabaseFile('src/persistence/database.types.ts')).toBe(true);
      expect(isAllowedDatabaseFile('src/domain/order.ts')).toBe(false);

      const regex = getDomainIdFallbackRegex();
      expect(regex.test("const id = pokemonId || ''")).toBe(true);
    });

    it('evaluates check on noDomainIdFallbacks with escape hatches and infra whitelist', () => {
      const match = Object.assign(["pokemonId || ''"], { index: 10 }) as unknown as RegExpExecArray;
      const codeNormal = "const id = pokemonId || '';";
      const codeEscaped = "const id = pokemonId || ''; // text-ok: display label fallback";

      expect(noDomainIdFallbacks.check?.(codeNormal, match, 'src/domain/order.ts')).toBe(true);
      expect(noDomainIdFallbacks.check?.(codeEscaped, match, 'src/domain/order.ts')).toBe(false);
    });
  });
});
