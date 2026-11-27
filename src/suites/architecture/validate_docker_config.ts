/**
 * src/suites/architecture/validate_docker_config.ts
 *
 * DOCKER CONFIGURATION & CONTAINER ISOLATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces standardized Docker ignore patterns and container security hygiene:
 *   1. Conditionally active only when Dockerfile or compose files exist in the project.
 *   2. Guarantees .dockerignore exists on disk; auto-scaffolds in --fix mode.
 *   3. Enforces mandatory exclusion of sensitive artifacts and dependencies:
 *      - node_modules
 *      - .git
 *      - scratch
 *      - .env*
 *      - dist
 *   4. Preserves custom patterns and comments without destruction.
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { getAuditConfig } from '../../core/auditConfigLoader.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases
} from '../../core/auditorBase.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import {
  parseSupabaseSchemaHeader,
  SUPABASE_DOCKER_SCHEMA_VERSION,
  type SupabaseDockerConfig
} from '../../supabase/supabaseConfigTypes.ts';

enableCompileCache();

export const DOCKER_CONFIG_RULES = [
  'dockerignore-missing',
  'dockerignore-missing-pattern',
  'dockerignore-missing-supabase-pattern',
  'docker-supabase-schema-outdated'
] as const;

export type DockerConfigRuleId = (typeof DOCKER_CONFIG_RULES)[number];

export const MANDATORY_DOCKER_IGNORE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  'scratch',
  '.env*'
] as const;

export const CANONICAL_DOCKERIGNORE_LINES = [
  '# Ignored files and dependencies for Docker image builds',
  'node_modules',
  '.git',
  'dist',
  'scratch',
  '.env*',
  '*.log',
  ''
] as const;

export const CANONICAL_DOCKERIGNORE_CONTENT = CANONICAL_DOCKERIGNORE_LINES.join('\n');

export const DOCKER_TRIGGER_PATTERNS: readonly string[] = [
  'Dockerfile',
  'Dockerfile.*',
  '**/Dockerfile',
  '**/Dockerfile.*',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml'
] as const;

export const DOCKER_FILE_CANDIDATES: readonly string[] = [
  'Dockerfile',
  'Dockerfile.dev',
  'Dockerfile.prod',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml'
] as const;

const DOCKER_SCAN_EXCLUDE_PATTERNS: readonly string[] = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'scratch/**'
];

export function discoverDockerTriggerFiles(projectRoot: string): string[] {
  if (!fs.existsSync(projectRoot)) {
    return [];
  }
  const matches = fs.globSync([...DOCKER_TRIGGER_PATTERNS], {
    cwd: projectRoot,
    exclude: [...DOCKER_SCAN_EXCLUDE_PATTERNS]
  });
  return [...new Set(matches.map((entry) => normalizePosixPath(entry)))].sort();
}

export function isDockerProjectContext(
  projectRoot: string,
  supabaseDocker?: SupabaseDockerConfig
): boolean {
  return (
    discoverDockerTriggerFiles(projectRoot).length > 0 ||
    fs.existsSync(path.join(projectRoot, '.dockerignore')) ||
    Boolean(supabaseDocker?.enabled)
  );
}

export const DOCKER_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<DockerConfigRuleId> = {
  id: 'docker-config',
  file: '.dockerignore',
  candidateFiles: ['.dockerignore'],
  description: 'Docker exclusions configuration (.dockerignore)',
  ruleId: 'dockerignore-missing',
  isApplicable: (config, projectRoot) => isDockerProjectContext(projectRoot, config.supabaseDocker),
  generateDefaultContent: () => CANONICAL_DOCKERIGNORE_CONTENT
};

export interface DockerConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}

