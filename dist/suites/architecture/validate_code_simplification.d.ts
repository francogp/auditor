import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const CODE_SIMPLIFICATION_RULES: readonly ["dead-code-accumulation", "boolean-trap-parameters", "deep-nesting-control-flow", "redundant-else-after-return", "premature-abstraction-wrapper", "massive-switch-branching"];
export type CodeSimplificationRuleId = (typeof CODE_SIMPLIFICATION_RULES)[number];
export declare class ValidateCodeSimplificationAuditor extends FileScanAuditor<CodeSimplificationRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
        roots?: readonly string[];
    });
    protected scanFile(relPath: string, content: string): void;
    private recordSimplificationFinding;
    private auditDeadCodeAccumulation;
    private auditBooleanTrapParameters;
    private auditDeepNestingControlFlow;
    private auditRedundantElseAfterReturn;
    private auditPrematureAbstractionWrapper;
    private auditMassiveSwitchBranching;
}
//# sourceMappingURL=validate_code_simplification.d.ts.map