//#region src/analyzers/homebrew/homebrewRegistry.ts
var HomebrewDetectorRegistry = class {
	static detectors = /* @__PURE__ */ new Map();
	static register(detector) {
		this.detectors.set(detector.id, detector);
	}
	static unregister(id) {
		return this.detectors.delete(id);
	}
	static get(id) {
		return this.detectors.get(id);
	}
	static getAll() {
		return Array.from(this.detectors.values());
	}
	static clear() {
		this.detectors.clear();
	}
	static getRuleIds() {
		const ids = /* @__PURE__ */ new Set();
		for (const d of this.detectors.values()) ids.add(d.ruleId);
		return Array.from(ids);
	}
	static getRuleDescriptions() {
		const descriptions = {};
		for (const d of this.detectors.values()) descriptions[d.ruleId] = d.ruleDescription;
		return descriptions;
	}
	static getRuleRemediations() {
		return {
			"auditor-manual-package-json": "Usa la utilidad canónica getPackageJson(projectRoot) de src/core/packageJson.ts en lugar de leer o parsear package.json manualmente.",
			"auditor-manual-vue-sfc-regex": "Usa AuditedDocument o parseVueSfc() de core para analizar bloques SFC de Vue en lugar de expresiones regulares manuales frágiles.",
			"auditor-manual-ts-ast": "Usa SharedAstContext o getAstContext(projectRoot) para reutilizar el AST de TypeScript en lugar de compilar o parsear archivos manualmente.",
			"auditor-raw-console": "Reemplaza llamadas directas a console.log/error/warn con this.addViolation(), this.renderTable() o printTerminal() autorizado.",
			"auditor-manual-comment-stripping": "Usa las utilidades canónicas stripComments() de src/core/ o el AST de TypeScript en vez de regexes manuales para eliminar comentarios.",
			"auditor-manual-brace-counting": "Usa el parser canónico de AST o extractBlocks() para balancear llaves en lugar de contadores manuales propensos a errores.",
			"auditor-manual-file-walker": "Hereda de FileScanAuditor o usa this.context.collectFiles() en lugar de recorrer el sistema de archivos con walkers manuales.",
			"auditor-homebrew-predicates": "Importa predicados canónicos desde src/core/auditTestPredicates.ts o src/core/auditConfig.ts en vez de reimplementar chequeos de tests.",
			"auditor-manual-rule-timing": "Envuelve la ejecución de reglas en this.runRuleMeasured(ruleId, () => ...) para registrar tiempos en lugar de timers manuales.",
			"auditor-hardcoded-config": "Resuelve rutas, directorios y configuraciones dinámicamente desde audit.config.ts sin nombres de archivo ni constantes hardcodeadas.",
			"auditor-manual-step-logging": "Elimina logs de pasos secuenciales ([1/6], [2/6]) dentro de subauditores; el streaming runner gestiona el ciclo de vida y estado visual.",
			"auditor-unmeasured-rule": "Envuelve la evaluación de la regla con this.runRuleMeasured() o reportRuleDuration() para garantizar medición y telemetría de rendimiento.",
			"auditor-redundant-rule-evaluated": "Elimina llamadas redundantes a markRuleEvaluated() cuando la regla ya se mide automáticamente con runRuleMeasured().",
			"auditor-third-party-tool-contract": "Declara usesThirdPartyTool: true con thirdPartyToolPolicy ({ toolName, fallbackBehavior, fallbackRuleId }) en el constructor si ejecutas herramientas externas, o usesThirdPartyTool: false si es un analizador nativo.",
			"auditor-inefficient-file-scan": "Evita iterar reglas antes de archivos o pasar comodines ciegos (**/*.ext) a CLIs externas; usa this.scanFilesSinglePass(), FileScanAuditor o pasa la lista de archivos descubiertos por el auditor."
		};
	}
	static run(context, disabledDetectors = [], onDetectorDuration) {
		if (context.content.includes("// homebrew-ok: all") || context.content.includes("// homebrew-exempt")) return [];
		const disabledSet = new Set(disabledDetectors);
		const findings = [];
		for (const detector of this.detectors.values()) {
			if (disabledSet.has(detector.id)) continue;
			const t0 = performance.now();
			const detectorFindings = detector.detect(context);
			if (onDetectorDuration) onDetectorDuration(detector.ruleId, performance.now() - t0);
			for (const finding of detectorFindings) {
				const lineIdx = finding.line - 1;
				const lineText = context.lines[lineIdx] ?? "";
				const prevLineText = lineIdx > 0 ? context.lines[lineIdx - 1] ?? "" : "";
				if (lineText.includes("// homebrew-ok:") || lineText.includes("// homebrew-ok") || prevLineText.includes("// homebrew-ok:") || prevLineText.includes("// homebrew-ok") || finding.ruleId === "auditor-raw-console" && (lineText.includes("// console-ok:") || prevLineText.includes("// console-ok:"))) continue;
				findings.push(finding);
			}
		}
		return findings;
	}
};
//#endregion
export { HomebrewDetectorRegistry };
