import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { extractContractSections, findLocalContractsHeaderLine, injectOrUpdateMandateInAgentsMd, matchesMandateLanguage } from "../../analyzers/agentsMandateAnalyzer.js";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_agents_config_mandate.ts
/**
* src/suites/documentation/validate_agents_config_mandate.ts
*
* ROOT AGENTS.MD CONFIGURATION & ARCHITECTURE GOVERNANCE AUDITOR (Node.js 26+ Native)
* Verifies that the root AGENTS.md strictly contains mandatory architectural clauses:
* 1. Prohibition on modifying or disabling configurations without prior programmer consultation.
* 2. Absolute prohibition on backward-compatible code & loud failure mandate.
* 3. Absolute prohibition on suppressing or silencing rules for fake passes.
* Supports automated injection and in-place modernization in fix mode.
*/
const AGENTS_CONFIG_MANDATE_RULES = [
	"agents-missing-config-mandate",
	"agents-missing-backward-compat-mandate",
	"agents-missing-fake-pass-mandate",
	"agents-missing-chat-language-mandate",
	"agents-missing-destructive-git-mandate",
	"agents-missing-official-tools-mandate"
];
const CANONICAL_MANDATE_SNIPPET_EN = "- **Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation**: Developers and AI agents are strictly prohibited from disabling, turning off, altering, or modifying auditor configurations (`.auditor/audit.config.ts`, `vite.config.ts`, `.stylelintrc.json`, `.fallowrc.json`) when encountering errors or warnings without consulting and obtaining explicit prior authorization from the human programmer. When requesting authorization, the agent must provide a comprehensive technical explanation detailing why the modification is necessary, explicitly justifying the trade-offs, pros, and cons.";
const CANONICAL_MANDATE_SNIPPET_ES = "- **Prohibición de Modificar o Desactivar Configuraciones Sin Consulta Previa al Programador**: Los desarrolladores y agentes de IA tienen estrictamente prohibido deshabilitar, apagar, alterar o modificar las configuraciones del auditor (`.auditor/audit.config.ts`, `vite.config.ts`, `.stylelintrc.json`, `.fallowrc.json`) ante errores o advertencias sin consultar y obtener autorización previa explícita del programador humano. Al solicitar autorización, el agente debe proporcionar una explicación técnica exhaustiva detallando por qué la modificación es necesaria, justificando explícitamente los pros, los contras y el balance de compensaciones.";
const CANONICAL_OFFICIAL_TOOLS_SNIPPET_EN = "- **Mandatory Official Tools Priority & Prohibition on Premature Ad-Hoc Scripts**: Developers and AI agents MUST ALWAYS prioritize and use the official CLI tools provided by the framework and package scripts (`npm run auditor:findings`, `npm run auditor:rules`, `npm run auditor:by-rule`, `npm run auditor:by-file`, `npm run auditor:dupes`, `npm run auditor:magic`, `npm run auditor:motion`, `npm run auditor:o1`, `npm run auditor:dependencies`, `npm run auditor:version`, `auditor guide <ruleId>`, `vp check`) before attempting manual inspection or writing code. Reinventing the wheel by creating scratch scripts or ad-hoc `node -e` one-liners for tasks already covered by official tools is STRICTLY PROHIBITED. Creating temporary scripts in `scratch/` is permitted ONLY as an exceptional last resort when no official tool exists for the specific diagnostic or verification task. When invoking npm scripts with flags or subcommands, always use `--` (e.g. `npm run auditor:motion -- --help`, `npm run auditor -- guide <ruleId>`) or invoke the installed binary directly, NEVER invoke `npx`.";
const CANONICAL_OFFICIAL_TOOLS_SNIPPET_ES = "- **Prioridad Obligatoria de Herramientas Oficiales y Prohibición de Scripts Ad-Hoc Prematuros**: Los desarrolladores y agentes de IA DEBEN priorizar y utilizar SIEMPRE las herramientas CLI oficiales provistas por el framework y los scripts de paquete (`npm run auditor:findings`, `npm run auditor:rules`, `npm run auditor:by-rule`, `npm run auditor:by-file`, `npm run auditor:dupes`, `npm run auditor:magic`, `npm run auditor:motion`, `npm run auditor:o1`, `npm run auditor:dependencies`, `npm run auditor:version`, `auditor guide <ruleId>`, `vp check`) antes de intentar inspecciones manuales o escribir código. Reinventar la rueda creando scripts en `scratch/` o comandos inline `node -e` para tareas ya cubiertas por herramientas oficiales está ESTRICTAMENTE PROHIBIDO. Crear scripts temporales en `scratch/` se permite ÚNICAMENTE como último recurso excepcional cuando no exista ninguna herramienta oficial para la tarea específica de diagnóstico o verificación. Al invocar scripts de npm con flags o subcomandos, usa siempre `--` (ej. `npm run auditor:motion -- --help`, `npm run auditor -- guide <ruleId>`) o invoca directamente el binario instalado, JAMÁS invoques `npx`.";
const CANONICAL_BACKWARD_COMPAT_SNIPPET_EN = "- **Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate**: Writing backward-compatible shims, deprecated alias suites, legacy fallback wrappers, or dual-execution adapter code across this repository is STRICTLY PROHIBITED. The architecture prioritizes clean, uncompromised modern standards over legacy tolerance. Outdated consumers, legacy configurations, and unmigrated calls MUST fail loudly with immediate, explicit, and blocking errors (`throw new Error(...)` or exit code 1) forcing immediate upgrades to canonical standards. Maintaining duplicate suites or runtime compatibility bridges that introduce bloat, duplicate findings, or maintenance hazards is completely eradicated.";
const CANONICAL_BACKWARD_COMPAT_SNIPPET_ES = "- **Prohibición Absoluta de Código Retrocompatible y Mandato de Fallo Ruidoso**: Escribir shims retrocompatibles, suites de alias obsoletos, wrappers de fallback legacy o código de adaptador de doble ejecución en este repositorio está ESTRICTAMENTE PROHIBIDO. La arquitectura prioriza estándares modernos limpios y sin concesiones por sobre la tolerancia al código legado. Los consumidores obsoletos, configuraciones antiguas y llamadas no migradas DEBEN fallar ruidosamente con errores inmediatos, explícitos y bloqueantes (`throw new Error(...)` o código de salida 1) forzando la actualización a los estándares canónicos. Mantener suites duplicadas o puentes de compatibilidad en tiempo de ejecución que introducen sobrecarga, hallazgos duplicados o riesgos de mantenimiento queda completamente erradicado.";
const CANONICAL_FAKE_PASS_SNIPPET_EN = "- **Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate**: When auditing a repository or running linters/auditors, AI agents and developers are STRICTLY AND CATEGORICALLY PROHIBITED from suppressing, silencing, disabling, or nullifying auditor rules, stylelint rules, ESLint rules, or any static analysis checks (e.g., setting `\"rule\": null`, `\"rule\": \"off\"`, `\"rule\": 0`, creating dummy override configs that neuter checks, or passing arbitrary skip flags) to make an audit pass or hide findings. If the number of errors or warnings is massive (even thousands of errors), THEY ARE REAL ARCHITECTURAL OR HYGIENE DEFECTS THAT MUST BE LEGITIMATELY RESOLVED IN THE SOURCE CODE OR FIXED WITH CANONICAL TOOLS (`auditor fix`). Modernizing host configurations means elevating the codebase to meet strict modern standards and exposing defects that were previously hidden, NEVER degrading, diluting, or castrating the auditor's rules to fit legacy code. Silencing rules to achieve a fake clean pass is considered a critical architectural violation and gross misconduct.";
const CANONICAL_FAKE_PASS_SNIPPET_ES = "- **Prohibición Absoluta de Suprimir, Silenciar, Anular o Eludir Reglas de Auditoría y Mandato de Cero Tolerancia a Pases Falsos**: Al auditar un repositorio o ejecutar linters/auditores, los agentes de IA y desarrolladores tienen ESTRICTA Y CATEGÓRICAMENTE PROHIBIDO suprimir, silenciar, desactivar o anular reglas del auditor, de stylelint, de ESLint o cualquier verificación estática (ej. configurando `\"rule\": null`, `\"rule\": \"off\"`, `\"rule\": 0`, creando configuraciones de anulación ficticias que neutralicen chequeos, o pasando flags arbitrarios de omisión) para que una auditoría pase u ocultar hallazgos. Si la cantidad de errores o advertencias es masiva (incluso miles de errores), SON DEFECTOS REALES DE ARQUITECTURA O HIGIENE QUE DEBEN RESOLVERSE LEGÍTIMAMENTE EN EL CÓDIGO FUENTE O REPARARSE CON HERRAMIENTAS CANÓNICAS (`auditor fix`). Modernizar configuraciones significa elevar el código para cumplir con estándares modernos estrictos y exponer defectos previamente ocultos, NUNCA degradar, diluir o castrar las reglas del auditor para adaptarlas a código legado. Silenciar reglas para lograr un pase limpio falso se considera una violación arquitectónica crítica y una falta grave.";
const CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_ES = "- **AI Agent Chat Communication & Interactive Language Mandate**: The AI assistant / agent MUST strictly consult `.auditor/audit.config.ts` and communicate, converse, respond, and chat with the user in Spanish (`'es'`). This conversational chat language is explicitly separate and distinct from the repository file writing and documentation language (`config.documentation.language`), which strictly governs code comments, commit messages, documentation, markdown files, and codebase artifacts. The AI agent must dynamically consult these configurations and never confuse or conflate the chat language with the file writing language.";
const CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_EN = "- **AI Agent Chat Communication & Interactive Language Mandate**: The AI assistant / agent MUST strictly consult `.auditor/audit.config.ts` and communicate, converse, respond, and chat with the user in English (`'en'`). This conversational chat language is explicitly aligned with the repository file writing and documentation language (`config.documentation.language`), which strictly governs code comments, commit messages, documentation, markdown files, and codebase artifacts. The AI agent must dynamically consult these configurations and never confuse conversational chat directives with file writing rules.";
const CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_ES = "- **Mandato de Idioma de Comunicación en el Chat con el Usuario e Interacción con IA**: El asistente / agente de IA DEBE consultar `.auditor/audit.config.ts` y comunicarse, conversar, responder e interactuar en el chat con el usuario estricta y exclusivamente en español (`'es'`). Este idioma conversacional del chat está explícitamente diferenciado y separado del idioma de escritura de archivos y documentación del repositorio (`config.documentation.language`), el cual rige estrictamente el código, comentarios, mensajes de commit, documentación y archivos markdown. El agente de IA debe consultar dinámicamente estas configuraciones y jamás confundir el idioma del chat con el idioma de escritura en archivos.";
const CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_EN = "- **Mandato de Idioma de Comunicación en el Chat con el Usuario e Interacción con IA**: El asistente / agente de IA DEBE consultar `.auditor/audit.config.ts` y comunicarse, conversar, responder e interactuar en el chat con el usuario estricta y exclusivamente en inglés (`'en'`). Este idioma conversacional del chat está explícitamente diferenciado del idioma de escritura de archivos y documentación del repositorio (`config.documentation.language`), el cual rige estrictamente el código, comentarios, mensajes de commit, documentación y archivos markdown. El agente de IA debe consultar dinámicamente estas configuraciones y jamás confundir el idioma del chat con el idioma de escritura en archivos.";
const CANONICAL_DESTRUCTIVE_GIT_SNIPPET_EN = "- **Absolute Prohibition on Unrequested Destructive Git Commands**: AI agents are STRICTLY AND CATEGORICALLY PROHIBITED from executing destructive Git commands (`git reset --hard`, `git checkout --`, `git clean`, `git restore`, `git push --force`) that discard or overwrite working tree changes or commit history without explicit prior authorization from the human programmer.";
const CANONICAL_DESTRUCTIVE_GIT_SNIPPET_ES = "- **Prohibición Absoluta de Comandos Git Destructivos No Solicitados**: Los agentes de IA tienen ESTRICTA Y CATEGÓRICAMENTE PROHIBIDO ejecutar comandos Git destructivos (`git reset --hard`, `git checkout --`, `git clean`, `git restore`, `git push --force`) que descarten o sobrescriban cambios del árbol de trabajo o del historial de commits sin autorización previa explícita del programador humano.";
const CANONICAL_SNIPPET_REGISTRY = {
	config: {
		en: CANONICAL_MANDATE_SNIPPET_EN,
		es: CANONICAL_MANDATE_SNIPPET_ES
	},
	backwardCompat: {
		en: CANONICAL_BACKWARD_COMPAT_SNIPPET_EN,
		es: CANONICAL_BACKWARD_COMPAT_SNIPPET_ES
	},
	fakePass: {
		en: CANONICAL_FAKE_PASS_SNIPPET_EN,
		es: CANONICAL_FAKE_PASS_SNIPPET_ES
	},
	destructiveGit: {
		en: CANONICAL_DESTRUCTIVE_GIT_SNIPPET_EN,
		es: CANONICAL_DESTRUCTIVE_GIT_SNIPPET_ES
	},
	officialTools: {
		en: CANONICAL_OFFICIAL_TOOLS_SNIPPET_EN,
		es: CANONICAL_OFFICIAL_TOOLS_SNIPPET_ES
	}
};
function getCanonicalMandateSnippet(language = "en") {
	return CANONICAL_SNIPPET_REGISTRY.config[language] ?? CANONICAL_SNIPPET_REGISTRY.config.en;
}
function getCanonicalBackwardCompatSnippet(language = "en") {
	return CANONICAL_SNIPPET_REGISTRY.backwardCompat[language] ?? CANONICAL_SNIPPET_REGISTRY.backwardCompat.en;
}
function getCanonicalFakePassSnippet(language = "en") {
	return CANONICAL_SNIPPET_REGISTRY.fakePass[language] ?? CANONICAL_SNIPPET_REGISTRY.fakePass.en;
}
function getCanonicalDestructiveGitSnippet(language = "en") {
	return CANONICAL_SNIPPET_REGISTRY.destructiveGit[language] ?? CANONICAL_SNIPPET_REGISTRY.destructiveGit.en;
}
function getCanonicalOfficialToolsSnippet(language = "en") {
	return CANONICAL_SNIPPET_REGISTRY.officialTools[language] ?? CANONICAL_SNIPPET_REGISTRY.officialTools.en;
}
function getCanonicalChatLanguageSnippet(docLanguage = "en", chatLanguage = "es") {
	if (docLanguage === "es") return chatLanguage === "en" ? CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_EN : CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_ES;
	return chatLanguage === "en" ? CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_EN : CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_ES;
}
/**
* Checks if a block of markdown text contains the anti-tampering mandate.
*/
function containsConfigAntiTamperingMandate(text, expectedLanguage) {
	if (!/config|auditor|linter/i.test(text)) return false;
	const prohibitionTerms = "(?:apagar|apagando|prender|prendiendo|desactivar|desactivando|activar|activando|modificar|modificando|alterar|alterando|silenciar|silenciando|manipular|manipulando|disabl[a-z]*|turn(?:ing)?\\s+(?:off|on)|modif[a-z]*|alter[a-z]*|silenc[a-z]*|tamper[a-z]*)";
	const denialTerms = "(?:prohibi[a-z]*|jam[aá]s|nunca|no se deben?|never|forbidden|shall not|must not)";
	if (!(new RegExp(`${denialTerms}[\\s\\S]{0,250}${prohibitionTerms}`, "i").test(text) || new RegExp(`${prohibitionTerms}[\\s\\S]{0,250}${denialTerms}`, "i").test(text))) return false;
	const consultationTerms = "(?:consult[a-z]*|preguntar|autorizaci[oó]n|consentimiento|permiso|ask[a-z]*|authoriz[a-z]*|consent|permission)";
	const actorTerms = "(?:programador[a-z]*|desarrollador[a-z]*|humano[a-z]*|programmer[a-z]*|developer[a-z]*|human[a-z]*)";
	if (!(new RegExp(`${consultationTerms}[\\s\\S]{0,200}${actorTerms}`, "i").test(text) || new RegExp(`${actorTerms}[\\s\\S]{0,200}${consultationTerms}`, "i").test(text))) return false;
	if (!(/* @__PURE__ */ new RegExp("justific[a-z]*|explicaci(?:ó|o)n|explicar|motivo[a-z]*|por qu(?:é|e)|\\bpros?\\b|\\bcontras?\\b|\\bcons?\\b|trade-offs?|reason[a-z]*|why|explain[a-z]*", "i")).test(text)) return false;
	return matchesMandateLanguage(text, expectedLanguage, /(?:prohibit|disabl|consult|programmer|developer|trade-offs|pros|cons)/i, /(?:prohibici(?:ó|o)n|desactivar|previa|desarrolladores|programador)/i);
}
/**
* Checks if a block of markdown text contains the backward-compatible prohibition mandate.
*/
function containsBackwardCompatMandate(text, expectedLanguage) {
	if (!/backward-compatible|retrocompatib|loud failure|fallo ruidoso|legacy fallback|shims?/i.test(text)) return false;
	if (!/prohibit|prohibid|strictly|estrictamente|eradicated|erradicado/i.test(text)) return false;
	if (!/fail loudly|fallar ruidosamente|throw new error|exit code 1|código de salida 1/i.test(text)) return false;
	return matchesMandateLanguage(text, expectedLanguage, /(?:backward-compatible|loud failure|prohibit|deprecated alias|legacy fallback)/i, /(?:retrocompatib|fallo ruidoso|prohibid|estrictamente prohibido|código legado)/i);
}
/**
* Checks if a block of markdown text contains the fake pass prohibition mandate.
*/
function containsFakePassMandate(text, expectedLanguage) {
	if (!/suppress|silenc|nullify|suprimir|anular|eludir|fake pass|pases?\s+falsos?/i.test(text)) return false;
	if (!/prohibit|prohibid|categorically|categóricamente|strictly|estrictamente/i.test(text)) return false;
	if (!/zero-tolerance|cero tolerancia|gross misconduct|falta grave|auditor fix/i.test(text)) return false;
	return matchesMandateLanguage(text, expectedLanguage, /(?:suppressing|silencing|nullifying|fake pass|zero-tolerance|gross misconduct)/i, /(?:suprimir|silenciar|anular|pase falso|cero tolerancia|falta grave)/i);
}
/**
* Checks if a block of markdown text contains the AI agent chat communication language mandate.
*/
function containsChatLanguageMandate(text, docLanguage, chatLanguage = "es") {
	if (!/chat|convers|comunic|interact|hablar|responder/i.test(text)) return false;
	if (!/must|shall|debe|mandate|mandato|obligatori/i.test(text)) return false;
	if (!(chatLanguage === "es" ? /spanish|español|'es'|"es"/i.test(text) : /english|inglés|ingles|'en'|"en"/i.test(text))) return false;
	if (!/file|writing|code|documentation|documentación|escritura|archivo|separate|distinto|diferenciad/i.test(text)) return false;
	return matchesMandateLanguage(text, docLanguage, /(?:AI Agent Chat Communication|communicate|converse|chat language|file writing language)/i, /(?:Mandato de Idioma de Comunicación en el Chat|comunicarse|conversar|idioma del chat|idioma de escritura)/i);
}
/**
* Checks if a block of markdown text contains the destructive Git commands prohibition mandate.
*/
function containsDestructiveGitMandate(text, expectedLanguage) {
	if (!/git\s+reset\s+--hard|git\s+checkout\s+--|git\s+clean|git\s+restore|destructive\s+git|git\s+destructiv/i.test(text)) return false;
	if (!/prohibit|prohibid|categorically|categóricamente|strictly|estrictamente|forbidden/i.test(text)) return false;
	if (!/authoriz|autorizaci[oó]n|consult|permiso|permission|programmer|programador|human/i.test(text)) return false;
	return matchesMandateLanguage(text, expectedLanguage, /(?:Destructive Git Commands|prohibited from executing|working tree changes)/i, /(?:Comandos Git Destructivos|prohibido ejecutar|árbol de trabajo|historial de commits)/i);
}
/**
* Checks if a block of markdown text contains the official tools priority mandate.
*/
function containsOfficialToolsMandate(text, expectedLanguage) {
	if (!/official\s+tools|herramientas\s+oficiales|scratch\s+scripts|ad-hoc\s+scripts|scripts\s+en\s+scratch/i.test(text)) return false;
	if (!/priorit|priorizar|prohibit|prohibid|strictly|estrictamente|last resort|último recurso/i.test(text)) return false;
	return matchesMandateLanguage(text, expectedLanguage, /(?:Mandatory Official Tools Priority|official CLI tools|Reinventing the wheel|Creating temporary scripts in `scratch\/`)/i, /(?:Prioridad Obligatoria de Herramientas Oficiales|herramientas CLI oficiales|Reinventar la rueda|scripts temporales en `scratch\/`)/i);
}
const MANDATE_DEFINITIONS = [
	{
		ruleId: "agents-missing-config-mandate",
		check: (text, docLang) => containsConfigAntiTamperingMandate(text, docLang),
		getSnippet: (docLang) => getCanonicalMandateSnippet(docLang),
		isExistingLine: (l) => l.includes("Modifying or Disabling Configurations") || l.includes("Modificar o Desactivar Configuraciones") || /(?:modifying|disabling|altering|turning off|modificar|desactivar|alterar|apagar)\s+(?:auditor\s+)?config/i.test(l),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause prohibiting modifying or disabling configurations without prior programmer consultation.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente una cláusula en español que prohíba alterar o desactivar configuraciones sin consultar al programador, justificando técnicamente el motivo, pros y contras."
	},
	{
		ruleId: "agents-missing-backward-compat-mandate",
		check: (text, docLang) => containsBackwardCompatMandate(text, docLang),
		getSnippet: (docLang) => getCanonicalBackwardCompatSnippet(docLang),
		isExistingLine: (l) => l.includes("Backward-Compatible") || l.includes("Retrocompatible") || l.includes("Loud Failure") || l.includes("Fallo Ruidoso"),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause with absolute prohibition on backward-compatible code and loud failure.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente el mandato de prohibición absoluta de código retrocompatible y fallo ruidoso."
	},
	{
		ruleId: "agents-missing-fake-pass-mandate",
		check: (text, docLang) => containsFakePassMandate(text, docLang),
		getSnippet: (docLang) => getCanonicalFakePassSnippet(docLang),
		isExistingLine: (l) => l.includes("Zero-Tolerance Fake Pass") || l.includes("Cero Tolerancia a Pases Falsos") || l.includes("Suppressing, Silencing, Nullifying") || l.includes("Suprimir, Silenciar, Anular") || l.includes("Fake Pass") || l.includes("Pases Falsos") || l.includes("Suppressing Rules") || l.includes("Silencing Rules") || l.includes("Suprimir Reglas") || l.includes("Silenciar Reglas"),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause prohibiting suppressing or silencing rules for fake clean passes.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente el mandato de prohibición de suprimir reglas para lograr pases limpios falsos."
	},
	{
		ruleId: "agents-missing-chat-language-mandate",
		check: (text, docLang, chatLang) => containsChatLanguageMandate(text, docLang, chatLang),
		getSnippet: (docLang, chatLang) => getCanonicalChatLanguageSnippet(docLang, chatLang),
		isExistingLine: (l) => l.includes("AI Agent Chat Communication") || l.includes("Mandato de Idioma de Comunicación en el Chat") || l.includes("Chat Communication Language Mandate") || /(?:chat|conversational)\s+language\s+mandate/i.test(l) || /mandato\s+de\s+idioma\s+de(?:l|\s+la)?\s+chat/i.test(l),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause defining the AI agent chat communication language distinct from file writing language.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente el mandato de idioma de comunicación en el chat de la IA diferenciado de la escritura de archivos."
	},
	{
		ruleId: "agents-missing-destructive-git-mandate",
		check: (text, docLang) => containsDestructiveGitMandate(text, docLang),
		getSnippet: (docLang) => getCanonicalDestructiveGitSnippet(docLang),
		isExistingLine: (l) => l.includes("Unrequested Destructive Git Commands") || l.includes("Comandos Git Destructivos No Solicitados") || l.includes("Destructive Git Commands") || l.includes("Comandos Git Destructivos"),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause prohibiting AI agents from executing destructive Git commands without prior programmer authorization.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente la prohibición absoluta de ejecutar comandos Git destructivos sin autorización previa del programador."
	},
	{
		ruleId: "agents-missing-official-tools-mandate",
		check: (text, docLang) => containsOfficialToolsMandate(text, docLang),
		getSnippet: (docLang) => getCanonicalOfficialToolsSnippet(docLang),
		isExistingLine: (l) => l.includes("Official Tools Priority") || l.includes("Herramientas Oficiales") || l.includes("Premature Ad-Hoc Scripts") || l.includes("Scripts Ad-Hoc Prematuros") || /(?:official\s+tools|herramientas\s+oficiales)\s+priority/i.test(l),
		errorMessageEn: "Root AGENTS.md must include the mandatory clause prioritizing official framework CLI tools and prohibiting premature ad-hoc scripts.",
		errorMessageEs: "AGENTS.md raíz debe incluir obligatoriamente el mandato de prioridad de herramientas oficiales del framework y prohibición de scripts ad-hoc prematuros."
	}
];
var AgentsConfigMandateAuditor = class extends BaseAuditor {
	rootDir;
	languageOption;
	chatLanguageOption;
	constructor(rootDir, options) {
		const projectRoot = rootDir || process.cwd();
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(AGENTS_CONFIG_MANDATE_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...AGENTS_CONFIG_MANDATE_RULES]),
			fixableRuleIds: [...AGENTS_CONFIG_MANDATE_RULES],
			fix: options?.fix,
			id: "validate_agents_config_mandate",
			name: "Root AGENTS.md Config Mandate Validator",
			description: "Valida mandatos de config y arquitectura en AGENTS.md",
			family: "documentation",
			packageName: "AGENTS",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🛡️",
			ruleIds: AGENTS_CONFIG_MANDATE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(AGENTS_CONFIG_MANDATE_RULES, "setup"),
			ruleDescriptions: {
				"agents-missing-config-mandate": "Falta mandato de no alterar config",
				"agents-missing-backward-compat-mandate": "Falta mandato no retrocompatible",
				"agents-missing-fake-pass-mandate": "Falta mandato de cero pase falso",
				"agents-missing-chat-language-mandate": "Falta mandato de idioma del chat",
				"agents-missing-destructive-git-mandate": "Falta mandato anti-git destructivo",
				"agents-missing-official-tools-mandate": "Falta mandato de herramientas oficiales"
			},
			ruleRemediations: {
				"agents-missing-config-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-config-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz carece de la cláusula obligatoria que prohíbe terminantemente a los agentes de IA modificar, relajar o desactivar configuraciones del proyecto sin autorización previa y explícita del programador humano.\n2. Diagnóstico: Inspecciona AGENTS.md en la sección \"Local Contracts\". Falta la directiva de inmutabilidad de configuración.\n3. Solución Canónica:\n   a) Ejecuta el comando de auto-fix canónico: `npm run auditor:fix` o `auditor fix` para inyectar automáticamente la cláusula oficial.\n   b) O inserta manualmente en AGENTS.md bajo Local Contracts la cláusula canónica (CANONICAL_MANDATE_SNIPPET).\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation**: Developers and AI agents are strictly prohibited from disabling, turning off, altering, or modifying auditor configurations...\"",
				"agents-missing-backward-compat-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-backward-compat-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz no incluye la cláusula obligatoria de prohibición de código retrocompatible (\"Loud Failure Mandate\"). El sistema exige que el software falle ruidosamente ante interfaces obsoletas en lugar de acumular shims y adaptadores legacy.\n2. Diagnóstico: Inspecciona AGENTS.md bajo \"Local Contracts\". Falta el mandato de fallo ruidoso.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix: `npm run auditor:fix` o `auditor fix` para inyectar el mandato canónico.\n   b) O agrégalo manualmente bajo \"Local Contracts\".\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate**: Writing backward-compatible shims, deprecated alias suites, legacy fallback wrappers, or dual-execution adapter code across this repository is STRICTLY PROHIBITED...\"",
				"agents-missing-fake-pass-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-fake-pass-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz no contiene la cláusula obligatoria de tolerancia cero a pases falsos (\"Zero-Tolerance Fake Pass Mandate\"), que prohíbe silenciar reglas de linter/auditor o crear configuraciones dummy para ocultar defectos.\n2. Diagnóstico: Inspecciona AGENTS.md bajo \"Local Contracts\". Falta la directiva anti-silenciamiento.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix: `npm run auditor:fix` o `auditor fix` para inyectar automáticamente la cláusula.\n   b) O agrégala manualmente bajo \"Local Contracts\".\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate**: When auditing a repository or running linters/auditors, AI agents and developers are STRICTLY AND CATEGORICALLY PROHIBITED from suppressing, silencing, disabling, or nullifying auditor rules...\"",
				"agents-missing-chat-language-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-chat-language-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz no define la directiva que separa explícitamente el idioma de chat/conversación de la IA (configurado en .auditor/audit.config.ts) del idioma de documentación y código fuente.\n2. Diagnóstico: Revisa AGENTS.md bajo \"Local Contracts\". Falta la cláusula de idioma de interacción conversacional.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix: `npm run auditor:fix` o `auditor fix` para sincronizar automáticamente el mandato con las opciones de configuración.\n   b) O declara manualmente la cláusula canónica alineada con tu configuración (.auditor/audit.config.ts).\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **AI Agent Chat Communication & Interactive Language Mandate**: The AI assistant / agent MUST strictly consult `.auditor/audit.config.ts` and communicate, converse, respond, and chat with the user in Spanish (`'es'`)...\"",
				"agents-missing-destructive-git-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-destructive-git-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz carece de la prohibición absoluta de comandos Git destructivos (como git reset --hard, git checkout --, git clean, git restore, git push --force) sin consentimiento explícito del programador humano.\n2. Diagnóstico: Revisa AGENTS.md bajo \"Local Contracts\". Falta la cláusula de seguridad de control de versiones.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix: `npm run auditor:fix` o `auditor fix` para inyectar automáticamente el texto oficial.\n   b) O añade manualmente el snippet canónico bajo \"Local Contracts\".\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **Absolute Prohibition on Unrequested Destructive Git Commands**: AI agents are STRICTLY AND CATEGORICALLY PROHIBITED from executing destructive Git commands (`git reset --hard`, `git checkout --`, `git clean`, `git restore`, `git push --force`) that discard or overwrite working tree changes or commit history without explicit prior authorization...\"",
				"agents-missing-official-tools-mandate": "📖 GUÍA DE REMEDIACIÓN: agents-missing-official-tools-mandate\n1. Causa Raíz: El archivo AGENTS.md raíz carece de la cláusula obligatoria que exige a desarrolladores y agentes de IA priorizar las herramientas CLI oficiales provistas por el framework (`auditor:findings`, `auditor:rules`, `auditor:dupes`, `auditor:magic`, `auditor:motion`, `auditor:o1`, `auditor:dependencies`, etc.) y prohíbe crear scripts ad-hoc prematuros en `scratch/` o con `node -e`.\n2. Diagnóstico: Revisa AGENTS.md bajo \"Local Contracts\". Falta el mandato de prioridad de herramientas oficiales.\n3. Solución Canónica:\n   a) Ejecuta el auto-fix: `npm run auditor:fix` o `auditor fix` para inyectar automáticamente la cláusula canónica.\n   b) O añade manualmente el snippet canónico bajo \"Local Contracts\".\n4. Ejemplo:\n   - Cláusula obligatoria: \"- **Mandatory Official Tools Priority & Prohibition on Premature Ad-Hoc Scripts**: Developers and AI agents MUST ALWAYS prioritize and use the official CLI tools provided by the framework and package scripts (`npm run auditor:findings`, `npm run auditor:rules`, `npm run auditor:by-rule`, `npm run auditor:by-file`, `npm run auditor:dupes`, `npm run auditor:magic`, `npm run auditor:motion`, `npm run auditor:o1`, `npm run auditor:dependencies`, `npm run auditor:version`, `auditor guide <ruleId>`, `vp check`) before attempting manual inspection or writing code...\""
			},
			coverage: { include: ["AGENTS.md"] },
			projectRoot
		});
		this.rootDir = projectRoot;
		this.languageOption = options?.language;
		this.chatLanguageOption = options?.chatLanguage;
	}
	async runAudit() {
		const agentsMdPath = path.resolve(this.rootDir, "AGENTS.md");
		this.recordScanned("AGENTS.md");
		if (!fs.existsSync(agentsMdPath)) {
			for (const rule of AGENTS_CONFIG_MANDATE_RULES) this.runSubAuditorSync(rule, () => {
				this.addViolation({
					ruleId: rule,
					severity: "error",
					file: "AGENTS.md",
					line: 1,
					message: "No se encontró el archivo AGENTS.md en la raíz del proyecto para validar los mandatos de arquitectura."
				});
			});
			return;
		}
		let content;
		try {
			content = fs.readFileSync(agentsMdPath, "utf8");
		} catch {
			return;
		}
		const config = getAuditConfig(this.rootDir);
		const targetLanguage = this.languageOption ?? config.documentation?.language ?? "en";
		const chatLanguage = this.chatLanguageOption ?? config.documentation?.chatLanguage ?? "es";
		for (const mandate of MANDATE_DEFINITIONS) this.runSubAuditorSync(mandate.ruleId, () => {
			content = this.auditSingleMandate(mandate, content, targetLanguage, chatLanguage, agentsMdPath);
		});
	}
	auditSingleMandate(mandate, currentContent, targetLanguage, chatLanguage, agentsMdPath) {
		const matchingSections = extractContractSections(currentContent).filter((section) => mandate.check(section, targetLanguage, chatLanguage));
		const existingMatches = currentContent.split("\n").filter((l) => mandate.isExistingLine(l));
		if (matchingSections.length === 1 && existingMatches.length <= 1) return currentContent;
		if (this.isFixActive()) {
			injectOrUpdateMandateInAgentsMd({
				agentsMdPath,
				content: currentContent,
				canonicalSnippet: mandate.getSnippet(targetLanguage, chatLanguage),
				isExistingLine: mandate.isExistingLine
			});
			return fs.readFileSync(agentsMdPath, "utf8");
		}
		this.addViolation({
			ruleId: mandate.ruleId,
			severity: "error",
			file: "AGENTS.md",
			line: findLocalContractsHeaderLine(currentContent),
			message: targetLanguage === "es" ? mandate.errorMessageEs : mandate.errorMessageEn,
			fixable: true
		});
		return currentContent;
	}
};
if (process.argv[1] && (process.argv[1].endsWith("validate_agents_config_mandate.ts") || typeof import.meta.filename === "string" && process.argv[1] === import.meta.filename)) await BaseAuditor.runCli(new AgentsConfigMandateAuditor());
//#endregion
export { AGENTS_CONFIG_MANDATE_RULES, AgentsConfigMandateAuditor, CANONICAL_BACKWARD_COMPAT_SNIPPET_EN, CANONICAL_BACKWARD_COMPAT_SNIPPET_ES, CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_EN, CANONICAL_CHAT_LANGUAGE_SNIPPET_EN_CHAT_ES, CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_EN, CANONICAL_CHAT_LANGUAGE_SNIPPET_ES_CHAT_ES, CANONICAL_DESTRUCTIVE_GIT_SNIPPET_EN, CANONICAL_DESTRUCTIVE_GIT_SNIPPET_ES, CANONICAL_FAKE_PASS_SNIPPET_EN, CANONICAL_FAKE_PASS_SNIPPET_ES, CANONICAL_MANDATE_SNIPPET_EN, CANONICAL_MANDATE_SNIPPET_ES, CANONICAL_OFFICIAL_TOOLS_SNIPPET_EN, CANONICAL_OFFICIAL_TOOLS_SNIPPET_ES, containsBackwardCompatMandate, containsChatLanguageMandate, containsConfigAntiTamperingMandate, containsDestructiveGitMandate, containsFakePassMandate, containsOfficialToolsMandate, getCanonicalBackwardCompatSnippet, getCanonicalChatLanguageSnippet, getCanonicalDestructiveGitSnippet, getCanonicalFakePassSnippet, getCanonicalMandateSnippet, getCanonicalOfficialToolsSnippet };
