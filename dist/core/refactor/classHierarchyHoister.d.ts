import { Project, SourceFile } from "ts-morph";
export interface HoistingTarget {
  readonly baseClassName: string;
  readonly baseClassFile: string;
  readonly derivedClassNames: readonly string[];
  readonly canHoist: boolean;
  readonly reason?: string;
}
export declare class ClassHierarchyHoister {
  /**
   * Discovers if a set of class files share a common ancestor class declaration.
   */
  static findCommonBaseClass(project: Project, targetFilePaths: readonly string[]): HoistingTarget | null;
  /**
   * Hoists a method into the target base class if not already present.
   */
  static hoistMethod(baseClassFile: SourceFile, baseClassName: string, methodSignature: string, methodBody: string, isProtected?: boolean): boolean;
}