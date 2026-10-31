/**
 * src/core/refactor/classHierarchyHoister.ts
 *
 * CANONICAL CLASS HIERARCHY HOISTING ENGINE (Node.js 26+ Native)
 * Discovers common base classes across clone instances and hoists shared methods
 * to the base class instead of external utility modules when inheritance applies.
 */

import path from 'node:path';

import { Project, type ClassDeclaration, type SourceFile } from 'ts-morph';

export interface HoistingTarget {
  readonly baseClassName: string;
  readonly baseClassFile: string;
  readonly derivedClassNames: readonly string[];
  readonly canHoist: boolean;
  readonly reason?: string;
}

export class ClassHierarchyHoister {
  /**
   * Discovers if a set of class files share a common ancestor class declaration.
   */
  public static findCommonBaseClass(
    project: Project,
    targetFilePaths: readonly string[]
  ): HoistingTarget | null {
    const classDeclarations: ClassDeclaration[] = [];

    for (const filePath of targetFilePaths) {
      const sourceFile =
        project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
      if (!sourceFile) continue;
      const classes = sourceFile.getClasses();
      if (classes.length > 0) {
        classDeclarations.push(classes[0]!);
      }
    }

    if (classDeclarations.length < 2) {
      return null;
    }

    // Inspect base class of first declaration
    const firstBase = classDeclarations[0]!.getBaseClass();
    if (!firstBase) {
      return null;
    }

    const firstBaseName = firstBase.getName();
    if (!firstBaseName) return null;

    // Check if all other declarations extend the exact same base class
    const allShareBase = classDeclarations.every((cls) => {
      const b = cls.getBaseClass();
      return b && b.getName() === firstBaseName;
    });

    if (!allShareBase) {
      return null;
    }

    const baseSourceFile = firstBase.getSourceFile();
    return {
      baseClassName: firstBaseName,
      baseClassFile: path.normalize(baseSourceFile.getFilePath()),
      derivedClassNames: classDeclarations.map((c) => c.getName() ?? 'AnonymousClass'),
      canHoist: true
    };
  }

  /**
   * Hoists a method into the target base class if not already present.
   */
  public static hoistMethod(
    baseClassFile: SourceFile,
    baseClassName: string,
    methodSignature: string,
    methodBody: string,
    isProtected: boolean = true
  ): boolean {
    const baseClass = baseClassFile.getClass(baseClassName);
    if (!baseClass) return false;

    // Check if method already exists
    const methodName = methodSignature.replace(/\(.*$/, '').trim();
    if (baseClass.getMethod(methodName)) {
      return false; // already present
    }

    const modifier = isProtected ? 'protected ' : 'public ';
    baseClass.addMember(`\n  ${modifier}${methodSignature} {\n${methodBody}\n  }\n`);
    return true;
  }
}
