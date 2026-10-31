/**
 * .agents/skills/auditor/references/extensions/composite-extension-example.ts
 *
 * HOST COMPOSITE EXTENSION BLUEPRINT (Node.js 26+ Native)
 *
 * Demonstrates a host project extension composed of multiple internal sub-auditors.
 * Conforms to:
 *   1. 3-Tier Hierarchical Architecture: Inherits directly from BaseAuditor (zero duplication).
 *   2. Resource Sharing: Coordinates shared AST/data across sub-auditors for peak performance.
 *   3. Atomic Console Reporting: Waits for all sub-auditors to finish before progress output is flushed.
 *   4. Mandatory Rule Registration: Every rule ID is typed and declared in ruleDescriptions.
 *
 * Registration in .auditor/audit.config.ts:
 *   export default defineAuditConfig({
 *     extensions: ['scripts/auditors/extensions/composite-extension-example.ts']
 *   });
 */

import {
  BaseAuditor,
  getAuditConfig,
  DEFAULT_AUDIT_CONFIG,
  createRuleCapabilities,
  type AuditorConfigFileRequirement,
  type FileScanRootsOptions
} from '@francogp/auditor';

export type HostDomainRuleId =
  | 'host-catalog-sync'
  | 'host-schema-invariants'
  | 'host-state-consistency'
  | 'host-missing-config';

export const HOST_DOMAIN_RULES: readonly HostDomainRuleId[] = [
  'host-catalog-sync',
  'host-schema-invariants',
  'host-state-consistency',
  'host-missing-config'
] as const;

export class HostDomainCompositeAuditor extends BaseAuditor<HostDomainRuleId> {
  // Declarative tool / host configuration file requirements:
  public static readonly configFiles: readonly AuditorConfigFileRequirement[] = [
    {
      file: '.host-domain.json',
      content: JSON.stringify({ version: 1, strictMode: true }, null, 2) + '\n',
      description: 'Host domain state machine configuration',
      customMissingMessage: 'Missing .host-domain.json domain configuration file.'
    }
  ];

  private readonly domainRoots: readonly string[];

  constructor(options: FileScanRootsOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(projectRoot);
    const domainRoots = options.roots ?? (config.paths.logicRoots?.length
      ? config.paths.logicRoots
      : (config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots));

    super({
      ruleFixers: {},
      id: 'validate_host_domain',
      name: 'Host Domain Invariants & Parity Validator',
      description: 'Valida sincronización de catálogos e invariantes del host',
      icon: '🧩',
      family: 'domain_data',
      packageName: 'HostDomain',
      ruleIds: HOST_DOMAIN_RULES,
      ruleCapabilities: {
        ...createRuleCapabilities(['host-catalog-sync', 'host-schema-invariants', 'host-state-consistency'], {
          speed: 'heavy',
          phase: 'normal',
          md: false,
          ast: true,
          changedOnly: true,
          critical: false
        }),
        ...createRuleCapabilities(['host-missing-config'], {
          speed: 'heavy',
          phase: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        })
      },
      configKey: 'domain.hostDomain',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      requiredPermissions: [],
      remediationPhase: 'contracts',
      usesThirdPartyTool: false,
      configFiles: HostDomainCompositeAuditor.configFiles,
      ruleDescriptions: {
        'host-catalog-sync': 'Desincronización en catálogo canónico',
        'host-schema-invariants': 'Violación de invariante en esquema',
        'host-state-consistency': 'Inconsistencia en máquina de estados',
        'host-missing-config': 'Archivo de configuración faltante'
      },
      ruleRemediations: {
        'host-catalog-sync':
          '1. Root Cause: El catálogo local no coincide con el registro maestro.\n' +
          '2. Diagnosis: Compara las claves entre el catálogo y la definición canónica en los archivos de datos.\n' +
          '3. Canonical Solution: Sincroniza las entradas faltantes o extra para asegurar paridad 1 a 1.\n' +
          '4. Example / Command: npm run auditor',
        'host-schema-invariants':
          '1. Root Cause: Se detectó un esquema de datos que incumple las invariantes de validación.\n' +
          '2. Diagnosis: Inspecciona los tipos y restricciones en el esquema reportado.\n' +
          '3. Canonical Solution: Corrige las discrepancias con Valibot o los tipos canónicos.\n' +
          '4. Example / Command: npm run auditor',
        'host-state-consistency':
          '1. Root Cause: Una máquina de estados o transición presenta una ruta inválida o no alcanzable.\n' +
          '2. Diagnosis: Verifica las transiciones definidas en la máquina frente a los eventos declarados.\n' +
          '3. Canonical Solution: Añade los estados o manejadores faltantes o poda transiciones obsoletas.\n' +
          '4. Example / Command: npm run auditor',
        'host-missing-config':
          '1. Root Cause: Falta un archivo de configuración requerido para el dominio (.host-domain.json).\n' +
          '2. Diagnosis: Verifica si el archivo de configuración existe en la raíz del proyecto.\n' +
          '3. Canonical Solution: Ejecuta "auditor fix" o "npm run auditor:fix" para auto-generarlo, o créalo según la especificación.\n' +
          '4. Example / Command: npm run auditor:fix'
      },
      coverage: {
        include: domainRoots.map((r) => `${r}/**/*.{ts,json}`),
        source: 'runtime'
      },
      projectRoot
    });
    this.domainRoots = domainRoots;
  }

  public override async runAudit(): Promise<void> {
    // 1. Load shared domain resources once (zero redundant disk I/O)
    const domainFiles = this.context.collectFiles(this.domainRoots, new Set(['.ts', '.json']));
    for (const f of domainFiles) {
      this.recordScanned(f);
    }

    // 2. Declarative config verification & auto-creation in --fix mode (timed individually with generic return value)
    const missingConfigs = await this.runSubAuditor('host-missing-config', async () => {
      return await this.verifyAndFixConfigFiles();
    });
    for (const missing of missingConfigs) {
      this.addViolation({
        ruleId: 'host-missing-config',
        severity: 'error',
        file: missing.file,
        message: missing.message,
        // Zero False-Fix Mandate: Mark fixable: true only because verifyAndFixConfigFiles()
        // automatically scaffolds the missing file in --fix mode:
        fixable: true
      });
    }

    // 3. Sub-auditor 1: Catalog Synchronization (timed individually)
    await this.runSubAuditor('host-catalog-sync', async () => {
      await this.runCatalogSyncSubAuditor(domainFiles);
    });

    // 4. Sub-auditor 2: Schema Invariants (timed individually)
    await this.runSubAuditor('host-schema-invariants', async () => {
      await this.runSchemaInvariantsSubAuditor(domainFiles);
    });

    // 5. Sub-auditor 3: State Consistency (timed individually)
    await this.runSubAuditor('host-state-consistency', async () => {
      await this.runStateConsistencySubAuditor(domainFiles);
    });
  }

  private async runCatalogSyncSubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting catalog parity...
  }

  private async runSchemaInvariantsSubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting schemas...
  }

  private async runStateConsistencySubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting state machines...
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HostDomainCompositeAuditor());
