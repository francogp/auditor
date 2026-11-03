import { ArrayLiteralExpression, ObjectLiteralExpression, SourceFile, SyntaxKind } from "ts-morph";
export declare function valueToTsMorphInitializer(val: unknown): string;
export declare function getNormalizedPropName(prop: {
  isKind: (kind: SyntaxKind) => boolean;
  getName?: () => string;
}): string;
export declare function deduplicateObjectLiteralProperties(obj: ObjectLiteralExpression): boolean;
export declare function deduplicateArrayLiteralElements(arr: ArrayLiteralExpression): boolean;
export declare function syncArrayElementsWithTsMorph(arrInit: ArrayLiteralExpression, missingVal: readonly unknown[]): boolean;
export declare function syncMissingPropsWithTsMorph(obj: ObjectLiteralExpression, missingProps: Record<string, unknown>): boolean;
export declare function findTargetAuditConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | null;