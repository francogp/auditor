/**
 * @file reportUtils.ts
 * @description Utilidades compartidas para formateo de reportes y salida de scripts de validación
 * del proyecto. Evita la duplicación de lógica de generación de archivos de reporte.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';

export interface ValidationSummary {
  title: string;
  scannedMetrics: Record<string, number>;
  errors: string[];
  warnings: string[];
}

export function printConsoleHeader(title: string): void {
  console.log(styleText('bold', `\n--- 🛡️  ${title} ---`));
}

export function printConsoleSummary(summary: ValidationSummary, verbose: boolean = true): void {
  console.log(`\n════════════════════════════════════`);
  console.log(`    ${summary.title.toUpperCase()}`);
  console.log(`════════════════════════════════════`);
  for (const [key, value] of Object.entries(summary.scannedMetrics)) {
    console.log(`📦 ${key}: ${value}`);
  }
  console.log(`════════════════════════════════════\n`);

  if (!verbose) {
    console.log(styleText('cyan', `\n[INFO] Modo resumen activo: ${summary.errors.length} errores, ${summary.warnings.length} advertencias.`));
  } else {
    if (summary.warnings.length) {
      console.log(styleText('yellow', `⚠️  WARNINGS (${summary.warnings.length}):`));
      const limit = 30;
      summary.warnings.slice(0, limit).forEach(w => console.log(`   ${w}`));
      if (summary.warnings.length > limit) {
        console.log(styleText('cyan', `   ... y ${summary.warnings.length - limit} advertencias más (usa -o para ver todas)`));
      }
      console.log('');
    }

    if (summary.errors.length) {
      console.log(styleText('red', `❌ ERRORS (${summary.errors.length}):`));
      const limit = 30;
      summary.errors.slice(0, limit).forEach(e => console.log(`   ${e}`));
      if (summary.errors.length > limit) {
        console.log(styleText('cyan', `   ... y ${summary.errors.length - limit} errores más (usa -o para ver todos)`));
      }
      console.log('\n' + styleText('red', 'Corrige estos errores para asegurar la integridad de los datos.'));
    } else {
      console.log(styleText('green', '✅ Todos los componentes pasaron la validación con éxito!'));
    }
  }
}

export async function writeReportFile(outputPathArg: string, summary: ValidationSummary): Promise<void> {
  const outputPath = path.resolve(process.cwd(), outputPathArg);
  const metricLines = Object.entries(summary.scannedMetrics).map(([key, val]) => `${key}: ${val}`);

  const lines = [
    `--- ${summary.title.toUpperCase()} ---`,
    ...metricLines,
    `\nErrors (${summary.errors.length}):`,
    ...summary.errors.map(e => `  - ${e}`),
    `\nWarnings (${summary.warnings.length}):`,
    ...summary.warnings.map(w => `  - ${w}`)
  ];

  await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  console.log(styleText('cyan', `\n✨ Reporte completo escrito en: ${outputPathArg}`));
}
