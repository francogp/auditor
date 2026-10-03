# Step-by-Step Guide: How to Create a New Sub-Auditor

This reference provides exhaustive implementation examples and walkthroughs for authoring new sub-auditors in `@francogp/auditor` or host extensions in `scripts/auditors/`.

---

## 1. Bundled Boilerplate Templates (`assets/templates/`)

Pre-formatted, production-ready templates conforming to all project standards are bundled directly within this skill for instant scaffolding:
- **Line-by-Line Scanner**: [`assets/templates/file_scan_auditor_template.ts`](../assets/templates/file_scan_auditor_template.ts)
- **Composite / Database / Asset Auditor**: [`assets/templates/base_auditor_template.ts`](../assets/templates/base_auditor_template.ts)
- **AST-Driven Auditor**: [`assets/templates/ast_auditor_template.ts`](../assets/templates/ast_auditor_template.ts)
- **Dedicated Vitest Unit Test**: [`assets/templates/auditor_unit_test_template.test.ts`](../assets/templates/auditor_unit_test_template.test.ts)

---

## 2. Option A: File-Scanning Auditor (`FileScanAuditor`)

Use `FileScanAuditor` when the audit inspects files line-by-line across specific directories (e.g. searching for regex patterns, forbidden tokens, or syntax rules).

```typescript
/**
 * scripts/auditors/architecture/validate_my_feature.ts
 *
 * MY FEATURE AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, isMainModule } from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-token'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-token',
  'my-feature-missing-attribute'
];

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  constructor(roots: readonly string[] = ['src']) {
    super({
      id: 'validate_my_feature',
      name: 'My Feature Validator',
      description: 'Valida tokens prohibidos y atributos de la característica X',
      family: 'architecture',
      ruleIds: MY_FEATURE_RULES,
      packageName: 'MiModulo',
      ruleDescriptions: {
        'my-feature-forbidden-token': 'Token prohibido en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante'
      },
      roots,
      allowedExtensions: new Set(['.vue', '.ts'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Check escape hatches: // domain-ok, // my-feature-ok
      if (this.isLineIgnored(line, ['my-feature-ok'])) continue;

      if (line.includes('bannedToken')) {
        this.addViolation({
          ruleId: 'my-feature-forbidden-token',
          severity: 'error',
          file: relPath,
          line: lineNum,
          message: `Forbidden token 'bannedToken' detected. Use canonical helper instead.`,
          context: line.trim()
        });
      }
    }
  }
}

// Canonical CLI Entrypoint
if (isMainModule(import.meta.url)) {
  await BaseAuditor.runCli(new MyFeatureAuditor());
}
```

---

## 3. Option B: Composite / Data Auditor (`BaseAuditor`)

Use `BaseAuditor` when the audit performs multi-source comparisons, AST graphs, database schema validations, or dataset integrity checks.

```typescript
/**
 * scripts/auditors/domain_data/validate_my_data.ts
 *
 * MY DATA INTEGRITY AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, isMainModule } from '@francogp/auditor';
import { MY_DATA } from '../../../src/data/myData.ts';

enableCompileCache();

export type MyDataRuleId = 'my-data-key-missing' | 'my-data-value-invalid';

export const MY_DATA_RULES: readonly MyDataRuleId[] = [
  'my-data-key-missing',
  'my-data-value-invalid'
];

export class MyDataAuditor extends BaseAuditor<MyDataRuleId> {
  constructor() {
    super({
      id: 'validate_my_data',
      name: 'My Data Validator',
      description: 'Valida integridad y campos obligatorios en base de datos',
      family: 'domain_data',
      ruleIds: MY_DATA_RULES,
      packageName: 'Datos',
      ruleDescriptions: {
        'my-data-key-missing': 'Clave faltante en registro de datos',
        'my-data-value-invalid': 'Valor no válido en propiedad requerida'
      },
      requiredFiles: [
        path.resolve(process.cwd(), 'src/data/myData.ts')
      ]
    });
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Validating my data keys...');
    for (const [key, value] of Object.entries(MY_DATA)) {
      this.filesScannedCount++;
      if (!value.requiredField) {
        this.addViolation({
          ruleId: 'my-data-key-missing',
          severity: 'error',
          file: 'src/data/myData.ts',
          line: 1,
          message: `Entry '${key}' is missing 'requiredField'.`,
          context: key
        });
      }
    }

    this.context.setMetric('Total Entries Checked', Object.keys(MY_DATA).length);
  }
}

// Canonical CLI Entrypoint
if (isMainModule(import.meta.url)) {
  await BaseAuditor.runCli(new MyDataAuditor());
}
```

