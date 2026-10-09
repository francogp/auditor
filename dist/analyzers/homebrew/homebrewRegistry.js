/**
 * src/analyzers/homebrew/homebrewRegistry.ts
 *
 * Dynamic registry and runner coordinator for homebrew detectors.
 */
export class HomebrewDetectorRegistry {
    static detectors = new Map();
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
        const ids = new Set();
        for (const d of this.detectors.values()) {
            ids.add(d.ruleId);
        }
        return Array.from(ids);
    }
    static getRuleDescriptions() {
        const descriptions = {};
        for (const d of this.detectors.values()) {
            descriptions[d.ruleId] = d.ruleDescription;
        }
        return descriptions;
    }
    static run(context, disabledDetectors = []) {
        // Whole file exemption check
        if (context.content.includes('// homebrew-ok: all') ||
            context.content.includes('// homebrew-exempt')) {
            return [];
        }
        const disabledSet = new Set(disabledDetectors);
        const findings = [];
        for (const detector of this.detectors.values()) {
            if (disabledSet.has(detector.id))
                continue;
            const detectorFindings = detector.detect(context);
            for (const finding of detectorFindings) {
                const lineIdx = finding.line - 1;
                const lineText = context.lines[lineIdx] ?? '';
                const prevLineText = lineIdx > 0 ? (context.lines[lineIdx - 1] ?? '') : '';
                // Line-level or previous-line exemption check
                if (lineText.includes('// homebrew-ok:') ||
                    lineText.includes('// homebrew-ok') ||
                    prevLineText.includes('// homebrew-ok:') ||
                    prevLineText.includes('// homebrew-ok') ||
                    (finding.ruleId === 'auditor-raw-console' &&
                        (lineText.includes('// console-ok:') || prevLineText.includes('// console-ok:')))) {
                    continue;
                }
                findings.push(finding);
            }
        }
        return findings;
    }
}
//# sourceMappingURL=homebrewRegistry.js.map