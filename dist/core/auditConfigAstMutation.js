import { SyntaxKind } from "ts-morph";
// src/core/auditConfigAstMutation.ts
/**
* src/core/auditConfigAstMutation.ts
* Low-level ts-morph AST property tree and array mutations for audit configuration files.
*/
function isPlainRecord(val) {
	return typeof val === "object" && val !== null && !Array.isArray(val);
}
function valueToTsMorphInitializer(val) {
	if (typeof val === "string") return `'${val.replaceAll("'", "\\'")}'`;
	if (typeof val === "number" || typeof val === "boolean") return String(val);
	if (val === null || val === void 0) return "undefined";
	if (Array.isArray(val)) return `[${val.map((item) => valueToTsMorphInitializer(item)).join(", ")}]`;
	if (isPlainRecord(val)) return `{\n${Object.entries(val).filter(([, v]) => v !== void 0).map(([k, v]) => {
		return `${/^[a-z_$][\w$]*$/i.test(k) ? k : `'${k.replaceAll("'", "\\'")}'`}: ${valueToTsMorphInitializer(v)}`;
	}).join(",\n")}\n}`;
	return "undefined";
}
function getNormalizedPropName(prop) {
	if ((prop.isKind(SyntaxKind.PropertyAssignment) || prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) && typeof prop.getName === "function") return prop.getName().replace(/^['"]|['"]$/g, "");
	return "";
}
function deduplicateObjectLiteralProperties(obj) {
	let mutated = false;
	const seenKeys = /* @__PURE__ */ new Set();
	for (const prop of obj.getProperties()) {
		const key = getNormalizedPropName(prop);
		if (!key) continue;
		if (seenKeys.has(key)) {
			if ("remove" in prop && typeof prop.remove === "function") {
				prop.remove();
				mutated = true;
			}
		} else {
			seenKeys.add(key);
			if (prop.isKind(SyntaxKind.PropertyAssignment)) {
				const init = prop.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
				if (init && deduplicateObjectLiteralProperties(init)) mutated = true;
			}
		}
	}
	return mutated;
}
function syncArrayElementsWithTsMorph(arrInit, missingVal) {
	let mutated = false;
	const existingTexts = new Set(arrInit.getElements().map((el) => el.getText().replace(/^['"]|['"]$/g, "")));
	for (const item of missingVal) if (typeof item === "string" && !existingTexts.has(item)) {
		arrInit.addElement(`'${item.replaceAll("'", "\\'")}'`);
		existingTexts.add(item);
		mutated = true;
	}
	return mutated;
}
function syncExistingPropertyWithTsMorph(existing, missingVal) {
	let mutated = false;
	const childObj = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
	if (childObj && isPlainRecord(missingVal)) {
		if (syncMissingPropsWithTsMorph(childObj, missingVal)) mutated = true;
	}
	const arrInit = existing.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
	if (arrInit && Array.isArray(missingVal) && syncArrayElementsWithTsMorph(arrInit, missingVal)) mutated = true;
	return mutated;
}
function sanitizeRecordForInjection(val) {
	const cleaned = {};
	for (const [k, v] of Object.entries(val)) {
		if (v === void 0) continue;
		if (isPlainRecord(v) && Object.keys(v).length === 0) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		cleaned[k] = v;
	}
	return Object.keys(cleaned).length > 0 ? cleaned : null;
}
function syncMissingPropsWithTsMorph(obj, missingProps) {
	let mutated = false;
	for (const [key, missingVal] of Object.entries(missingProps)) {
		if (missingVal === void 0) continue;
		if (isPlainRecord(missingVal) && Object.keys(missingVal).length === 0) continue;
		if (Array.isArray(missingVal) && missingVal.length === 0) continue;
		const existing = obj.getProperties().find((p) => getNormalizedPropName(p) === key);
		if (existing && existing.isKind(SyntaxKind.PropertyAssignment)) {
			if (syncExistingPropertyWithTsMorph(existing, missingVal)) mutated = true;
			continue;
		}
		const valToInject = isPlainRecord(missingVal) ? sanitizeRecordForInjection(missingVal) : missingVal;
		if (valToInject === null) continue;
		const safeKey = /^[a-z_$][\w$]*$/i.test(key) ? key : `'${key.replaceAll("'", "\\'")}'`;
		const valStr = valueToTsMorphInitializer(valToInject);
		obj.addPropertyAssignment({
			name: safeKey,
			initializer: valStr
		});
		mutated = true;
	}
	return mutated;
}
function findTargetAuditConfigObject(sourceFile) {
	for (const exp of sourceFile.getExportAssignments()) {
		const expr = exp.getExpression();
		if (expr && expr.isKind(SyntaxKind.CallExpression)) {
			const call = expr.asKind(SyntaxKind.CallExpression);
			if (call && call.getExpression().getText() === "defineAuditConfig") {
				const arg = call.getArguments()[0];
				if (arg && arg.isKind(SyntaxKind.ObjectLiteralExpression)) return arg.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
			}
		}
		if (expr && expr.isKind(SyntaxKind.ObjectLiteralExpression)) return expr.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
	}
	return null;
}
export { deduplicateObjectLiteralProperties, findTargetAuditConfigObject, getNormalizedPropName, syncArrayElementsWithTsMorph, syncMissingPropsWithTsMorph, valueToTsMorphInitializer };
