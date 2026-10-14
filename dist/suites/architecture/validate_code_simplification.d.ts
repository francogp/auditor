import ts from 'typescript';
import { FileScanAuditor } from '../../core/auditorBase.ts';
import { AuditedDocument } from '../../core/auditedDocument.ts';
export declare const CODE_SIMPLIFICATION_RULES: readonly ["dead-code-accumulation", "boolean-trap-parameters", "deep-nesting-control-flow", "redundant-else-after-return", "premature-abstraction-wrapper", "massive-switch-branching"];
export type CodeSimplificationRuleId = (typeof CODE_SIMPLIFICATION_RULES)[number];
export declare const CODE_SIMPLIFICATION_CAPABILITIES: {
    readonly speed: "light";
    readonly phase: "normal";
    readonly fix: "none";
    readonly md: false;
    readonly ast: true;
    readonly changedOnly: false;
    readonly critical: false;
};
export declare class ValidateCodeSimplificationAuditor extends FileScanAuditor<CodeSimplificationRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
        roots?: readonly string[];
    });
    protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void;
    private recordSimplificationFinding;
    private auditDeadCodeAccumulation;
    private auditBooleanTrapParameters;
    private computeNestingDepth;
    private isLoopAstNode;
    private isControlFlowAstNode;
    private isFunctionBoundaryAstNode;
    private checkDeepNestingViolation;
    private auditDeepNestingControlFlow;
    private auditRedundantElseAfterReturn;
    private auditPrematureAbstractionWrapper;
    private auditMassiveSwitchBranching;
}
//# sourceMappingURL=validate_code_simplification.d.ts.map