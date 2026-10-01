#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/sync_env_scripts.ts
 *
 * Environment Scripts Synchronizer (Node.js 26+ Native)
 * Synchronizes the canonical setup-linux.sh and setup-windows.ps1 from @francogp/auditor
 * into the host project root, ensuring zero code divergence.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SyncEnvOptions {
  targetDir?: string;
  dryRun?: boolean;
}

export function syncEnvScripts(options: SyncEnvOptions = {}): { success: boolean; filesUpdated: string[]; message: string } {
  const targetDir = path.resolve(options.targetDir || process.cwd());
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRootDir = path.resolve(currentDir, '../../');

  const filesToSync = [
    'setup-linux.sh',
    'setup-windows.ps1'
  ];

  const filesUpdated: string[] = [];

  for (const file of filesToSync) {
    const srcPath = path.join(packageRootDir, file);
    const destPath = path.join(targetDir, file);

    if (fs.existsSync(srcPath)) {
      if (!options.dryRun) {
        fs.copyFileSync(srcPath, destPath);
        if (file.endsWith('.sh')) {
          try {
            fs.chmodSync(destPath, 0o755);
          } catch {
            // Ignore chmod failures on non-POSIX
          }
        }
      }
      filesUpdated.push(file);
    }
  }

  // Asegurar directorio de plugins
  const pluginsDir = path.join(targetDir, 'scripts/setup/plugins');
  if (!fs.existsSync(pluginsDir)) {
    if (!options.dryRun) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.writeFileSync(path.join(pluginsDir, '.gitkeep'), '', 'utf8');

      // Crear ejemplos de plugins
      const sampleSh = `#!/usr/bin/env bash
# Plugin de inicialización específico de proyecto (Linux/macOS)
# Coloca aquí tus tareas post-instalación específicas (ej. copiar plantillas, configurar BD)
# echo "Ejecutando plugin de configuración local..."
`;
      const samplePs1 = `# Plugin de inicialización específico de proyecto (Windows)
# Coloca aquí tus tareas post-instalación específicas (ej. copiar plantillas, configurar BD)
# Write-Host "Ejecutando plugin de configuracion local..." -ForegroundColor Cyan
`;
      fs.writeFileSync(path.join(pluginsDir, '01_sample.sh.sample'), sampleSh, 'utf8');
      fs.writeFileSync(path.join(pluginsDir, '01_sample.ps1.sample'), samplePs1, 'utf8');
    }
  }

  return {
    success: true,
    filesUpdated,
    message: `Sincronizados scripts de entorno canónicos en ${targetDir}`
  };
}

// CLI entrypoint
const isDirectCli = process.argv[1] && (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
})();
if (isDirectCli) {
  const isDryRun = process.argv.includes('--dry-run');
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│  🔄 Sincronizador de Scripts de Entorno (@francogp/auditor) │');
  console.log('└────────────────────────────────────────────────────────┘\n');

  const result = syncEnvScripts({ dryRun: isDryRun });

  if (result.success) {
    console.log(`✅ ${result.message}`);
    for (const f of result.filesUpdated) {
      console.log(`  - ${f}`);
    }
    console.log('\nEstructura de plugins inicializada en scripts/setup/plugins/');
    console.log('Cero divergencia con el estándar oficial de @francogp/auditor.\n');
  } else {
    console.error(`❌ Error al sincronizar: ${result.message}`);
    process.exit(1);
  }
}
