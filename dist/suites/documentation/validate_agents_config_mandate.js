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
import fsSync from 'node:fs';
import path from 'node:path';
import { extractContractSections, injectOrUpdateMandateInAgentsMd, matchesMandateLanguage, findLocalContractsHeaderLine } from "../../analyzers/agentsMandateAnalyzer.js";
import { BaseAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
export const AGENTS_CONFIG_MANDATE_RULES = [
    'agents-missing-config-mandate',
    'agents-missing-backward-compat-mandate',
    'agents-missing-fake-pass-mandate'
];
export const CANONICAL_MANDATE_SNIPPET_EN = '- **Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation**: Developers and AI agents are strictly prohibited from disabling, turning off, altering, or modifying auditor configurations (`.auditor/audit.config.ts`, `eslint.config.js`, `.stylelintrc.json`, `.fallowrc.json`) when encountering errors or warnings without consulting and obtaining explicit prior authorization from the human programmer. When requesting authorization, the agent must provide a comprehensive technical explanation detailing why the modification is necessary, explicitly justifying the trade-offs, pros, and cons.';
export const CANONICAL_MANDATE_SNIPPET_ES = '- **Prohibición de Modificar o Desactivar Configuraciones Sin Consulta Previa al Programador**: Los desarrolladores y agentes de IA tienen estrictamente prohibido deshabilitar, apagar, alterar o modificar las configuraciones del auditor (`.auditor/audit.config.ts`, `eslint.config.js`, `.stylelintrc.json`, `.fallowrc.json`) ante errores o advertencias sin consultar y obtener autorización previa explícita del programador humano. Al solicitar autorización, el agente debe proporcionar una explicación técnica exhaustiva detallando por qué la modificación es necesaria, justificando explícitamente los pros, los contras y el balance de compensaciones.';
export const CANONICAL_BACKWARD_COMPAT_SNIPPET_EN = '- **Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate**: Writing backward-compatible shims, deprecated alias suites, legacy fallback wrappers, or dual-execution adapter code across this repository is STRICTLY PROHIBITED. The architecture prioritizes clean, uncompromised modern standards over legacy tolerance. Outdated consumers, legacy configurations, and unmigrated calls MUST fail loudly with immediate, explicit, and blocking errors (`throw new Error(...)` or exit code 1) forcing immediate upgrades to canonical standards. Maintaining duplicate suites or runtime compatibility bridges that introduce bloat, duplicate findings, or maintenance hazards is completely eradicated.';
export const CANONICAL_BACKWARD_COMPAT_SNIPPET_ES = '- **Prohibición Absoluta de Código Retrocompatible y Mandato de Fallo Ruidoso**: Escribir shims retrocompatibles, suites de alias obsoletos, wrappers de fallback legacy o código de adaptador de doble ejecución en este repositorio está ESTRICTAMENTE PROHIBIDO. La arquitectura prioriza estándares modernos limpios y sin concesiones por sobre la tolerancia al código legado. Los consumidores obsoletos, configuraciones antiguas y llamadas no migradas DEBEN fallar ruidosamente con errores inmediatos, explícitos y bloqueantes (`throw new Error(...)` o código de salida 1) forzando la actualización a los estándares canónicos. Mantener suites duplicadas o puentes de compatibilidad en tiempo de ejecución que introducen sobrecarga, hallazgos duplicados o riesgos de mantenimiento queda completamente erradicado.';
export const CANONICAL_FAKE_PASS_SNIPPET_EN = '- **Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate**: When auditing a repository or running linters/auditors, AI agents and developers are STRICTLY AND CATEGORICALLY PROHIBITED from suppressing, silencing, disabling, or nullifying auditor rules, stylelint rules, ESLint rules, or any static analysis checks (e.g., setting `"rule": null`, `"rule": "off"`, `"rule": 0`, creating dummy override configs that neuter checks, or passing arbitrary skip flags) to make an audit pass or hide findings. If the number of errors or warnings is massive (even thousands of errors), THEY ARE REAL ARCHITECTURAL OR HYGIENE DEFECTS THAT MUST BE LEGITIMATELY RESOLVED IN THE SOURCE CODE OR FIXED WITH CANONICAL TOOLS (`auditor fix`). Modernizing host configurations means elevating the codebase to meet strict modern standards and exposing defects that were previously hidden, NEVER degrading, diluting, or castrating the auditor\'s rules to fit legacy code. Silencing rules to achieve a fake clean pass is considered a critical architectural violation and gross misconduct.';
export const CANONICAL_FAKE_PASS_SNIPPET_ES = '- **Prohibición Absoluta de Suprimir, Silenciar, Anular o Eludir Reglas de Auditoría y Mandato de Cero Tolerancia a Pases Falsos**: Al auditar un repositorio o ejecutar linters/auditores, los agentes de IA y desarrolladores tienen ESTRICTA Y CATEGÓRICAMENTE PROHIBIDO suprimir, silenciar, desactivar o anular reglas del auditor, de stylelint, de ESLint o cualquier verificación estática (ej. configurando `"rule": null`, `"rule": "off"`, `"rule": 0`, creando configuraciones de anulación ficticias que neutralicen chequeos, o pasando flags arbitrarios de omisión) para que una auditoría pase u ocultar hallazgos. Si la cantidad de errores o advertencias es masiva (incluso miles de errores), SON DEFECTOS REALES DE ARQUITECTURA O HIGIENE QUE DEBEN RESOLVERSE LEGÍTIMAMENTE EN EL CÓDIGO FUENTE O REPARARSE CON HERRAMIENTAS CANÓNICAS (`auditor fix`). Modernizar configuraciones significa elevar el código para cumplir con estándares modernos estrictos y exponer defectos previamente ocultos, NUNCA degradar, diluir o castrar las reglas del auditor para adaptarlas a código legado. Silenciar reglas para lograr un pase limpio falso se considera una violación arquitectónica crítica y una falta grave.';
const CANONICAL_SNIPPET_REGISTRY = {
    config: { en: CANONICAL_MANDATE_SNIPPET_EN, es: CANONICAL_MANDATE_SNIPPET_ES },
    backwardCompat: { en: CANONICAL_BACKWARD_COMPAT_SNIPPET_EN, es: CANONICAL_BACKWARD_COMPAT_SNIPPET_ES },
    fakePass: { en: CANONICAL_FAKE_PASS_SNIPPET_EN, es: CANONICAL_FAKE_PASS_SNIPPET_ES }
};
export function getCanonicalMandateSnippet(language = 'en') {
    return CANONICAL_SNIPPET_REGISTRY.config[language] ?? CANONICAL_SNIPPET_REGISTRY.config.en;
}
export function getCanonicalBackwardCompatSnippet(language = 'en') {
    return CANONICAL_SNIPPET_REGISTRY.backwardCompat[language] ?? CANONICAL_SNIPPET_REGISTRY.backwardCompat.en;
}
export function getCanonicalFakePassSnippet(language = 'en') {
    return CANONICAL_SNIPPET_REGISTRY.fakePass[language] ?? CANONICAL_SNIPPET_REGISTRY.fakePass.en;
}
/**
 * Checks if a block of markdown text contains the anti-tampering mandate.
 */
export function containsConfigAntiTamperingMandate(text, expectedLanguage) {
    const hasConfig = /configuraci(?:ó|o)n|configuraciones|config|auditor|auditor(?:í|i)a|linter/i.test(text);
    if (!hasConfig)
        return false;
    const prohibitionTerms = '(?:apagar|apagando|prender|prendiendo|desactivar|desactivando|activar|activando|modificar|modificando|alterar|alterando|silenciar|silenciando|manipular|manipulando|disabl(?:e|ing|ed)?|turn(?:ing)?\\s+off|turn(?:ing)?\\s+on|modif(?:y|ying|ied)|alter(?:ing|ed)?|silenc(?:e|ing|ed)|tamper(?:ing|ed)?)';
    const denialTerms = '(?:prohibi[a-z]*|jam(?:á|a)s|nunca|no se debe[n]?|est(?:á|a) estrictamente prohibido|prohibit[a-z]*|never|forbidden|shall not|must not)';
    const hasProhibition = new RegExp(`${denialTerms}[\\s\\S]{0,250}${prohibitionTerms}`, 'i').test(text) ||
        new RegExp(`${prohibitionTerms}[\\s\\S]{0,250}${denialTerms}`, 'i').test(text);
    if (!hasProhibition)
        return false;
    const consultationTerms = '(?:consultar|consulta|preguntar|autorizaci(?:ó|o)n|consentimiento|permiso|consult|consulting|consultation|ask|asking|authoriz[a-z]*|consent|permission)';
    const actorTerms = '(?:programador[a-z]*|desarrollador[a-z]*|humano[a-z]*|programmer[a-z]*|developer[a-z]*|human[a-z]*)';
    const hasProgrammerConsultation = new RegExp(`${consultationTerms}[\\s\\S]{0,200}${actorTerms}`, 'i').test(text) ||
        new RegExp(`${actorTerms}[\\s\\S]{0,200}${consultationTerms}`, 'i').test(text);
    if (!hasProgrammerConsultation)
        return false;
    const justificationTerms = 'justific[a-z]*|explicaci(?:ó|o)n|explicar|motivo[a-z]*|por qu(?:é|e)|\\bpros?\\b|\\bcontras?\\b|\\bcons?\\b|trade-offs?|reason[a-z]*|why|explain[a-z]*';
    const hasJustification = new RegExp(justificationTerms, 'i').test(text);
    if (!hasJustification)
        return false;
    const enMarkers = /(?:prohibit|disabl|consult|programmer|developer|trade-offs|pros|cons)/i;
    const esMarkers = /(?:prohibici(?:ó|o)n|desactivar|previa|desarrolladores|programador)/i;
    return matchesMandateLanguage(text, expectedLanguage, enMarkers, esMarkers);
}
/**
 * Checks if a block of markdown text contains the backward-compatible prohibition mandate.
 */
export function containsBackwardCompatMandate(text, expectedLanguage) {
    const hasSubject = /backward-compatible|retrocompatib|loud failure|fallo ruidoso|legacy fallback|shims?/i.test(text);
    if (!hasSubject)
        return false;
    const hasProhibition = /prohibit|prohibid|strictly|estrictamente|eradicated|erradicado/i.test(text);
    if (!hasProhibition)
        return false;
    const hasLoudFailure = /fail loudly|fallar ruidosamente|throw new error|exit code 1|código de salida 1/i.test(text);
    if (!hasLoudFailure)
        return false;
    const enMarkers = /(?:backward-compatible|loud failure|prohibit|deprecated alias|legacy fallback)/i;
    const esMarkers = /(?:retrocompatib|fallo ruidoso|prohibid|estrictamente prohibido|código legado)/i;
    return matchesMandateLanguage(text, expectedLanguage, enMarkers, esMarkers);
}
/**
 * Checks if a block of markdown text contains the fake pass prohibition mandate.
 */
export function containsFakePassMandate(text, expectedLanguage) {
    const hasSubject = /suppress|silenc|nullify|suprimir|silenciar|anular|eludir|fake pass|pase falso|pases falsos/i.test(text);
    if (!hasSubject)
        return false;
    const hasProhibition = /prohibit|prohibid|categorically|categóricamente|strictly|estrictamente/i.test(text);
    if (!hasProhibition)
        return false;
    const hasZeroTolerance = /zero-tolerance|cero tolerancia|gross misconduct|falta grave|auditor fix/i.test(text);
    if (!hasZeroTolerance)
        return false;
    const enMarkers = /(?:suppressing|silencing|nullifying|fake pass|zero-tolerance|gross misconduct)/i;
    const esMarkers = /(?:suprimir|silenciar|anular|pase falso|cero tolerancia|falta grave)/i;
    return matchesMandateLanguage(text, expectedLanguage, enMarkers, esMarkers);
}
const MANDATE_DEFINITIONS = [
    {
        ruleId: 'agents-missing-config-mandate',
        check: containsConfigAntiTamperingMandate,
        getSnippet: getCanonicalMandateSnippet,
        isExistingLine: l => l.includes('Modifying or Disabling Configurations') ||
            l.includes('Modificar o Desactivar Configuraciones') ||
            /(?:modifying|disabling|altering|turning off|modificar|desactivar|alterar|apagar)\s+(?:auditor\s+)?config/i.test(l),
        errorMessageEn: 'Root AGENTS.md must include the mandatory clause prohibiting modifying or disabling configurations without prior programmer consultation.',
        errorMessageEs: 'AGENTS.md raíz debe incluir obligatoriamente una cláusula en español que prohíba alterar o desactivar configuraciones sin consultar al programador, justificando técnicamente el motivo, pros y contras.'
    },
    {
        ruleId: 'agents-missing-backward-compat-mandate',
        check: containsBackwardCompatMandate,
        getSnippet: getCanonicalBackwardCompatSnippet,
        isExistingLine: l => l.includes('Backward-Compatible') ||
            l.includes('Retrocompatible') ||
            l.includes('Loud Failure') ||
            l.includes('Fallo Ruidoso'),
        errorMessageEn: 'Root AGENTS.md must include the mandatory clause with absolute prohibition on backward-compatible code and loud failure.',
        errorMessageEs: 'AGENTS.md raíz debe incluir obligatoriamente el mandato de prohibición absoluta de código retrocompatible y fallo ruidoso.'
    },
    {
        ruleId: 'agents-missing-fake-pass-mandate',
        check: containsFakePassMandate,
        getSnippet: getCanonicalFakePassSnippet,
        isExistingLine: l => l.includes('Zero-Tolerance Fake Pass') ||
            l.includes('Cero Tolerancia a Pases Falsos') ||
            l.includes('Suppressing, Silencing, Nullifying') ||
            l.includes('Suprimir, Silenciar, Anular'),
        errorMessageEn: 'Root AGENTS.md must include the mandatory clause prohibiting suppressing or silencing rules for fake clean passes.',
        errorMessageEs: 'AGENTS.md raíz debe incluir obligatoriamente el mandato de prohibición de suprimir reglas para lograr pases limpios falsos.'
    }
];
export class AgentsConfigMandateAuditor extends BaseAuditor {
    rootDir;
    languageOption;
    constructor(rootDir, options) {
        const projectRoot = rootDir || process.cwd();
        super({
            capabilities: { md: true, fix: true },
            fix: options?.fix,
            id: 'validate_agents_config_mandate',
            name: 'Root AGENTS.md Config Mandate Validator',
            description: 'Valida mandatos de config y arquitectura en AGENTS.md',
            family: 'documentation',
            packageName: 'AGENTS',
            icon: '🛡️',
            ruleIds: AGENTS_CONFIG_MANDATE_RULES,
            ruleDescriptions: {
                'agents-missing-config-mandate': 'Falta mandato de no alterar config',
                'agents-missing-backward-compat-mandate': 'Falta mandato no retrocompatible',
                'agents-missing-fake-pass-mandate': 'Falta mandato de cero pase falso'
            },
            coverage: {
                include: ['AGENTS.md']
            },
            projectRoot
        });
        this.rootDir = projectRoot;
        this.languageOption = options?.language;
    }
    async runAudit() {
        for (const rule of AGENTS_CONFIG_MANDATE_RULES) {
            this.markRuleEvaluated(rule);
        }
        const agentsMdPath = path.resolve(this.rootDir, 'AGENTS.md');
        this.recordScanned('AGENTS.md');
        if (!fsSync.existsSync(agentsMdPath)) {
            for (const rule of AGENTS_CONFIG_MANDATE_RULES) {
                this.addViolation({
                    ruleId: rule,
                    severity: 'error',
                    file: 'AGENTS.md',
                    line: 1,
                    message: 'No se encontró el archivo AGENTS.md en la raíz del proyecto para validar los mandatos de arquitectura.'
                });
            }
            return;
        }
        let content;
        try {
            content = fsSync.readFileSync(agentsMdPath, 'utf8');
        }
        catch {
            // catch-ok: Unreadable AGENTS.md
            return;
        }
        const config = getAuditConfig(this.rootDir);
        const targetLanguage = this.languageOption ?? config.documentation?.language ?? 'en';
        for (const mandate of MANDATE_DEFINITIONS) {
            content = this.auditSingleMandate(mandate, content, targetLanguage, agentsMdPath);
        }
    }
    auditSingleMandate(mandate, currentContent, targetLanguage, agentsMdPath) {
        const sections = extractContractSections(currentContent);
        if (sections.some(section => mandate.check(section, targetLanguage))) {
            return currentContent;
        }
        if (this.isFixActive()) {
            injectOrUpdateMandateInAgentsMd({
                agentsMdPath,
                content: currentContent,
                canonicalSnippet: mandate.getSnippet(targetLanguage),
                isExistingLine: mandate.isExistingLine
            });
            return fsSync.readFileSync(agentsMdPath, 'utf8');
        }
        this.addViolation({
            ruleId: mandate.ruleId,
            severity: 'error',
            file: 'AGENTS.md',
            line: findLocalContractsHeaderLine(currentContent),
            message: targetLanguage === 'es' ? mandate.errorMessageEs : mandate.errorMessageEn
        });
        return currentContent;
    }
}
if (process.argv[1] &&
    (process.argv[1].endsWith('validate_agents_config_mandate.ts') ||
        (typeof import.meta.filename === 'string' && process.argv[1] === import.meta.filename))) {
    await BaseAuditor.runCli(new AgentsConfigMandateAuditor());
}
//# sourceMappingURL=validate_agents_config_mandate.js.map