function collectMissingDockerignorePatterns(
  patterns: readonly string[],
  existingPatterns: ReadonlySet<string>
): string[] {
  const missing: string[] = [];
  for (const pattern of patterns) {
    const matches =
      existingPatterns.has(pattern) ||
      (pattern.endsWith('*') &&
        [...existingPatterns].some((ep) => ep.startsWith(pattern.slice(0, -1))));
    if (!matches) {
      missing.push(pattern);
    }
  }
  return missing;
}

export class ValidateDockerConfigAuditor extends BaseAuditor<DockerConfigRuleId> {
  public constructor(options: DockerConfigAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<DockerConfigRuleId> = {
      ...DOCKER_CONFIG_REQUIREMENT,
      ...(options.configFile
        ? {
            file: options.configFile,
            candidateFiles: [options.configFile]
          }
        : {})
    };

    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createUniformRuleCapabilities(DOCKER_CONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      configFiles: [configRequirement],
      id: 'validate_docker_config',
      name: 'Docker Configuration Validator',
      description: 'Validates .dockerignore baseline in Docker projects',
      icon: '🐳',
      family: 'architecture',
      ruleIds: DOCKER_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DOCKER_CONFIG_RULES, 'setup'),
      packageName: 'Docker',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'dockerignore-missing': 'Missing .dockerignore file',
        'dockerignore-missing-pattern': 'Missing critical pattern in .dockerignore',
        'dockerignore-missing-supabase-pattern': 'Missing Supabase .dockerignore pattern',
        'docker-supabase-schema-outdated': 'Outdated Supabase Docker artifact'
      },
      ruleRemediations: {
        'dockerignore-missing':
          '📖 REMEDIATION GUIDE: dockerignore-missing\n' +
          '1. Root Cause: The project contains Dockerfile or compose files but lacks a `.dockerignore` file, leading to excessive build context and secret leaks.\n' +
          '2. Diagnosis: Check project root for `.dockerignore`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to automatically scaffold the canonical `.dockerignore` file.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'dockerignore-missing-pattern':
          '📖 REMEDIATION GUIDE: dockerignore-missing-pattern\n' +
          '1. Root Cause: Critical ignore patterns (`node_modules`, `.git`, `scratch`, `.env*`) are missing from `.dockerignore`.\n' +
          '2. Diagnosis: Inspect existing `.dockerignore` against mandatory exclusions.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to append missing patterns without modifying existing rules.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'dockerignore-missing-supabase-pattern':
          '📖 REMEDIATION GUIDE: dockerignore-missing-supabase-pattern\n' +
          '1. Root Cause: `supabaseDocker.profiles.remote` is enabled, but `.dockerignore` is missing Supabase managed artifact exclusions (`docker`, `generated`, `.env*`).\n' +
          '2. Diagnosis: Inspect `.dockerignore` for `<supabaseDir>/docker`, `<supabaseDir>/generated`, and `<supabaseDir>/.env*`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to append missing Supabase exclusions under `# Supabase Docker managed artifacts`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'docker-supabase-schema-outdated':
          '📖 REMEDIATION GUIDE: docker-supabase-schema-outdated\n' +
          '1. Root Cause: A generated Supabase Compose or Dockerfile artifact was created by an older `@francogp/auditor/supabase` schema version.\n' +
          '2. Diagnosis: Inspect the `# @auditor-supabase-schema:` header on the reported file.\n' +
          '3. Canonical Solution: Re-run `npm run auditor:supabase -- clone && npm run auditor:supabase -- generate` to regenerate artifacts with the current structural schema.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:supabase -- clone && npm run auditor:supabase -- generate`'
      },
      coverage: {
        include: ['.dockerignore', ...DOCKER_TRIGGER_PATTERNS]
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const supabaseDocker = getAuditConfig().supabaseDocker;
    const triggerFiles = discoverDockerTriggerFiles(this.projectRoot);
    const hasDockerignore = fs.existsSync(
      path.join(this.projectRoot, DOCKER_CONFIG_REQUIREMENT.file)
    );
    if (triggerFiles.length === 0 && !hasDockerignore && !supabaseDocker?.enabled) {
      this.markSkipped(
        'No Dockerfile, .dockerignore, or Supabase Docker configuration detected in project'
      );
      return;
    }

    if (triggerFiles.length > 0) {
      this.recordScannedMany(triggerFiles);
    }

    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('dockerignore-missing', () => {
      configFile = this.resolveConfigFile(DOCKER_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('dockerignore-missing', () =>
        this.ensureConfigFile(DOCKER_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('dockerignore-missing-pattern', 'Missing .dockerignore file');
        this.markRuleNotApplicable(
          'dockerignore-missing-supabase-pattern',
          'Missing .dockerignore file'
        );
        this.markRuleNotApplicable('docker-supabase-schema-outdated', 'Missing .dockerignore file');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath = path.relative(this.projectRoot, resolvedPath) || DOCKER_CONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.runSubAuditorSync('dockerignore-missing', () => {
        this.addViolation({
          ruleId: 'dockerignore-missing',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `No se pudo leer ${relPath}.`
        });
      });
      this.markRuleNotApplicable(
        'dockerignore-missing-pattern',
        'Could not read .dockerignore file'
      );
      this.markRuleNotApplicable(
        'dockerignore-missing-supabase-pattern',
        'Could not read .dockerignore file'
      );
      this.markRuleNotApplicable(
        'docker-supabase-schema-outdated',
        'Could not read .dockerignore file'
      );
      return;
    }

    const lines = rawContent.split(/\r?\n/).map((l) => l.trim());
    const existingPatterns = new Set(lines.filter((l) => l && !l.startsWith('#')));

    let modified = false;
    const toAppend: string[] = []; // no-domain: Dynamic list of patterns to append to file

    this.runSubAuditorSync('dockerignore-missing-pattern', () => {
      const missingCore = collectMissingDockerignorePatterns(
        MANDATORY_DOCKER_IGNORE_PATTERNS,
        existingPatterns
      );
      for (const pattern of missingCore) {
        if (isFix) {
          toAppend.push(pattern);
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'dockerignore-missing-pattern',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `Pattern "${pattern}" is mandatory in .dockerignore for security and isolation.`
          });
        }
      }
    });

    const supabaseToAppend: string[] = []; // no-domain: Dynamic list of Supabase patterns to append
    const trimmedSupabaseDir = supabaseDocker?.supabaseDir?.trim() ?? '';
    if (supabaseDocker?.enabled && supabaseDocker.profiles.remote?.enabled && trimmedSupabaseDir) {
      const baseDir = normalizePosixPath(trimmedSupabaseDir).replace(/\/+$/u, '');
      const requiredSupabasePatterns = [
        `${baseDir}/docker`,
        `${baseDir}/generated`,
        `${baseDir}/.env*`
      ] as const;
      this.runSubAuditorSync('dockerignore-missing-supabase-pattern', () => {
        const missingSupa = collectMissingDockerignorePatterns(
          requiredSupabasePatterns,
          existingPatterns
        );
        for (const pattern of missingSupa) {
          if (isFix) {
            supabaseToAppend.push(pattern);
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'dockerignore-missing-supabase-pattern',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `Pattern "${pattern}" is mandatory in .dockerignore when supabaseDocker.profiles.remote is enabled.`
            });
          }
        }
      });
    } else {
      this.runSubAuditorSync('dockerignore-missing-supabase-pattern', () =>
        this.markRuleNotApplicable(
          'dockerignore-missing-supabase-pattern',
          'supabaseDocker remote profile is not enabled'
        )
      );
    }

    if (isFix && modified && (toAppend.length > 0 || supabaseToAppend.length > 0)) {
      let addition = '';
      if (toAppend.length > 0) {
        addition += '\n' + toAppend.join('\n') + '\n';
      }
      if (supabaseToAppend.length > 0) {
        addition += '\n# Supabase Docker managed artifacts\n' + supabaseToAppend.join('\n') + '\n';
      }
      fs.appendFileSync(resolvedPath, addition, 'utf8');
    }

    this.runSubAuditorSync('docker-supabase-schema-outdated', () => {
      auditSupabaseSchemaVersion(this, supabaseDocker);
    });
  }
}

