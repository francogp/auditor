/**
 * src/analyzers/homebrew/homebrewRegistry.ts
 *
 * Dynamic registry and runner coordinator for homebrew detectors.
 */

import type {
  AuditorHomebrewRuleId,
  HomebrewDetector,
  HomebrewFinding,
  HomebrewInspectionContext
} from './homebrewTypes.ts';

export class HomebrewDetectorRegistry {
  private static readonly detectors = new Map<string, HomebrewDetector>();

  public static register(detector: HomebrewDetector): void {
    this.detectors.set(detector.id, detector);
  }

  public static unregister(id: string): boolean {
    return this.detectors.delete(id);
  }

  public static get(id: string): HomebrewDetector | undefined {
    return this.detectors.get(id);
  }

  public static getAll(): readonly HomebrewDetector[] {
    return Array.from(this.detectors.values());
  }

  public static clear(): void {
    this.detectors.clear();
  }

  public static getRuleIds(): readonly AuditorHomebrewRuleId[] {
    const ids = new Set<AuditorHomebrewRuleId>();
    for (const d of this.detectors.values()) {
      ids.add(d.ruleId);
    }
    return Array.from(ids);
  }

  public static getRuleDescriptions(): Record<AuditorHomebrewRuleId, string> {
    const descriptions: Record<string, string> = {};
    for (const d of this.detectors.values()) {
      descriptions[d.ruleId] = d.ruleDescription;
    }
    return descriptions as Record<AuditorHomebrewRuleId, string>;
  }

  public static getRuleRemediations(): Record<AuditorHomebrewRuleId, string> {
    const remediations: Record<string, string> = {
      'auditor-manual-package-json':
        'Usa la utilidad canónica getPackageJson(projectRoot) de src/core/packageJson.ts en lugar de leer o parsear package.json manualmente.',
      'auditor-manual-vue-sfc-regex':
        'Usa AuditedDocument o parseVueSfc() de core para analizar bloques SFC de Vue en lugar de expresiones regulares manuales frágiles.',
      'auditor-manual-ts-ast':
        'Usa SharedAstContext o getAstContext(projectRoot) para reutilizar el AST de TypeScript en lugar de compilar o parsear archivos manualmente.',
      'auditor-raw-console':
        'Reemplaza llamadas directas a console.log/error/warn con this.addViolation(), this.renderTable() o printTerminal() autorizado.',
      'auditor-manual-comment-stripping':
        'Usa las utilidades canónicas stripComments() de src/core/ o el AST de TypeScript en vez de regexes manuales para eliminar comentarios.',
      'auditor-manual-brace-counting':
        'Usa el parser canónico de AST o extractBlocks() para balancear llaves en lugar de contadores manuales propensos a errores.',
      'auditor-manual-file-walker':
        'Hereda de FileScanAuditor o usa this.context.collectFiles() en lugar de recorrer el sistema de archivos con walkers manuales.',
      'auditor-homebrew-predicates':
        'Importa predicados canónicos desde src/core/auditTestPredicates.ts o src/core/auditConfig.ts en vez de reimplementar chequeos de tests.',
      'auditor-manual-rule-timing':
        'Envuelve la ejecución de reglas en this.runRuleMeasured(ruleId, () => ...) para registrar tiempos en lugar de timers manuales.',
      'auditor-hardcoded-config':
        'Resuelve rutas, directorios y configuraciones dinámicamente desde audit.config.ts sin nombres de archivo ni constantes hardcodeadas.',
      'auditor-manual-step-logging':
        'Elimina logs de pasos secuenciales ([1/6], [2/6]) dentro de subauditores; el streaming runner gestiona el ciclo de vida y estado visual.',
      'auditor-unmeasured-rule':
        'Envuelve la evaluación de la regla con this.runRuleMeasured() o reportRuleDuration() para garantizar medición y telemetría de rendimiento.',
      'auditor-redundant-rule-evaluated':
        'Elimina llamadas redundantes a markRuleEvaluated() cuando la regla ya se mide automáticamente con runRuleMeasured().',
      'auditor-third-party-tool-contract':
        'Declara usesThirdPartyTool: true con thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) en el constructor si ejecutas herramientas externas, o usesThirdPartyTool: false si es un analizador nativo.',
      'auditor-inefficient-file-scan':
        'Evita iterar reglas antes de archivos o pasar comodines ciegos (**/*.ext) a CLIs externas; usa this.scanFilesSinglePass(), FileScanAuditor o pasa la lista de archivos descubiertos por el auditor.'
    };
    return remediations as Record<AuditorHomebrewRuleId, string>;
  }

  public static run(
    context: HomebrewInspectionContext,
    disabledDetectors: readonly string[] = [],
    onDetectorDuration?: (ruleId: AuditorHomebrewRuleId, durationMs: number) => void
  ): HomebrewFinding[] {
    // Whole file exemption check
    if (
      context.content.includes('// homebrew-ok: all') ||
      context.content.includes('// homebrew-exempt')
    ) {
      return [];
    }

    const disabledSet = new Set(disabledDetectors);
    const findings: HomebrewFinding[] = [];

    for (const detector of this.detectors.values()) {
      if (disabledSet.has(detector.id)) continue;

      const t0 = performance.now();
      const detectorFindings = detector.detect(context);
      if (onDetectorDuration) {
        onDetectorDuration(detector.ruleId, performance.now() - t0);
      }
      for (const finding of detectorFindings) {
        const lineIdx = finding.line - 1;
        const lineText = context.lines[lineIdx] ?? '';
        const prevLineText = lineIdx > 0 ? (context.lines[lineIdx - 1] ?? '') : '';

        // Line-level or previous-line exemption check
        if (
          lineText.includes('// homebrew-ok:') ||
          lineText.includes('// homebrew-ok') ||
          prevLineText.includes('// homebrew-ok:') ||
          prevLineText.includes('// homebrew-ok') ||
          (finding.ruleId === 'auditor-raw-console' &&
            (lineText.includes('// console-ok:') || prevLineText.includes('// console-ok:')))
        ) {
          continue;
        }

        findings.push(finding);
      }
    }

    return findings;
  }
}
