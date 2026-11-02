/**
 * src/core/auditConfigAstMutation.ts
 * Low-level ts-morph AST property tree and array mutations for audit configuration files.
 */
import {
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile
} from 'ts-morph';

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function valueToTsMorphInitializer(val: unknown): string {
  if (typeof val === 'string') return `'${val.replaceAll("'", "\\'")}'`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val === null || val === undefined) return 'undefined';
  if (Array.isArray(val))
    return `[${val.map((item) => valueToTsMorphInitializer(item)).join(', ')}]`;
  if (isPlainRecord(val)) {
    const entries = Object.entries(val).filter(([, v]) => v !== undefined);
    const lines = entries.map(([k, v]) => {
      const safeKey = /^[a-z_$][\w$]*$/i.test(k) ? k : `'${k.replaceAll("'", "\\'")}'`;
      return `${safeKey}: ${valueToTsMorphInitializer(v)}`;
    });
    return `{\n${lines.join(',\n')}\n}`;
  }
  return 'undefined';
}

export function getNormalizedPropName(prop: {
  isKind: (kind: SyntaxKind) => boolean;
  getName?: () => string;
}): string {
  if (
    (prop.isKind(SyntaxKind.PropertyAssignment) ||
      prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) &&
    typeof prop.getName === 'function'
  ) {
    return prop.getName().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

export function deduplicateObjectLiteralProperties(obj: ObjectLiteralExpression): boolean {
  let mutated = false;
  const seenKeys = new Set<string>();
  for (const prop of obj.getProperties()) {
    const key = getNormalizedPropName(prop);
    if (!key) continue;
    if (seenKeys.has(key)) {
      if ('remove' in prop && typeof prop.remove === 'function') {
        prop.remove();
        mutated = true;
      }
    } else {
      seenKeys.add(key);
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        const init = prop.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (init && deduplicateObjectLiteralProperties(init)) {
          mutated = true;
        }
      }
    }
  }
  return mutated;
}

export function syncArrayElementsWithTsMorph(
  arrInit: ArrayLiteralExpression,
  missingVal: readonly unknown[]
): boolean {
  let mutated = false;
  const existingTexts = new Set(
    arrInit.getElements().map((el) => el.getText().replace(/^['"]|['"]$/g, ''))
  );
  for (const item of missingVal) {
    if (typeof item === 'string' && !existingTexts.has(item)) {
      arrInit.addElement(`'${item.replaceAll("'", "\\'")}'`);
      existingTexts.add(item);
      mutated = true;
    }
  }
  return mutated;
}

function syncExistingPropertyWithTsMorph(
  existing: PropertyAssignment,
  missingVal: unknown
): boolean {
  let mutated = false;
  const childObj = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
  if (childObj && isPlainRecord(missingVal)) {
    if (syncMissingPropsWithTsMorph(childObj, missingVal)) {
      mutated = true;
    }
  }
  const arrInit = existing.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (arrInit && Array.isArray(missingVal) && syncArrayElementsWithTsMorph(arrInit, missingVal)) {
    mutated = true;
  }
  if (
    typeof missingVal === 'boolean' ||
    typeof missingVal === 'number' ||
    typeof missingVal === 'string'
  ) {
    const currentText = existing.getInitializer()?.getText();
    const newInit = valueToTsMorphInitializer(missingVal);
    if (currentText !== newInit) {
      existing.setInitializer(newInit);
      mutated = true;
    }
  }
  return mutated;
}

export function syncMissingPropsWithTsMorph(
  obj: ObjectLiteralExpression,
  missingProps: Record<string, unknown>
): boolean {
  let mutated = false;
  for (const [key, missingVal] of Object.entries(missingProps)) {
    if (missingVal === undefined) continue;
    const existing = obj.getProperties().find((p) => getNormalizedPropName(p) === key);
    if (existing && existing.isKind(SyntaxKind.PropertyAssignment)) {
      if (syncExistingPropertyWithTsMorph(existing, missingVal)) {
        mutated = true;
      }
      continue;
    }
    if (!existing) {
      const safeKey = /^[a-z_$][\w$]*$/i.test(key) ? key : `'${key.replaceAll("'", "\\'")}'`;
      const valStr = valueToTsMorphInitializer(missingVal);
      obj.addPropertyAssignment({ name: safeKey, initializer: valStr });
      mutated = true;
    }
  }
  return mutated;
}

export function findTargetAuditConfigObject(
  sourceFile: SourceFile
): ObjectLiteralExpression | null {
  for (const exp of sourceFile.getExportAssignments()) {
    const expr = exp.getExpression();
    if (expr && expr.isKind(SyntaxKind.CallExpression)) {
      const call = expr.asKind(SyntaxKind.CallExpression);
      if (call && call.getExpression().getText() === 'defineAuditConfig') {
        const arg = call.getArguments()[0];
        if (arg && arg.isKind(SyntaxKind.ObjectLiteralExpression)) {
          return arg.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
        }
      }
    }
    if (expr && expr.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return expr.asKind(SyntaxKind.ObjectLiteralExpression) ?? null;
    }
  }
  return null;
}
