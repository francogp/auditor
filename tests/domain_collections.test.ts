import { describe, it, expect } from 'vite-plus/test';

import { createDomainSet, createDomainMap } from '../src/core/domainCollections.ts';

describe('domainCollections module tests', () => {
  describe('createDomainSet', () => {
    it('creates a ReadonlySet from a const tuple of strings', () => {
      const ROLES = ['admin', 'moderator', 'member'] as const;
      const roleSet = createDomainSet(ROLES);

      expect(roleSet.size).toBe(3);
      expect(roleSet.has('admin')).toBe(true);
      expect(roleSet.has('moderator')).toBe(true);
      expect(roleSet.has('member')).toBe(true);
      expect((roleSet as ReadonlySet<string>).has('guest')).toBe(false);
    });

    it('creates an empty set when passed an empty array', () => {
      const empty = [] as const;
      const set = createDomainSet(empty);
      expect(set.size).toBe(0);
    });

    it('preserves uniqueness for duplicated elements', () => {
      const items = ['a', 'b', 'a'] as const;
      const set = createDomainSet(items);
      expect(set.size).toBe(2);
      expect(set.has('a')).toBe(true);
      expect(set.has('b')).toBe(true);
    });
  });

  describe('createDomainMap', () => {
    it('creates a ReadonlyMap from typed key-value pairs', () => {
      const entries = [
        ['setup', 1],
        ['prune', 2],
        ['dedup', 3]
      ] as const;

      const phaseMap = createDomainMap(entries);
      expect(phaseMap.size).toBe(3);
      expect(phaseMap.get('setup')).toBe(1);
      expect(phaseMap.get('prune')).toBe(2);
      expect(phaseMap.get('dedup')).toBe(3);
      expect((phaseMap as ReadonlyMap<string, number>).get('unknown')).toBeUndefined();
    });

    it('handles empty entries array', () => {
      const empty = [] as const;
      const map = createDomainMap(empty);
      expect(map.size).toBe(0);
    });

    it('allows objects as map values', () => {
      const entries = [
        ['primary', { color: '#0070f3', priority: 1 }],
        ['secondary', { color: '#666666', priority: 2 }]
      ] as const;

      const styleMap = createDomainMap(entries);
      expect(styleMap.get('primary')).toEqual({ color: '#0070f3', priority: 1 });
      expect(styleMap.get('secondary')?.priority).toBe(2);
    });
  });
});
