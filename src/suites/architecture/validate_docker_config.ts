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
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';

enableCompileCache();

export const DOCKER_CONFIG_RULES = [
  'dockerignore-missing',
  'dockerignore-missing-pattern'
] as const;

export type DockerConfigRuleId = (typeof DOCKER_CONFIG_RULES)[number];

export const MANDATORY_DOCKER_IGNORE_PATTERNS: readonly string[] = [
  'node_modules',
  '.git',
  'scratch',
  '.env*'
] as const;

export const CANONICAL_DOCKERIGNORE_LINES = [
  '# Archivos y dependencias ignoradas para construccion de imagenes Docker',
  'node_modules',
  '.git',
  'dist',
  'scratch',
  '.env*',
  '*.log',
  ''
] as const;

export const CANONICAL_DOCKERIGNORE_CONTENT = CANONICAL_DOCKERIGNORE_LINES.join('\n');

export const DOCKER_FILE_CANDIDATES: readonly string[] = [
  'Dockerfile',
  'Dockerfile.dev',
  'Dockerfile.prod',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml'
] as const;

export function isDockerProjectContext(projectRoot: string): boolean {
  return DOCKER_FILE_CANDIDATES.some((f) => fs.existsSync(path.join(projectRoot, f)));
}

export const DOCKER_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<DockerConfigRuleId> = {
  id: 'docker-config',
  file: '.dockerignore',
  candidateFiles: ['.dockerignore'],
  description: 'Configuración de exclusiones Docker (.dockerignore)',
  ruleId: 'dockerignore-missing',
  isApplicable: (_config, projectRoot) => isDockerProjectContext(projectRoot),
  generateDefaultContent: () => CANONICAL_DOCKERIGNORE_CONTENT
};

export class ValidateDockerConfigAuditor extends BaseAuditor<DockerConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<DockerConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<DockerConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<DockerConfigRuleId> = {
      ...DOCKER_CONFIG_REQUIREMENT,
      ...(optionsObj?.configFile
        ? {
            file: optionsObj.configFile,
            candidateFiles: [optionsObj.configFile]
          }
        : {})
    };

    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createUniformRuleCapabilities(DOCKER_CONFIG_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'priority',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'dockerignore-missing',
        'dockerignore-missing-pattern'
      ],
      configFiles: [configRequirement],
      id: 'validate_docker_config',
      name: 'Docker Configuration Validator',
      description: 'Valida baseline de .dockerignore en proyectos Docker',
      icon: '🐳',
      family: 'architecture',
      ruleIds: DOCKER_CONFIG_RULES,
      packageName: 'Docker',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'dockerignore-missing': 'Archivo .dockerignore ausente',
        'dockerignore-missing-pattern': 'Falta patrón crítico en dockerignore'
      },
      ruleRemediations: {
        'dockerignore-missing':
          'Diagnóstico: El proyecto tiene Dockerfile o compose pero falta .dockerignore.\n' +
          'Remediación: Ejecuta `auditor fix` para auto-scaffoldear el .dockerignore canónico.',
        'dockerignore-missing-pattern':
          'Diagnóstico: Faltan exclusiones críticas en .dockerignore (node_modules, .git, scratch, .env*).\n' +
          'Remediación: Ejecuta `auditor fix` para añadir los patrones requeridos sin alterar los existentes.'
      },
      coverage: {
        include: ['.dockerignore', 'Dockerfile*']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    if (!isDockerProjectContext(this.projectRoot)) {
      this.markSkipped('No se detectó Dockerfile ni configuración Docker en el proyecto');
      return;
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
        this.markRuleNotApplicable('dockerignore-missing-pattern', 'Archivo .dockerignore ausente');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath =
      path.relative(this.projectRoot, resolvedPath) || DOCKER_CONFIG_REQUIREMENT.file;
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
      return;
    }

    const lines = rawContent.split(/\r?\n/).map((l) => l.trim());
    const existingPatterns = new Set(lines.filter((l) => l && !l.startsWith('#')));

    let modified = false;
    const toAppend: string[] = []; // no-domain: Dynamic list of patterns to append to file

    this.runSubAuditorSync('dockerignore-missing-pattern', () => {
      for (const pattern of MANDATORY_DOCKER_IGNORE_PATTERNS) {
        const matches =
          existingPatterns.has(pattern) ||
          (pattern.endsWith('*') &&
            [...existingPatterns].some((ep) => ep.startsWith(pattern.slice(0, -1))));

        if (!matches) {
          if (isFix) {
            toAppend.push(pattern);
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'dockerignore-missing-pattern',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `El patrón "${pattern}" es obligatorio en .dockerignore para seguridad y aislamiento.`
            });
          }
        }
      }
    });

    if (isFix && modified && toAppend.length > 0) {
      const addition = '\n' + toAppend.join('\n') + '\n';
      fs.appendFileSync(resolvedPath, addition, 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDockerConfigAuditor());
