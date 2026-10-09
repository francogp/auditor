/**
 * src/analyzers/homebrew/homebrewTypes.ts
 *
 * Types and interfaces for the dynamic auditor and extension homebrew code detection engine.
 */
export const AUDITOR_HOMEBREW_RULES = [
    'auditor-manual-package-json',
    'auditor-manual-vue-sfc-regex',
    'auditor-manual-ts-ast',
    'auditor-manual-path-normalize',
    'auditor-raw-console',
    'auditor-manual-comment-stripping',
    'auditor-manual-brace-counting',
    'auditor-manual-path-containment',
    'auditor-manual-file-walker',
    'auditor-homebrew-predicates'
];
export function createLineDetector(options) {
    return {
        id: options.id,
        ruleId: options.ruleId,
        ruleDescription: options.ruleDescription,
        detect(context) {
            if (context.filePath.includes('core/'))
                return [];
            const findings = [];
            context.lines.forEach((line, idx) => {
                const lineNum = idx + 1;
                const trimmed = line.trim();
                if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
                    return;
                const result = options.checkLine(line, trimmed, lineNum, context);
                if (result) {
                    if (typeof result === 'string') {
                        findings.push({
                            ruleId: options.ruleId,
                            line: lineNum,
                            message: result,
                            context: trimmed,
                            severity: 'error'
                        });
                    }
                    else {
                        findings.push({
                            ruleId: options.ruleId,
                            line: lineNum,
                            message: result.message,
                            context: result.context ?? trimmed,
                            severity: result.severity ?? 'error'
                        });
                    }
                }
            });
            return findings;
        }
    };
}
//# sourceMappingURL=homebrewTypes.js.map