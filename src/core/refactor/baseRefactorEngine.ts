/**
 * src/core/refactor/baseRefactorEngine.ts
 *
 * CANONICAL BASE REFACTOR ENGINE (Node.js 26+ Native)
 * Enforces pure configuration-driven resolution (audit.config.ts) and strict OOP inheritance
 * across all refactoring CLI tools (auditor-magic, auditor-domain, auditor-motion, auditor-o1, auditor-types).
 *
 * Mandate: Zero hardcoded directory arrays, zero skipped configurations, and 100% parity
 * between auditor validation suites and refactoring engines.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { getAuditConfig } from '../auditConfig.ts';
import { collectRepositoryFiles } from '../auditorBase.ts';
import { toPosixRelative } from '../safePath.ts';
import {
  isDataPath,
  isTestPath,
  isExemptFile
} from '../auditPathPredicates.ts';

export interface ScannedFileFindings<TFinding> {
  readonly file: string;
  readonly fullPath: string;
  readonly findings: readonly TFinding[];
}

export abstract class BaseRefactorEngine<TFinding = unknown, TPlan = unknown> {
  public readonly projectRoot: string;
  public readonly config: AuditEngineConfig;

  /**
   * Unique identifier of this refactoring tool (e.g. 'auditor-magic', 'auditor-domain').
   */
  public abstract readonly toolId: string;

  /**
   * Configuration section key in AuditEngineConfig (e.g. 'constants', 'domain', 'styles').
   */
  public abstract readonly configSectionKey?: keyof AuditEngineConfig;

  /**
   * Allowed file extensions for this refactoring engine.
   */
  public abstract readonly allowedExtensions: ReadonlySet<string>;

  constructor(
    projectRootOrOptions?: string | { projectRoot?: string; config?: AuditEngineConfig },
    explicitConfig?: AuditEngineConfig
  ) {
    if (typeof projectRootOrOptions === 'string') {
      this.projectRoot = path.resolve(projectRootOrOptions);
      this.config = explicitConfig ?? getAuditConfig(this.projectRoot);
    } else {
      this.projectRoot = path.resolve(projectRootOrOptions?.projectRoot ?? process.cwd());
      this.config = projectRootOrOptions?.config ?? explicitConfig ?? getAuditConfig(this.projectRoot);
    }
  }

  /**
   * Resolves target roots for this refactoring engine dynamically from audit.config.ts.
   * Defaults to config.paths.codeRoots ?? ['src', 'scripts'].
   */
  public resolveTargetRoots(): readonly string[] {
    return this.config.paths.codeRoots ?? ['src', 'scripts'];
  }

  /**
   * Determines whether this engine should inspect test files.
   * Strictly evaluates config.paths.includeTestsInCodeAudit (defaults to false).
   */
  public shouldIncludeTests(): boolean {
    return this.config.paths.includeTestsInCodeAudit === true;
  }

  /**
   * Determines whether this engine should inspect data catalog paths (paths.dataRoots).
   * Defaults to true, but overridden to false in constant / magic number engines.
   */
  public shouldIncludeDataPaths(): boolean {
    return true;
  }

  /**
   * Resolves global ignore patterns dynamically from config.paths.ignoreGlobs.
   */
  public resolveGlobalIgnorePatterns(): readonly string[] {
    return this.config.paths.ignoreGlobs ?? [];
  }

  /**
   * Resolves section-specific ignore patterns from audit.config.ts.
   */
  public resolveSectionIgnorePatterns(): readonly string[] {
    if (!this.configSectionKey) return [];
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return [];

    const sectionIgnores: string[] = [];
    if (Array.isArray(section.ignoreGlobs)) {
      for (const item of section.ignoreGlobs) {
        if (typeof item === 'string') sectionIgnores.push(item);
      }
    }

    return sectionIgnores;
  }

  /**
   * Combines global ignore patterns and tool section-specific ignore patterns.
   */
  public resolveCombinedIgnorePatterns(): readonly string[] {
    const combined = [
      ...this.resolveGlobalIgnorePatterns(),
      ...this.resolveSectionIgnorePatterns()
    ];
    return Array.from(new Set(combined));
  }

  /**
   * Resolves section-specific exempt paths and exempt files from audit.config.ts.
   */
  public resolveSectionExemptPaths(): readonly string[] {
    if (!this.configSectionKey) return [];
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return [];

    const exempt: string[] = []; // no-domain: utility collection
    if (Array.isArray(section.exemptPaths)) {
      for (const item of section.exemptPaths) {
        if (typeof item === 'string') exempt.push(item);
      }
    }
    if (Array.isArray(section.exemptFiles)) {
      for (const item of section.exemptFiles) {
        if (typeof item === 'string') exempt.push(item);
      }
    }
    if (Array.isArray(section.exemptCssFiles)) {
      for (const item of section.exemptCssFiles) {
        if (typeof item === 'string') exempt.push(item);
      }
    }

    return Array.from(new Set(exempt));
  }

  /**
   * Checks whether this refactoring tool is enabled in audit.config.ts.
   */
  public isToolEnabled(): boolean {
    if (!this.configSectionKey) return true;
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return true;
    return section.enabled !== false;
  }

  /**
   * Discovers all scannable files strictly according to audit.config.ts:
   * - Scoped to this engine's target roots (e.g. codeRoots)
   * - Respects global ignoreGlobs and section-specific ignoreGlobs
   * - Respects section-specific exemptPaths and exemptFiles
   * - Excludes test files if shouldIncludeTests() === false
   * - Excludes data catalog files if shouldIncludeDataPaths() === false
   * - Excludes globally exempt files (isExemptFile)
   */
  public getScannableFiles(): readonly string[] {
    const roots = this.resolveTargetRoots();
    const combinedIgnores = this.resolveCombinedIgnorePatterns();
    const sectionExemptPaths = this.resolveSectionExemptPaths();
    const seen = new Set<string>();
    const scannableFiles: string[] = []; // no-domain: utility collection

    for (const root of roots) {
      const fullRoot = path.resolve(this.projectRoot, root);
      if (!fs.existsSync(fullRoot)) continue;

      const collected = collectRepositoryFiles(
        fullRoot,
        this.projectRoot,
        combinedIgnores,
        this.allowedExtensions
      );

      for (const absFile of collected) {
        const relPosix = toPosixRelative(this.projectRoot, absFile);
        if (seen.has(relPosix)) continue;

        // Respect test inclusion setting
        if (!this.shouldIncludeTests() && isTestPath(relPosix)) {
          continue;
        }

        // Declaration files (.d.ts) never contain executable code
        if (relPosix.endsWith('.d.ts')) {
          continue;
        }

        // Respect data catalog exclusion setting
        if (!this.shouldIncludeDataPaths() && isDataPath(relPosix, this.config)) {
          continue;
        }

        // Respect global file exemption
        if (isExemptFile(relPosix, this.config)) {
          continue;
        }

        // Respect section-specific exempt paths
        if (this.isSectionPathExempt(relPosix, sectionExemptPaths)) {
          continue;
        }

        seen.add(relPosix);
        scannableFiles.push(relPosix);
      }
    }

    return scannableFiles.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Checks if a relative file path matches any section-specific exempt path or glob.
   */
  protected isSectionPathExempt(relPath: string, sectionExemptPaths: readonly string[]): boolean {
    const norm = relPath.toLowerCase();
    for (const rawExempt of sectionExemptPaths) {
      const normExempt = rawExempt.split('\\').join('/').toLowerCase();
      if (normExempt.endsWith('/**')) {
        const prefix = normExempt.slice(0, -3);
        if (norm === prefix || norm.startsWith(`${prefix}/`)) return true;
      } else if (normExempt.endsWith('/*')) {
        const prefix = normExempt.slice(0, -2);
        if (norm.startsWith(`${prefix}/`)) return true;
      } else if (norm === normExempt || norm.endsWith(`/${normExempt}`)) {
        return true;
      }
    }
    return false;
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
