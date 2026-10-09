/**
 * src/suites/architecture/validate_auditor_hygiene.ts
 *
 * AUDITOR ARCHITECTURE & HOMEBREW HYGIENE VALIDATOR (Node.js 26+ Native)
 *
 * Scans all official auditor suites, analyzers, and host project extensions,
 * validating that they leverage the unified core framework abstractions
 * (getPackageJson, AuditedDocument, scannerUtils, safePath, SharedAstContext,
 * auditTestPredicates, auditProjectIdentity) and eliminate homebrew anti-patterns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import { isTestPath } from '../../core/auditTestPredicates.ts';
import { isSelfProviderProject } from '../../core/auditProjectIdentity.ts';
import {
  AUDITOR_HOMEBREW_RULES,
  type AuditorHomebrewRuleId,
  type HomebrewInspectionContext,
  HomebrewDetectorRegistry
} from '../../analyzers/homebrew/index.ts';

enableCompileCache();

export { AUDITOR_HOMEBREW_RULES, type AuditorHomebrewRuleId };

export class AuditorHygieneAuditor extends BaseAuditor<AuditorHomebrewRuleId> {
  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_auditor_hygiene',
      name: 'Auditor Architecture & Homebrew Hygiene Validator',
      description: 'Valida higiene y uso de APIs canónicas en auditores',
      family: 'architecture',
      ruleIds: HomebrewDetectorRegistry.getRuleIds(),
      packageName: 'Auditor',
      icon: '🧹',
      ruleDescriptions: HomebrewDetectorRegistry.getRuleDescriptions(),
      configKey: 'auditorHygiene',
      defaultConfig: {
        enabled: true
      },
      capabilities: {
        lint: true
      },
      coverage: {
        include: ['src/suites/**/*.ts', 'src/analyzers/**/*.ts', 'scripts/auditors/**/*.ts'],
        exclude: ['src/analyzers/homebrew/**']
      },
      projectRoot
    });
  }

  private collectTargetFiles(): string[] {
    const files = new Set<string>();
    const isSelfRepo = isSelfProviderProject(this.projectRoot);
    const config = getAuditConfig(this.projectRoot);
    const exemptFiles = new Set(config.auditorHygiene?.exemptFiles ?? []);

    const roots: string[] = ['scripts/auditors'];
    if (isSelfRepo) {
      roots.push('src/suites', 'src/analyzers');
    }

    const candidateFiles = this.context.collectFiles(roots, new Set(['.ts']));

    for (const absPath of candidateFiles) {
      const relPath = normalizePosixPath(path.relative(this.projectRoot, absPath));
      if (absPath.endsWith('.d.ts')) continue;
      if (isTestPath(relPath)) continue;
      if (relPath.includes('analyzers/homebrew/')) continue;
      if (path.basename(relPath).startsWith('_')) continue;
      if (exemptFiles.has(relPath)) continue;

      files.add(absPath);
    }

    if (config.extensions && config.extensions.length > 0) {
      for (const ext of config.extensions) {
        const absPath = path.resolve(this.projectRoot, ext);
        if (fs.existsSync(absPath)) {
          files.add(absPath);
        }
      }
    }

    return Array.from(files);
  }

  public override async runAudit(): Promise<void> {
    for (const r of this.ruleIds) {
      this.markRuleEvaluated(r);
    }

    const config = getAuditConfig(this.projectRoot);
    const disabledDetectors = config.auditorHygiene?.disabledDetectors ?? [];
    const targetFiles = this.collectTargetFiles();

    let cleanFilesCount = 0;

    for (const absPath of targetFiles) {
      const relPath = normalizePosixPath(path.relative(this.projectRoot, absPath));
      const content = fs.readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      const isExtension = relPath.startsWith('scripts/auditors/') || !relPath.startsWith('src/');
      const isBuiltinSuite = relPath.startsWith('src/suites/');
      const isAnalyzer = relPath.startsWith('src/analyzers/');

      const inspectionContext: HomebrewInspectionContext = {
        filePath: relPath,
        absolutePath: absPath,
        content,
        lines,
        isExtension,
        isBuiltinSuite,
        isAnalyzer,
        projectRoot: this.projectRoot
      };

      const findings = HomebrewDetectorRegistry.run(inspectionContext, disabledDetectors);

      if (findings.length === 0) {
        cleanFilesCount++;
      } else {
        for (const f of findings) {
          this.addViolation({
            ruleId: f.ruleId,
            file: relPath,
            line: f.line,
            message: f.message,
            context: f.context,
            severity: f.severity ?? 'error'
          });
        }
      }

      this.recordScanned(absPath);
    }

    this.context.setMetric('Auditor Files Inspected', targetFiles.length);
    this.context.setMetric('Active Homebrew Detectors', HomebrewDetectorRegistry.getAll().length);
    this.context.setMetric('Clean Auditor Files', cleanFilesCount);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new AuditorHygieneAuditor());