---

## 4. Option C: AST-Driven Sub-Auditor (`requiresAst: true` & `SharedAstContext`)

Use `BaseAuditor` with `requiresAst: true` (or `FileScanAuditor` with `sourceFile`) when the audit inspects TypeScript syntax trees, imports, exports, decorators, types, or Vue SFC script blocks across codebase files.

```typescript
/**
 * scripts/auditors/architecture/validate_my_ast_rule.ts
 *
 * AST-DRIVEN AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, SharedAstContext, isMainModule } from '@francogp/auditor';

enableCompileCache();

export type MyAstRuleId = 'my-ast-forbidden-call';

export const MY_AST_RULES: readonly MyAstRuleId[] = [
  'my-ast-forbidden-call'
] as const;

export class MyAstAuditor extends BaseAuditor<MyAstRuleId> {
  constructor() {
    super({
      id: 'validate_my_ast_rule',
      name: 'My AST Rule Validator',
      description: 'Valida llamadas prohibidas en el AST de TypeScript',
      family: 'architecture',
      ruleIds: MY_AST_RULES,
      packageName: 'AST',
      ruleDescriptions: {
        'my-ast-forbidden-call': 'Llamada prohibida detectada en AST'
      },
      requiresAst: true,
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    this.context.logStep(1, 1, 'Analizando AST con contexto compartido...');

    const astEngine = astContext ?? new SharedAstContext();
    const relFiles = await this.context.collectFiles(['src'], new Set(['.ts', '.vue']));

    for (const relFile of relFiles) {
      this.filesScannedCount++;
      const absPath = path.resolve(this.projectRoot, relFile);
      const sourceFile = astEngine.getSourceFile(absPath);

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isCallExpression(node)) {
          // Inspect AST node properties...
        }
      });
    }

    this.context.setMetric('Files Scanned with AST', this.filesScannedCount);
  }
}

// Canonical CLI Entrypoint
if (isMainModule(import.meta.url)) {
  await BaseAuditor.runCli(new MyAstAuditor());
}
```

---

## 5. Universal Sub-Auditor Progress Contract (`ICompositeAuditor`)

All sub-auditors in `@francogp/auditor` adhere to the **Universal Sub-Auditor Progress Contract**, ensuring that every sub-rule, internal verification step, and returning result is disclosed live in the console of the main auditor (`audit_full.ts`) and recorded in `StandardAuditResult.subAuditors`.

### The Contract Types (`auditContract.ts`)
```typescript
export interface SubAuditorStep {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface SubAuditorReport {
  readonly id: string;
  readonly name: string;
  readonly status: 'passed' | 'failed';
  readonly count: number;
  readonly detail?: string;
}

export interface ICompositeAuditor {
  getSubAuditors(): readonly SubAuditorStep[];
}
```

### In FileScanAuditor (Automatic Ingestion)
When you inherit from `FileScanAuditor`, every rule declared in `this.ruleIds` is automatically mapped into `getSubAuditors()` using `this.formatRuleDescription(ruleId)`.
Upon completing the file scan, `ensureSubAuditorsLogged()` automatically logs each sub-auditor step:
```text
🔍 [1/2] MiModulo: Token prohibido en archivo fuente
🔍 [2/2] MiModulo: Atributo obligatorio faltante (🐛 2)
```
- **Zero Findings**: Silent and clean, with no badges or verbose text like `(0 encontradas)`.
- **With Findings**: Displays `(🐛 <count>)` prominently.
- **Description Length Cap**: The composed string `${packageName}: ${ruleDescription}` MUST remain `<= 50` characters (`MAX_AUDITOR_DESCRIPTION_LENGTH = 50`) and contain zero newlines. If a rule description exceeds 50 characters, `BaseAuditor` throws an explicit runtime `Error` during instantiation.
Zero manual logging code is required.

