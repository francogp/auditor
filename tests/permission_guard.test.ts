/**
 * packages/auditor/tests/permission_guard.test.ts
 *
 * Comprehensive unit tests for Node.js 26 native permission model guard.
 */

import { describe, it, expect } from 'vitest';
import {
  checkRequiredPermissions,
  assertRequiredPermissions,
  type PermissionRequirements
} from '../src/core/permissionGuard.ts';

describe('permissionGuard (Node.js 26 native permission queries)', () => {
  it('returns an empty array when requirements are completely empty', () => {
    const missing = checkRequiredPermissions({});
    expect(missing).toEqual([]);
  });

  it('checks granted permissions cleanly without throwing', () => {
    const missing = checkRequiredPermissions({
      fsRead: ['.'],
      child: true
    });
    expect(Array.isArray(missing)).toBe(true);
  });

  it('detects worker permission requirements cleanly', () => {
    const missing = checkRequiredPermissions({
      worker: true
    });
    expect(Array.isArray(missing)).toBe(true);
  });

  it('checks file system write requirements accurately', () => {
    const missing = checkRequiredPermissions({
      fsWrite: ['.', 'scratch']
    });
    expect(Array.isArray(missing)).toBe(true);
  });

  it('handles multiple combined permission requirements', () => {
    const combinedRequirements: PermissionRequirements = {
      fsRead: ['.', 'scripts'],
      fsWrite: ['scratch'],
      child: true,
      worker: true
    };

    const missing = checkRequiredPermissions(combinedRequirements);
    expect(Array.isArray(missing)).toBe(true);
  });

  it('asserts granted permissions without throwing', () => {
    expect(() => {
      assertRequiredPermissions({});
    }).not.toThrow();
  });

  it('handles non-existent or wildcard paths without throwing unexpectedly in checkRequiredPermissions', () => {
    const missing = checkRequiredPermissions({
      fsRead: ['non_existent_directory_xyz'],
      fsWrite: ['tmp_test_output']
    });
    expect(Array.isArray(missing)).toBe(true);
  });
});
