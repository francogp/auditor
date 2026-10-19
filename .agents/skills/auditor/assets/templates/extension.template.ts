/**
 * .agents/skills/auditor/assets/templates/extension.template.ts
 *
 * CANONICAL EXTENSION SUB-AUDITOR TEMPLATE (@francogp/auditor v9.4+)
 *
 * Ready-to-copy blueprint for implementing custom project-specific sub-auditors
 * in scripts/auditors/<family>/<suite_name>.ts.
 *
 * Usage in .auditor/audit.config.ts:
 *   import { MyCustomAuditor } from '../scripts/auditors/architecture/validate_my_custom.ts';
 *   export default defineAuditConfig({
 *     extensions: [new MyCustomAuditor()]
 *   });
 */

import process from 'node:process';
import { BaseAuditor, createUniformRuleCapabilities, type RemediationPhaseId } from '@francogp/auditor';

export type MyCustomRuleId = 'my-custom-rule-a' | 'my-custom-rule-b';

export const MY_CUSTOM_RULES: readonly MyCustomRuleId[] = [
  'my-custom-rule-a',
  'my-custom-rule-b'
] as const;

export class MyCustomAuditor extends BaseAuditor<MyCustomRuleId> {
  public constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_my_custom',
      name: 'My Custom Project Rules Validator',
      description: 'Valida reglas específicas del dominio y arquitectura del proyecto',
      icon: '🛡️',
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(MY_CUSTOM_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: true,
        critical: false
      }),
      ruleIds: MY_CUSTOM_RULES,
      packageName: 'HostProject',
      configKey: 'customRules.enabled',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      // Mandatory strategic remediation phase (e.g. 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish')
      remediationPhase: 'contracts' as RemediationPhaseId,
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-custom-rule-a': 'Violación a la regla personalizada A',
        'my-custom-rule-b': 'Violación a la regla personalizada B'
      },
      ruleRemediations: {
        'my-custom-rule-a':
          'Causa Raíz: La regla personalizada A detectó una desviación arquitectónica.\n' +
          'Diagnóstico: Revisa el archivo reportado para verificar el contrato esperado.\n' +
          'Solución Canónica: Corrige la definición para alinearla con el estándar del proyecto.\n' +
          'Ejemplo / Comando: Consulta la documentación local en AGENTS.md.',
        'my-custom-rule-b':
          'Causa Raíz: La regla personalizada B detectó inconsistencia de tipos.\n' +
          'Diagnóstico: Revisa los tipos derivados en el módulo afectado.\n' +
          'Solución Canónica: Utiliza tipos canónicos de dominio sin strings crudos.\n' +
          'Ejemplo / Comando: npm run auditor:domain'
      },
      roots: ['src'],
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // Implement custom analysis logic wrapped in measureRule
    await this.runSubAuditor('my-custom-rule-a', async () => {
      // Diagnostic inspection code...
      // If violation found:
      // this.addViolation({
      //   ruleId: 'my-custom-rule-a',
      //   severity: 'error',
      //   file: 'src/example.ts',
      //   line: 10,
      //   message: 'Descripción del error detectado',
      //   context: 'snippet'
      // });
    });

    this.runSubAuditorSync('my-custom-rule-b', () => {
      // Synchronous diagnostic inspection code...
    });
  }
}