### In Composite / Multi-Phase BaseAuditor (Explicit Progress)
If your auditor performs multiple distinct phases (such as database indexing followed by parity checks, or running multiple AST sub-analyzers):
1. Override `getSubAuditors()`:
   ```typescript
   public override getSubAuditors(): readonly SubAuditorStep[] {
     return [
       { id: 'step-1-index', name: 'Indexación de datos', description: 'Indexa registros' },
       { id: 'step-2-parity', name: 'Paridad cruzada', description: 'Verifica paridad' }
     ];
   }
   ```
2. Call `this.logSubAudit(...)` as each sub-phase completes:
   ```typescript
   this.logSubAudit(1, 2, 'Indexación de datos', indexViolationsCount);
   // ... run phase 2 ...
   this.logSubAudit(2, 2, 'Paridad cruzada', parityViolationsCount);
   ```
Any unlogged steps will be backfilled automatically by `ensureSubAuditorsLogged()` when `finishAudit()` runs.

---

## 6. Pure PostCSS AST Analysis for Styles (Zero External Binaries)

Sub-auditors validating styles, stylesheets (`.css`, `.scss`), or Vue SFC `<style>` blocks **MUST NOT** spawn external native binaries (such as `css-checker-kit`, Go binaries, or unmaintained tools). These binaries cause Smart App Control (SAC) blocks on Windows, fail under `ignore-scripts: true`, and create platform fragility.

Instead, execute pure in-memory AST analysis using `postcss` and `postcss-scss`:

```typescript
import postcss from 'postcss';
import postcssScss from 'postcss-scss';

export function analyzeCssString(cssContent: string, filePath: string) {
  // Parse in-memory with SCSS syntax support
  const root = postcss().process(cssContent, { syntax: postcssScss }).root;

  root.walkRules(rule => {
    // Inspect selector: rule.selector
    // Inspect declarations inside the rule:
    rule.walkDecls(decl => {
      // Check property: decl.prop
      // Check value: decl.value
    });
  });
}
```

This pattern powers [`src/analyzers/cssAnalyzer.ts`](../../../../src/analyzers/cssAnalyzer.ts) and [`src/suites/architecture/validate_css_duplicates.ts`](../../../../src/suites/architecture/validate_css_duplicates.ts), evaluating all 7 CSS hygiene rules cleanly in milliseconds across all platforms.

---

## 7. Registering Host Extensions in `audit.config.ts`

Host applications implementing custom rules in `scripts/auditors/<family>/validate_<name>.ts` register them dynamically in `audit.config.ts`:

```typescript
import { defineAuditConfig } from '@francogp/auditor/config';
import { MyCompositeAuditor } from './scripts/auditors/domain_data/validate_my_composite.ts';

export default defineAuditConfig({
  extensions: [
    {
      auditor: new MyCompositeAuditor(),
      family: 'domain_data',
      name: 'Custom Domain Validator'
    }
  ]
});
```

When `npx auditor` or `npm run audit` runs, `auditScanner.ts` automatically discovers registered extensions and executes them seamlessly within the main Box-Drawing summary table.

---

## 8. Mandatory Hermetic Unit Testing

Every sub-auditor MUST have a companion unit test file in `tests/<suite_name>.test.ts` (or `tests/node/auditors/` for host extensions) adhering to:

1. **Negative Verification**: Asserts that clean code yields `0 errors` and `status: 'passed'`.
2. **RuleId Coverage**: Every declared rule ID has dedicated dirty snippet assertions.
3. **Zero Live Scanning**: Use `auditor.testScanFile(...)` followed by `await auditor.finishAudit()`, or initialize `BaseAuditor({ projectRoot: tempDir })`. Never run `auditor.execute()` on `process.cwd()`.
