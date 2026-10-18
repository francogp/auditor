import path from "node:path";
import "ts-morph";
//#region src/core/refactor/classHierarchyHoister.ts
/**
* src/core/refactor/classHierarchyHoister.ts
*
* CANONICAL CLASS HIERARCHY HOISTING ENGINE (Node.js 26+ Native)
* Discovers common base classes across clone instances and hoists shared methods
* to the base class instead of external utility modules when inheritance applies.
*/
var ClassHierarchyHoister = class {
	/**
	* Discovers if a set of class files share a common ancestor class declaration.
	*/
	static findCommonBaseClass(project, targetFilePaths) {
		const classDeclarations = [];
		for (const filePath of targetFilePaths) {
			const sourceFile = project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
			if (!sourceFile) continue;
			const classes = sourceFile.getClasses();
			if (classes.length > 0) classDeclarations.push(classes[0]);
		}
		if (classDeclarations.length < 2) return null;
		const firstBase = classDeclarations[0].getBaseClass();
		if (!firstBase) return null;
		const firstBaseName = firstBase.getName();
		if (!firstBaseName) return null;
		if (!classDeclarations.every((cls) => {
			const b = cls.getBaseClass();
			return b && b.getName() === firstBaseName;
		})) return null;
		const baseSourceFile = firstBase.getSourceFile();
		return {
			baseClassName: firstBaseName,
			baseClassFile: path.normalize(baseSourceFile.getFilePath()),
			derivedClassNames: classDeclarations.map((c) => c.getName() ?? "AnonymousClass"),
			canHoist: true
		};
	}
	/**
	* Hoists a method into the target base class if not already present.
	*/
	static hoistMethod(baseClassFile, baseClassName, methodSignature, methodBody, isProtected = true) {
		const baseClass = baseClassFile.getClass(baseClassName);
		if (!baseClass) return false;
		const methodName = methodSignature.replace(/\(.*$/, "").trim();
		if (baseClass.getMethod(methodName)) return false;
		const modifier = isProtected ? "protected " : "public ";
		baseClass.addMember(`\n  ${modifier}${methodSignature} {\n${methodBody}\n  }\n`);
		return true;
	}
};
//#endregion
export { ClassHierarchyHoister };
