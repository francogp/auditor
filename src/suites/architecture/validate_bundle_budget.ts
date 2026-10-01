/**
 * scripts/auditors/architecture/validate_bundle_budget.ts
 *
 * BUNDLE BUDGET & CLIENT LEAK AUDITOR (Node.js 26+ Native)
 *
 * Enforces bundle boundaries and import discipline across production code:
 *   1. Prohibits importing from /tests/ or /scripts/ inside src/ (bundle-runtime-leak).
 *   2. Prohibits importing heavy modules (postgres, node:sqlite, vitest, @playwright/test)
 *      as runtime values in UI layers (src/components, src/views, src/stores).
 *   3. Enforces client chunk budgets in dist/assets when compiled assets exist.
 *
 * Escape Hatch:
 *   // bundle-leak-ok: <justification> disables import check on that line.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_bundle_budget.ts
 *   npm run validate:bundle-budget
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { SharedAstContext } from '../../core/astContext.ts';
import { getAuditConfig, isTestPath } from '../../core/auditConfig.ts';

enableCompileCache();

export type BundleBudgetRuleId =
  | 'bundle-runtime-leak'
  | 'bundle-heavy-import'
  | 'bundle-chunk-size';

export const BUNDLE_BUDGET_RULES: readonly BundleBudgetRuleId[] = [
  'bundle-runtime-leak',
  'bundle-heavy-import',
  'bundle-chunk-size'
] as const;

export const DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI: readonly { module: string; reason: string }[] = [
  { module: 'postgres', reason: 'Driver PostgreSQL backend no debe importarse en UI layers (src/components, src/views, src/stores).' },
  { module: 'node:sqlite', reason: 'Driver SQLite nativo no debe importarse en UI layers.' },
  { module: '@playwright/test', reason: 'Librería de pruebas E2E no debe importarse en código de producción de src/.' },
  { module: 'vitest', reason: 'El framework de pruebas no debe importarse en código de producción de src/.' }
];

export function getForbiddenValueImportsUI(projectRoot?: string): readonly { module: string; reason: string }[] {
  const config = getAuditConfig(projectRoot);
  const custom = config.bundle?.forbiddenUiImports ?? [];
  return [...DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI, ...custom];
}

export const FORBIDDEN_VALUE_IMPORTS_UI = DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI;

const MAX_CLIENT_CHUNK_WARN_BYTES = 1200 * 1024; // 1.2 MB uncompressed
const MAX_CLIENT_CHUNK_ERROR_BYTES = 2000 * 1024; // 2.0 MB uncompressed

export class BundleBudgetAuditor extends BaseAuditor<BundleBudgetRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_bundle_budget',
      name: 'Bundle Budget & Client Leak Auditor',
      description: 'Audita límites de tamaño de bundles y fugas de imports',
      family: 'architecture',
      ruleIds: BUNDLE_BUDGET_RULES,
      packageName: 'Bundle',
      ruleDescriptions: {
        'bundle-runtime-leak': 'Fuga de test/script en producción',
        'bundle-heavy-import': 'Librería pesada en capas de UI',
        'bundle-chunk-size': 'Chunk excede límite de tamaño'
      },
      requiresAst: true,
      projectRoot
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.bundle?.enabled === false) {
      this.context.logStep(1, 1, 'Auditoría de presupuestos de bundle omitida (bundle.enabled: false).');
      this.context.setMetric('Bundle Status', 'Disabled');
      return;
    }

    const effectiveUiDirs = [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views']),
      ...(config.paths.storesRoots ?? ['src/stores'])
    ];
    const forbiddenSegments = [
      ...(config.paths.testRoots?.map(r => `/${r}/`) ?? ['/tests/']),
      ...(config.paths.scriptsRoots?.map(r => `/${r}/`) ?? ['/scripts/'])
    ];

    const effectiveForbiddenUiImports = getForbiddenValueImportsUI(this.projectRoot);

    const srcRoots = config.paths.srcRoots ?? ['src'];
    const allFiles = await this.context.collectFiles(srcRoots, new Set(['.ts', '.vue', '.js']));
    const candidateFiles = allFiles.filter(f => {
      const base = path.basename(f);
      return !isTestPath(f) && !base.endsWith('.d.ts');
    });

    const astEngine = astContext ?? new SharedAstContext();

    this.context.logStep(1, 2, `Auditing imports across ${candidateFiles.length} source files...`);

    for (const relPath of candidateFiles) {
      this.filesScannedCount++;
      const fullPath = path.resolve(this.projectRoot, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Fast string pre-filter to skip files with no imports
      if (!content.includes('import ')) continue;

      const norm = path.relative(this.projectRoot, fullPath).replace(/\\/g, '/');
      const sourceFile = astEngine.getSourceFile(fullPath, content);
      if (!sourceFile.text.trim()) continue;

      const isUiLayer = effectiveUiDirs.some(d => norm.startsWith(d));
      const fullLines = content.split('\n');

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier;
          if (!ts.isStringLiteral(moduleSpecifier)) return;
          const importPath = moduleSpecifier.text;

          const importClause = node.importClause;
          let isTypeOnly = false;
          if (importClause) {
            if (importClause.isTypeOnly) {
              isTypeOnly = true;
            } else if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
              isTypeOnly = importClause.namedBindings.elements.every(elem => elem.isTypeOnly);
            }
          }

          if (isTypeOnly) return;

          const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          const lineText = fullLines[lineNum - 1] || '';
          if (lineText.includes('// bundle-leak-ok:')) return;

          // 1. Runtime code leak from tests or scripts
          for (const seg of forbiddenSegments) {
            if (importPath.includes(seg) || importPath.startsWith(`..${seg}`)) {
              this.addViolation({
                ruleId: 'bundle-runtime-leak',
                severity: 'error',
                file: relPath,
                line: lineNum,
                message: `Fuga de código en tiempo de ejecución: '${importPath}'. No se permite importar valores desde '${seg}' en código de producción.`,
                context: importPath
              });
            }
          }

          // 2. Heavy dependency leak in UI layers
          if (isUiLayer) {
            for (const forbidden of effectiveForbiddenUiImports) {
              if (importPath === forbidden.module || importPath.startsWith(`${forbidden.module}/`)) {
                this.addViolation({
                  ruleId: 'bundle-heavy-import',
                  severity: 'error',
                  file: relPath,
                  line: lineNum,
                  message: `Import de valor en tiempo de ejecución prohibido en UI: '${importPath}'. ${forbidden.reason}`,
                  context: importPath
                });
              }
            }
          }
        }
      });
    }

    // 3. Audit dist/assets compiled chunks if dist assets dir exists
    const distAssetsDir = path.resolve(this.projectRoot, config.bundle?.distDir ?? 'dist/assets');
    let chunksAudited = 0;
    if (fs.existsSync(distAssetsDir)) {
      this.context.logStep(2, 2, `Checking compiled chunk sizes in ${config.bundle?.distDir ?? 'dist/assets'}...`);
      const assets = fs.readdirSync(distAssetsDir);
      const bundleConfig = config.bundle;
      const exemptPrefixes = bundleConfig?.exemptChunkPrefixes ?? [];
      const maxWarnBytes = bundleConfig?.maxClientChunkWarnBytes ?? MAX_CLIENT_CHUNK_WARN_BYTES;
      const maxErrorBytes = bundleConfig?.maxClientChunkErrorBytes ?? MAX_CLIENT_CHUNK_ERROR_BYTES;

      for (const asset of assets) {
        if (asset.endsWith('.js')) {
          chunksAudited++;
          if (exemptPrefixes.some(prefix => asset.startsWith(prefix))) {
            continue;
          }

          const assetPath = path.join(distAssetsDir, asset);
          const stats = fs.statSync(assetPath);
          const relAssetPath = path.relative(this.projectRoot, assetPath).replace(/\\/g, '/');

          if (stats.size > maxErrorBytes) {
            this.addViolation({
              ruleId: 'bundle-chunk-size',
              severity: 'error',
              file: relAssetPath,
              line: 1,
              message: `El chunk de cliente '${asset}' (${(stats.size / 1024).toFixed(1)} KB) supera el límite crítico de ${(maxErrorBytes / 1024).toFixed(0)} KB.`,
              context: asset
            });
          } else if (stats.size > maxWarnBytes) {
            this.addViolation({
              ruleId: 'bundle-chunk-size',
              severity: 'warning',
              file: relAssetPath,
              line: 1,
              message: `El chunk de cliente '${asset}' (${(stats.size / 1024).toFixed(1)} KB) excede el presupuesto sugerido de ${(maxWarnBytes / 1024).toFixed(0)} KB.`,
              context: asset
            });
          }
        }
      }
    }

    this.context.setMetric('Files Audited', this.filesScannedCount);
    this.context.setMetric('Compiled Chunks', chunksAudited);
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new BundleBudgetAuditor());
}
