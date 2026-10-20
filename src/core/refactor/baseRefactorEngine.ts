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
import { BaseAuditor } from '../auditorBase.ts';
import { isPathContained, stripGlobSuffix } from '../safePath.ts';

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
    const codeRoots = this.config.paths?.codeRoots;
    if (codeRoots && codeRoots.length > 0) {
      return codeRoots;
    }
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
    return this.auditor.exemptPaths;
  }

  public isToolEnabled(): boolean {
    if (!this.configSectionKey) return true;
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return true;
    return section.enabled !== false;
  }

  private isPathInRoots(relPath: string, roots: readonly string[]): boolean {
    const absPath = path.resolve(this.projectRoot, relPath);
    return roots.some((root) => {
      const cleanRoot = stripGlobSuffix(root);
      const absRoot = path.resolve(this.projectRoot, cleanRoot);
      return isPathContained(absRoot, absPath);
    });
  }

  /**
   * Resolves scannable files strictly delegated to the canonical sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  public getScannableFiles(): readonly string[] {
    const files = this.auditor.getScannableFiles();
    const codeRoots = this.resolveTargetRoots();
    let filtered = files;
    if (codeRoots && codeRoots.length > 0) {
      filtered = filtered.filter((f) => this.isPathInRoots(f, codeRoots));
    }
    if (this.shouldIncludeDataPaths()) {
      return filtered;
    }
    const dataRoots = this.config.paths.dataRoots ?? [];
    if (dataRoots.length === 0) return filtered;
    return filtered.filter((f) => !this.isPathInRoots(f, dataRoots));
  }

  /**
   * Checks whether a given project-relative path is scannable by the sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  public isPathScannable(relPath: string): boolean {
    if (!this.auditor.isPathScannable(relPath)) {
      return false;
    }
    const codeRoots = this.resolveTargetRoots();
    if (codeRoots && codeRoots.length > 0 && !this.isPathInRoots(relPath, codeRoots)) {
      return false;
    }
    if (!this.shouldIncludeDataPaths()) {
      const dataRoots = this.config.paths.dataRoots ?? [];
      if (dataRoots.length > 0 && this.isPathInRoots(relPath, dataRoots)) {
        return false;
      }
    }
    return true;
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
