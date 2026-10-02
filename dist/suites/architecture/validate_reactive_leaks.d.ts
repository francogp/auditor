/**
 * scripts/auditors/architecture/validate_reactive_leaks.ts
 *
 * REACTIVE & DOM EVENT LEAK AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict memory leak prevention and listener hygiene across Vue components and composables:
 *   1. Event Listeners: Every window/document/element.addEventListener must either have { once: true },
 *      an explicit removeEventListener, or an unmount lifecycle hook (onUnmounted, onBeforeUnmount, onScopeDispose).
 *   2. Native Timers: Every setInterval must have a clearInterval.
 *
 * Escape Hatch:
 *   // leak-ok: <justification> or // reactive-leak-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_leaks.ts
 *   npm run validate:reactive-leaks
 */
import ts from 'typescript';
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type ReactiveLeakRuleId = 'dom-event-leak' | 'interval-leak';
export declare const REACTIVE_LEAK_RULES: readonly ReactiveLeakRuleId[];
export declare class ReactiveLeaksAuditor extends FileScanAuditor<ReactiveLeakRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkEventListenerLeak;
    private checkIntervalLeak;
    protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
    private createStandaloneSourceFile;
}
//# sourceMappingURL=validate_reactive_leaks.d.ts.map