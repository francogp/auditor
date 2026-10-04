/**
 * tests/permission_guard.test.ts
 *
 * Unit tests for permissionGuard Node.js 26+ native permission helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import {
  polyfillPermissionModelFsync,
  checkRequiredPermissions,
  assertRequiredPermissions,
  type PermissionRequirements
} from '../src/core/permissionGuard.ts';

describe('permissionGuard Core Utility', () => {
  let originalExit: typeof process.exit;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalExit = process.exit;
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  describe('polyfillPermissionModelFsync', () => {
    it('executes safely and polyfills fsyncSync and fsync when permission model is present', () => {
      // Mock process.permission
      const mockPermission = { has: vi.fn().mockReturnValue(true) };
      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: mockPermission,
        configurable: true
      });

      try {
        polyfillPermissionModelFsync();
        expect(typeof fs.fsyncSync).toBe('function');
        expect(() => fs.fsyncSync(1)).not.toThrow();

        expect(typeof Reflect.get(fsPromises, 'fsync')).toBe('function');
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });

    it('no-ops safely when permission model is absent', () => {
      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: undefined,
        configurable: true
      });

      try {
        expect(() => polyfillPermissionModelFsync()).not.toThrow();
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });
  });

  describe('checkRequiredPermissions', () => {
    it('returns empty array when process.permission is absent (standard unconstrained node)', () => {
      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: undefined,
        configurable: true
      });

      try {
        const missing = checkRequiredPermissions({ child: true, worker: true, fsRead: ['src'], fsWrite: ['dist'] });
        expect(missing).toEqual([]);
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });

    it('identifies missing permissions when process.permission reports false', () => {
      const mockPermission = {
        has: vi.fn((scope: string, path?: string) => {
          if (scope === 'child') return false;
          if (scope === 'worker') return false;
          if (scope === 'fs.read' && path === 'secret') return false;
          if (scope === 'fs.write' && path === 'output') return false;
          return true;
        })
      };

      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: mockPermission,
        configurable: true
      });

      try {
        const reqs: PermissionRequirements = {
          child: true,
          worker: true,
          fsRead: ['allowed', 'secret'],
          fsWrite: ['output']
        };
        const missing = checkRequiredPermissions(reqs);

        expect(missing).toContain('--allow-child-process');
        expect(missing).toContain('--allow-worker');
        expect(missing).toContain('--allow-fs-read=secret');
        expect(missing).toContain('--allow-fs-write=output');
        expect(missing).not.toContain('--allow-fs-read=allowed');
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });
  });

  describe('assertRequiredPermissions', () => {
    it('does not exit when all permissions are satisfied', () => {
      const mockExit = vi.fn() as unknown as typeof process.exit;
      process.exit = mockExit;

      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: { has: vi.fn().mockReturnValue(true) },
        configurable: true
      });

      try {
        assertRequiredPermissions({ child: true, worker: true });
        expect(mockExit).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });

    it('exits with status 1 and logs error message when permissions are missing', () => {
      const mockExit = vi.fn() as unknown as typeof process.exit;
      process.exit = mockExit;

      const originalPermission = (process as unknown as { permission?: unknown }).permission;
      Object.defineProperty(process, 'permission', {
        value: { has: vi.fn().mockReturnValue(false) },
        configurable: true
      });

      try {
        assertRequiredPermissions({ child: true });
        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'permission', {
          value: originalPermission,
          configurable: true
        });
      }
    });
  });
});
