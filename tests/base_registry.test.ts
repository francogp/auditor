/**
 * tests/base_registry.test.ts
 *
 * Unit tests for BaseEntityRegistry validating registration, lookup, batch operations, and reset.
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';

import { BaseEntityRegistry } from '../src/core/baseRegistry.ts';

interface TestItem {
  readonly id: string;
  readonly name: string;
}

describe('BaseEntityRegistry', () => {
  let registry: BaseEntityRegistry<TestItem>;

  beforeEach(() => {
    registry = new BaseEntityRegistry<TestItem>((item) => item.id);
  });

  it('registers and retrieves an item by key', () => {
    registry.register({ id: 'item-1', name: 'First Item' });

    const item = registry.get('item-1');
    expect(item).toBeDefined();
    expect(item?.name).toBe('First Item');
  });

  it('exposes size getter matching collection count', () => {
    expect(registry.size).toBe(0);
    registry.register({ id: 'item-1', name: 'First Item' });
    expect(registry.size).toBe(1);
  });

  it('ignores null or undefined items or items with empty key', () => {
    const nullableRegistry = new BaseEntityRegistry<TestItem | null | undefined>(
      (item) => item?.id ?? ''
    );
    nullableRegistry.register(null);
    nullableRegistry.register(undefined);
    nullableRegistry.register({ id: '', name: 'Empty Key' });

    expect(nullableRegistry.getAll()).toHaveLength(0);
    nullableRegistry.dispose();
  });

  it('registers multiple items via registerMany', () => {
    registry.registerMany([
      { id: 'item-1', name: 'First Item' },
      { id: 'item-2', name: 'Second Item' }
    ]);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.get('item-1')?.name).toBe('First Item');
    expect(registry.get('item-2')?.name).toBe('Second Item');
  });

  it('returns undefined when querying a non-existent key', () => {
    expect(registry.get('non-existent')).toBeUndefined();
  });

  it('returns all registered items via getAll', () => {
    registry.register({ id: 'a', name: 'Alpha' });
    registry.register({ id: 'b', name: 'Beta' });

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('clears all items on reset', () => {
    registry.register({ id: 'a', name: 'Alpha' });
    registry.register({ id: 'b', name: 'Beta' });
    expect(registry.getAll()).toHaveLength(2);

    registry.reset();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.get('a')).toBeUndefined();
  });

  it('disposes of the registry and unregisters it from global coordinator', () => {
    registry.register({ id: 'temp-1', name: 'Temporary' });
    expect(registry.size).toBe(1);

    registry.dispose();
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toHaveLength(0);

    // After dispose, resetAll does not re-invoke or error on disposed instance
    BaseEntityRegistry.resetAll();
    expect(registry.getAll()).toHaveLength(0);
  });
});
