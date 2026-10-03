/**
 * src/cli/make_executable.ts
 *
 * Cross-platform CLI utility to ensure compiled binaries in dist/cli/ have executable permissions (0o755).
 * Native Node.js 26+ execution: works cross-platform on Windows, Linux, and macOS without relying on POSIX chmod.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from './cliUtils.ts';

export function makeCliBinariesExecutable(distDir = path.resolve(process.cwd(), 'dist/cli')): void {
  if (!fs.existsSync(distDir)) {
    return;
  }

  const entries = fs.readdirSync(distDir);
  for (const entry of entries) {
    if (entry.endsWith('.js')) {
      const fullPath = path.join(distDir, entry);
      try {
        fs.chmodSync(fullPath, 0o755);
      } catch {
        // catch-ok: Safe fallback on filesystems or OS environments where chmod is not supported
      }
    }
  }
}

if (isMainModule(import.meta.url)) {
  makeCliBinariesExecutable();
}
