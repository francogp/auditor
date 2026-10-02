/**
 * scripts/auditors/architecture/validate_template_ids.ts
 *
 * TEMPLATE STATIC ID INTEGRITY & COLLISION AUDITOR (Node.js 26+ Native)
 *
 * Enforces HTML/DOM uniqueness and E2E locator predictability across all Vue components:
 *   1. Duplicate Static ID within Component (`template-duplicate-static-id`):
 *      Forbids having two elements with the exact same static `id="..."` attribute
 *      inside the same `<template>` block.
 *   2. Shared Generic Static IDs Across Components (`template-shared-static-id`):
 *      Detects collision-prone static IDs reused across different components (e.g.
 *      `id="close-btn"`, `id="confirm-btn"`). Components should namespace their IDs
 *      (e.g. `id="rename-modal-close-btn"`) to prevent DOM collisions and Playwright
 *      locator ambiguity.
 *
 * Escape Hatches:
 *   `<!-- id-ok -->`, `// id-ok`, `// template-ok`
 *
 * Usage:
 *   npm run validate:template-ids
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type TemplateIdRuleId = 'template-duplicate-static-id' | 'template-shared-static-id' | 'template-missing-input-id';
export declare const TEMPLATE_ID_RULES: readonly TemplateIdRuleId[];
export declare class TemplateIdAuditor extends FileScanAuditor<TemplateIdRuleId> {
    private readonly globalIdMap;
    private readonly requireInputIds;
    constructor(roots?: readonly string[], options?: {
        requireInputIds?: boolean;
    }, projectRoot?: string);
    getMatchLineInfo(content: string, lines: string[], offset: number): {
        lineNumber: number;
        lineContent: string;
        isIgnored: boolean;
    };
    protected scanFile(relPath: string, content: string): void;
    private checkSingleIdCollisions;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_template_ids.d.ts.map