interface SupabaseArtifactEntry {
  readonly absPath: string;
  readonly isDockerfile: boolean;
}

function resolveWithinProjectRoot(
  projectRoot: string,
  ...segments: readonly string[]
): string | null {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, ...segments);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

function pushCandidateArtifact(
  candidates: SupabaseArtifactEntry[],
  absPath: string | null,
  isDockerfile: boolean
): void {
  if (absPath) {
    candidates.push({ absPath, isDockerfile });
  }
}

function collectExistingSupabaseArtifacts(
  projectRoot: string,
  config: SupabaseDockerConfig
): readonly SupabaseArtifactEntry[] {
  const candidates: SupabaseArtifactEntry[] = [];
  if (config.profiles.remote?.enabled) {
    pushCandidateArtifact(
      candidates,
      resolveWithinProjectRoot(projectRoot, config.supabaseDir, 'generated', 'docker-compose.yml'),
      false
    );
    pushCandidateArtifact(
      candidates,
      resolveWithinProjectRoot(projectRoot, config.supabaseDir, 'docker', 'Dockerfile'),
      true
    );
  }
  if (config.profiles.localFull?.enabled) {
    pushCandidateArtifact(
      candidates,
      resolveWithinProjectRoot(
        projectRoot,
        config.supabaseDir,
        'generated',
        'local-full',
        'docker-compose.yml'
      ),
      false
    );
  }
  if (config.profiles.lite) {
    for (const [name, profile] of config.profiles.lite.entries()) {
      if (!profile.enabled) continue;
      pushCandidateArtifact(
        candidates,
        resolveWithinProjectRoot(
          projectRoot,
          config.supabaseDir,
          'generated',
          'lite',
          name,
          'docker-compose.yml'
        ),
        false
      );
    }
  }
  return candidates.filter((entry) => fs.existsSync(entry.absPath));
}

