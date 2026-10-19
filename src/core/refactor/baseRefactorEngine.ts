/**
 * src/core/refactor/baseRefactorEngine.ts
 *
 * CANONICAL BASE REFACTOR ENGINE (Node.js 26+ Native)
 * Enforces pure configuration-driven resolution and strict sub-auditor inheritance
 * across all refactoring CLI tools (auditor-magic, auditor-domain, auditor-motion, auditor-o1, auditor-types, auditor-dupes).
 *
 * Mandate: Every refactoring engine constructor requires a canonical sub-auditor instance.
 * File discovery, roots, allowed extensions, and exclusions are delegated 100% to the sub-auditor,
 * guaranteeing absolute 1:1 parity between audit findings and refactoring tool targets.
 */

import path from 'node:path';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { getAuditConfig } from '../auditConfig.ts';
import { BaseAuditor, FileScanAuditor } from '../auditorBase.ts';

export interface ScannedFileFindings<TFinding> {
  readonly file: string;
  readonly fullPath: string;
  readonly findings: readonly TFinding[];
}

export abstract class BaseRefactorEngine<
  TFinding = unknown,
  TPlan = unknown,
  TAuditor extends BaseAuditor<any> = BaseAuditor<any>
> {
  protected readonly auditor: TAuditor;

  /**
   * Unique identifier of this refactoring tool (e.g. 'auditor-magic', 'auditor-domain').
   */
  public abstract readonly toolId: string;

  /**
   * Configuration section key in AuditEngineConfig (e.g. 'constants', 'domain', 'animation').
   */
  public abstract readonly configSectionKey?: keyof AuditEngineConfig;

  constructor(auditor: TAuditor) {
    if (!auditor) {
      throw new Error('[BaseRefactorEngine]: Constructor requires a canonical sub-auditor instance.');
    }
    this.auditor = auditor;
  }

  public get projectRoot(): string {
    return this.auditor.projectRoot;
  }

  public get config(): AuditEngineConfig {
    return getAuditConfig(this.projectRoot);
  }

  public get allowedExtensions(): ReadonlySet<string> {
    return this.auditor.allowedExtensions;
  }

  public getAuditor(): TAuditor {
    return this.auditor;
  }

  public resolveTargetRoots(): readonly string[] {
    return this.auditor.roots;
  }

  public shouldIncludeTests(): boolean {
    return this.config.paths.includeTestsInCodeAudit === true;
  }

  public shouldIncludeDataPaths(): boolean {
    return true;
  }

  public resolveGlobalIgnorePatterns(): readonly string[] {
    return this.config.paths.ignoreGlobs ?? [];
  }

  public resolveSectionIgnorePatterns(): readonly string[] {
    return this.auditor.extraIgnorePatterns;
  }

  public resolveCombinedIgnorePatterns(): readonly string[] {
    const combined = [
      ...this.resolveGlobalIgnorePatterns(),
      ...this.resolveSectionIgnorePatterns()
    ];
    return Array.from(new Set(combined));
  }

  public resolveSectionExemptPaths(): readonly string[] {
    return this.auditor instanceof FileScanAuditor ? this.auditor.exemptPaths : [];
  }

  public isToolEnabled(): boolean {
    if (!this.configSectionKey) return true;
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return true;
    return section.enabled !== false;
  }

  /**
   * Resolves scannable files strictly delegated to the canonical sub-auditor.
   */
  public getScannableFiles(): readonly string[] {
    return this.auditor.getScannableFiles();
  }

  /**
   * Checks whether a given project-relative path is scannable by the sub-auditor.
   */
  public isPathScannable(relPath: string): boolean {
    return this.auditor.isPathScannable(relPath);
  }

  /**
   * Scans an individual file to discover refactoring opportunities.
   */
  public abstract discoverInFile(filePath: string): readonly TFinding[];

  /**
   * Discovers refactoring opportunities across all scannable files in the project.
   */
  public discoverAll(): readonly ScannedFileFindings<TFinding>[] {
    const files = this.getScannableFiles();
    const results: ScannedFileFindings<TFinding>[] = [];

    for (const relFile of files) {
      const fullPath = path.resolve(this.projectRoot, relFile);
      const findings = this.discoverInFile(fullPath);
      if (findings.length > 0) {
        results.push({
          file: relFile,
          fullPath,
          findings
        });
      }
    }

    return results;
  }

  /**
   * Creates a structured refactor plan for an individual file.
   */
  public abstract createPlan(id: string, findings: readonly TFinding[]): TPlan;

  /**
   * Applies a refactor plan to source code deterministically.
   */
  public abstract applyPlan(
    projectRoot: string,
    plan: TPlan
  ): Promise<{ readonly modifiedFiles: readonly string[] }> | { readonly modifiedFiles: readonly string[] };
}
