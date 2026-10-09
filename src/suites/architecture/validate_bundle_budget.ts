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
import type { GitIgnoreRequirement } from '../../core/auditContract.ts';
import { toPosixRelative } from '../../core/safePath.ts';
import { SharedAstContext } from '../../core/astContext.ts';
import { getAuditConfig, isTestPath, type AuditEngineConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export const BUNDLE_BUDGET_RULES = [
  'bundle-runtime-leak',
  'bundle-heavy-import',
  'bundle-chunk-size'
] as const;
export type BundleBudgetRuleId = (typeof BUNDLE_BUDGET_RULES)[number];

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

function isImportTypeOnly(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause;
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;
  if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
    return importClause.namedBindings.elements.every(elem => elem.isTypeOnly);
  }
  return false;
}

function checkImportViolations(
  importPath: string,
  lineNum: number,
  relPath: string,
  isUiLayer: boolean,
  forbiddenSegments: readonly string[],
  forbiddenUiImports: readonly { module: string; reason: string }[],
  auditor: BundleBudgetAuditor
): void {
  for (const seg of forbiddenSegments) {
    if (importPath.includes(seg) || importPath.startsWith(`..${seg}`)) {
      auditor.addViolation({
        ruleId: 'bundle-runtime-leak',
        severity: 'error',
        file: relPath,
        line: lineNum,
        message: `Fuga de código en tiempo de ejecución: '${importPath}'. No se permite importar valores desde '${seg}' en código de producción.`,
        context: importPath
      });
    }
  }

  if (isUiLayer) {
    for (const forbidden of forbiddenUiImports) {
      if (importPath === forbidden.module || importPath.startsWith(`${forbidden.module}/`)) {
        auditor.addViolation({
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

function auditFileImports(
  relPath: string,
  fullPath: string,
  projectRoot: string,
  effectiveUiDirs: readonly string[],
  forbiddenSegments: readonly string[],
  forbiddenUiImports: readonly { module: string; reason: string }[],
  astEngine: SharedAstContext,
  auditor: BundleBudgetAuditor
): void {
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes('import ')) return;

  const norm = toPosixRelative(projectRoot, fullPath);
  const sourceFile = astEngine.getSourceFile(fullPath, content);
  if (!sourceFile.text.trim()) return;

  const isUiLayer = effectiveUiDirs.some(d => norm.startsWith(d));
  const fullLines = content.split('\n');

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) return;
      if (isImportTypeOnly(node)) return;

      const lineNum = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const lineText = fullLines[lineNum - 1] || '';
      if (lineText.includes('// bundle-leak-ok:')) return;

      checkImportViolations(
        moduleSpecifier.text,
        lineNum,
        relPath,
        isUiLayer,
        forbiddenSegments,
        forbiddenUiImports,
        auditor
      );
    }
  });
}

function auditSingleChunkBudget(
  asset: string,
  statsSize: number,
  relAssetPath: string,
  bundleConfig: AuditEngineConfig['bundle'],
  auditor: BundleBudgetAuditor
): void {
  const budgets = bundleConfig?.budgets ?? [];
  const matchingBudget = budgets.find(b => {
    if (b.prefix && asset.startsWith(b.prefix)) return true;
    if (b.matcher && new RegExp(b.matcher).test(asset)) return true;
    return false;
  });

  if (matchingBudget) {
    if (statsSize > matchingBudget.limitBytes) {
      auditor.addViolation({
        ruleId: 'bundle-chunk-size',
        severity: 'error',
        file: relAssetPath,
        line: 1,
        message: `El chunk '${asset}' (${(statsSize / 1024).toFixed(1)} KB) supera el presupuesto configurado '${matchingBudget.name}' de ${(matchingBudget.limitBytes / 1024).toFixed(0)} KB.`,
        context: asset
      });
    }
    return;
  }

  const maxErrorBytes = bundleConfig?.maxClientChunkErrorBytes;
  const maxWarnBytes = bundleConfig?.maxClientChunkWarnBytes;

  if (maxErrorBytes !== undefined && statsSize > maxErrorBytes) {
    auditor.addViolation({
      ruleId: 'bundle-chunk-size',
      severity: 'error',
      file: relAssetPath,
      line: 1,
      message: `El chunk de cliente '${asset}' (${(statsSize / 1024).toFixed(1)} KB) supera el límite crítico configurado de ${(maxErrorBytes / 1024).toFixed(0)} KB.`,
      context: asset
    });
  } else if (maxWarnBytes !== undefined && statsSize > maxWarnBytes) {
    auditor.addViolation({
      ruleId: 'bundle-chunk-size',
      severity: 'warning',
      file: relAssetPath,
      line: 1,
      message: `El chunk de cliente '${asset}' (${(statsSize / 1024).toFixed(1)} KB) excede el límite sugerido configurado de ${(maxWarnBytes / 1024).toFixed(0)} KB.`,
      context: asset
    });
  }
}

function auditCompiledChunks(
  distAssetsDir: string,
  bundleConfig: AuditEngineConfig['bundle'],
  projectRoot: string,
  auditor: BundleBudgetAuditor
): number {
  if (!fs.existsSync(distAssetsDir)) return 0;

  const assets = fs.readdirSync(distAssetsDir);
  const exemptPrefixes = bundleConfig?.exemptChunkPrefixes ?? [];
  let chunksAudited = 0;

  for (const asset of assets) {
    if (!asset.endsWith('.js') || asset.endsWith('.br') || asset.endsWith('.gz')) continue;
    chunksAudited++;
    if (exemptPrefixes.some(prefix => asset.startsWith(prefix))) continue;

    const assetPath = path.join(distAssetsDir, asset);
    const stats = fs.statSync(assetPath);
    const relAssetPath = toPosixRelative(projectRoot, assetPath);

    auditor['recordScanned'](relAssetPath);
    auditor['markRuleEvaluated']('bundle-chunk-size');
    auditSingleChunkBudget(asset, stats.size, relAssetPath, bundleConfig, auditor);
  }

  return chunksAudited;
}

export class BundleBudgetAuditor extends BaseAuditor<BundleBudgetRuleId> {
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    {
      id: 'dist',
      pattern: 'dist/',
      samplePath: 'dist/index.js',
      reason: 'Directorio de artefactos y bundle compilado de producción',
      isApplicable: (config) => config.bundle?.enabled !== false && config.packageDistribution?.enabled !== true
    }
  ];

  constructor(projectRoot: string = process.cwd()) {
    super({
      capabilities: { requiresBuild: true, ast: true },
      gitIgnoreEntries: BundleBudgetAuditor.gitIgnoreEntries,
      id: 'validate_bundle_budget',
      name: 'Bundle Budget & Client Leak Auditor',
      description: 'Audita límites de tamaño de bundles y fugas de imports',
      family: 'architecture',
      ruleIds: BUNDLE_BUDGET_RULES,
      packageName: 'Bundle',
      configKey: 'bundle.enabled',
      defaultConfig: { enabled: true },
      icon: '📦',
      coverage: {
        include: ['src/**/*.ts', 'src/**/*.vue', 'src/**/*.js', 'dist/**']
      },
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
    if (this.isSuiteGatingDisabled('Bundle audit desactivado en config')) {
      this.context.setMetric('Bundle Status', 'Disabled');
      return;
    }

    const config = getAuditConfig(this.projectRoot);
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
    const candidateFiles = allFiles.filter(f => !isTestPath(f) && !path.basename(f).endsWith('.d.ts'));

    const astEngine = astContext ?? new SharedAstContext();

    if (candidateFiles.length === 0) {
      this.markRuleNotApplicable('bundle-runtime-leak', 'No se encontraron archivos de código fuente candidatos');
      this.markRuleNotApplicable('bundle-heavy-import', 'No se encontraron archivos de código fuente candidatos');
    } else {
      for (const relPath of candidateFiles) {
        this.recordScanned(relPath);
        this.markRuleEvaluated('bundle-runtime-leak');
        this.markRuleEvaluated('bundle-heavy-import');
        const fullPath = path.resolve(this.projectRoot, relPath);
        auditFileImports(relPath, fullPath, this.projectRoot, effectiveUiDirs, forbiddenSegments, effectiveForbiddenUiImports, astEngine, this);
      }
    }

    const distAssetsDir = path.resolve(this.projectRoot, config.bundle?.distDir ?? 'dist/assets');
    const chunksAudited = auditCompiledChunks(distAssetsDir, config.bundle, this.projectRoot, this);
    if (chunksAudited === 0) {
      this.markRuleNotApplicable('bundle-chunk-size', 'No se encontraron artefactos compilados en dist');
    }

    this.context.setMetric('Files Audited', this.filesScannedCount);
    this.context.setMetric('Compiled Chunks', chunksAudited);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new BundleBudgetAuditor());