function auditSupabaseSchemaVersion(
  auditor: ValidateDockerConfigAuditor,
  supabaseDocker: SupabaseDockerConfig | undefined
): void {
  if (!supabaseDocker?.enabled || !supabaseDocker.supabaseDir.trim()) {
    auditor.markRuleNotApplicable(
      'docker-supabase-schema-outdated',
      'supabaseDocker is not enabled'
    );
    return;
  }

  const artifacts = collectExistingSupabaseArtifacts(auditor.projectRoot, supabaseDocker);
  if (artifacts.length === 0) {
    auditor.markRuleNotApplicable(
      'docker-supabase-schema-outdated',
      'No generated Supabase Docker artifacts found on disk'
    );
    return;
  }

  for (const artifact of artifacts) {
    const relArtifact = normalizePosixPath(path.relative(auditor.projectRoot, artifact.absPath));
    const content = fs.readFileSync(artifact.absPath, 'utf8');
    const foundVersion = parseSupabaseSchemaHeader(content);
    if (foundVersion !== null && foundVersion >= SUPABASE_DOCKER_SCHEMA_VERSION) continue;

    const foundLabel = foundVersion === null ? 'unversioned' : `v${foundVersion}`;
    const fixCmd = artifact.isDockerfile
      ? 'npm run auditor:supabase -- clone && npm run auditor:supabase -- generate'
      : 'npm run auditor:supabase -- generate';
    auditor.addViolation({
      ruleId: 'docker-supabase-schema-outdated',
      severity: 'error',
      file: relArtifact,
      line: 1,
      message: `Supabase Docker artifact '${relArtifact}' uses schema ${foundLabel}, below required v${SUPABASE_DOCKER_SCHEMA_VERSION}. Regenerate with '${fixCmd}'.`,
      context: foundLabel
    });
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDockerConfigAuditor());
