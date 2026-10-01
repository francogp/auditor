import { styleText } from 'node:util';

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