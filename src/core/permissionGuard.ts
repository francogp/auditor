import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { styleText } from 'node:util';

/**
 * Polyfills fs.fsync / fs.fsyncSync / FileHandle.prototype.sync as safe no-ops under Node.js --permission model.
 * Under Node.js permission model, fsync is unconditionally disabled with ERR_ACCESS_DENIED,
 * causing tools like Stylelint --fix or atomic file writers to fail even when --allow-fs-write=* is granted.
 */
export function polyfillPermissionModelFsync(): void {
  const permission = (process as NodeJS.Process).permission;
  if (!permission || typeof permission.has !== 'function') {
    return;
  }

  try {
    Reflect.set(fs, 'fsyncSync', () => {});
    const noopCallback = (_fd: number, callback?: (err: Error | null) => void): void => {
      if (typeof callback === 'function') callback(null);
    };
    Reflect.set(fs, 'fsync', noopCallback);
    Reflect.set(fsPromises, 'fsync', async () => {});
  } catch {
    // catch-ok: fallback if properties are non-configurable
  }

  try {
    fsPromises.open(process.execPath, 'r').then(h => {
      const proto = Object.getPrototypeOf(h);
      if (proto && typeof proto.sync === 'function') {
        proto.sync = async () => {};
      }
      return h.close();
    }).catch(() => {
      // catch-ok: fallback if execPath cannot be opened
    });
  } catch {
    // catch-ok
  }
}

// Automatically initialize polyfill on module load
polyfillPermissionModelFsync();

export interface PermissionRequirements {
  fsRead?: string[];
  fsWrite?: string[];
  child?: boolean;
  worker?: boolean;
}

/**
 * assertRequiredPermissions
 * 
 * Verifies required Node.js 26 native permissions via process.permission.has().
 * Gracefully no-ops when Node is executed without the experimental permission model.
 */
export function checkRequiredPermissions(requirements: PermissionRequirements): string[] {
  const permission = (process as NodeJS.Process).permission;
  if (!permission || typeof permission.has !== 'function') {
    return [];
  }

  const missingFlags: string[] = [];

  if (requirements.child && !permission.has('child')) {
    missingFlags.push('--allow-child-process');
  }

  if (requirements.worker && !permission.has('worker')) {
    missingFlags.push('--allow-worker');
  }

  for (const readPath of requirements.fsRead ?? []) {
    if (!permission.has('fs.read', readPath)) {
      missingFlags.push(`--allow-fs-read=${readPath}`);
    }
  }

  for (const writePath of requirements.fsWrite ?? []) {
    if (!permission.has('fs.write', writePath)) {
      missingFlags.push(`--allow-fs-write=${writePath}`);
    }
  }

  return missingFlags;
}

export function assertRequiredPermissions(requirements: PermissionRequirements): void {
  const missingFlags = checkRequiredPermissions(requirements);

  if (missingFlags.length > 0) {
    console.error(
      styleText('red', '\n❌ [PermissionGuard] Permisos requeridos de Node.js 26 ausentes:')
    );
    console.error(
      styleText('yellow', `   Por favor ejecuta el comando agregando: ${missingFlags.join(' ')}\n`)
    );
    process.exit(1);
  }
}