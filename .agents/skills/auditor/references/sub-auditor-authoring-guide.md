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

```mermaid
flowchart LR
    A["File Discovery (collectFiles)"] --> B["File Content Ingestion"]
    B --> C["FileScanAuditor Pipeline"]
    subgraph Declarative Architecture
        C --> D["declarePatternSubAuditor (Regex Pattern)"]
        C --> E["declareFileSubAuditor (Document AST/Logic)"]
        C --> F["scanFile (Custom Rule Walk)"]
    end
    D --> G["runSubAuditorSync (Rule 1: Empirical Timing)"]
    E --> H["runSubAuditorSync (Rule 2: Empirical Timing)"]
    F --> I["runSubAuditorSync (Rule 3: Empirical Timing)"]
    G & H & I --> J["Consolidated Box-Drawing Report"]
```

```typescript
/**
 * scripts/auditors/architecture/validate_my_feature.ts
 *
 * MY FEATURE AUDITOR (Node.js 26+ Native)
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, hasLineSuppression, createUniformRuleCapabilities } from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-token'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-token',
  'my-feature-missing-attribute'
];

export interface MyFeatureAuditorOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
  readonly exemptPaths?: readonly (string | RegExp)[];
}

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  constructor(options: MyFeatureAuditorOptions = {}) {
    super({
      id: 'validate_my_feature',
      name: 'My Feature Validator',
      description: 'Valida tokens prohibidos y atributos en src/',
      icon: '🔍', // Mandatory thematic emoji
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(MY_FEATURE_RULES, {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }),
      ruleIds: MY_FEATURE_RULES,
      packageName: 'MiModulo',
      configKey: 'paths.srcRoots',
      defaultConfig: {
        srcRoots: ['src']
      },
      criticalConfig: {},
      ruleDescriptions: {
        'my-feature-forbidden-token': 'Token prohibido en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante'
      },
      roots: options.roots ?? ['src'],
      allowedExtensions: new Set(['.vue', '.ts']),
      // Dynamic Exemption Architecture: automatically skips documents matching strings or RegExps.
      // Prohibits hardcoding ignores or candidate file arrays in code.
      exemptPaths: options.exemptPaths,
      projectRoot: options.projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // Rule 1: Forbidden token check (empirically timed, markRuleEvaluated handled automatically)
    this.runSubAuditorSync('my-feature-forbidden-token', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        // Check escape hatches: // domain-ok, // my-feature-ok, or multiline comments
        if (this.isLineIgnored(line, ['my-feature-ok']) || hasLineSuppression(line, 'my-feature-forbidden-token', lines, i)) continue;

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
    });

    // Rule 2: Missing attribute check (empirically timed)
    this.runSubAuditorSync('my-feature-missing-attribute', () => {
      if (relPath.endsWith('.vue') && content.includes('<custom-widget') && !content.includes('aria-label=')) {
        this.addViolation({
          ruleId: 'my-feature-missing-attribute',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `<custom-widget> requires an 'aria-label' attribute.`,
          context: '<custom-widget'
        });
      }
    });
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());
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
import { BaseAuditor, createUniformRuleCapabilities } from '@francogp/auditor';
import { MY_DATA } from '../../../src/data/myData.ts';

enableCompileCache();

export type MyDataRuleId = 'my-data-key-missing' | 'my-data-value-invalid';

export const MY_DATA_RULES: readonly MyDataRuleId[] = [
  'my-data-key-missing',
  'my-data-value-invalid'
];

export interface MyDataAuditorOptions {
  readonly projectRoot?: string;
}

export class MyDataAuditor extends BaseAuditor<MyDataRuleId> {
  constructor(options: MyDataAuditorOptions = {}) {
    super({
      id: 'validate_my_data',
      name: 'My Data Validator',
      description: 'Valida integridad y campos obligatorios en base de datos',
      icon: '📊', // Mandatory thematic emoji
      family: 'domain_data',
      ruleCapabilities: createUniformRuleCapabilities(MY_DATA_RULES, {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }),
      ruleIds: MY_DATA_RULES,
      packageName: 'Datos',
      configKey: 'paths.dataRoots',
      defaultConfig: {
        dataRoots: ['src/data']
      },
      criticalConfig: {},
      ruleDescriptions: {
        'my-data-key-missing': 'Clave faltante en registro de datos',
        'my-data-value-invalid': 'Valor no válido en propiedad requerida'
      },
      coverage: {
        include: ['src/data/myData.ts'],
        source: 'runtime'
      },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const dataFilePath = path.resolve(this.projectRoot, 'src/data/myData.ts');
    this.recordScanned(dataFilePath);

    this.context.logStep(1, 2, 'Validating my data keys...');

    // Rule 1: Missing key check (timed empirically)
    this.runSubAuditorSync('my-data-key-missing', () => {
      for (const [key, value] of Object.entries(MY_DATA)) {
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
    });

    // Rule 2: Value check (timed empirically)
    this.runSubAuditorSync('my-data-value-invalid', () => {
      for (const [key, value] of Object.entries(MY_DATA)) {
        if (typeof value.requiredField !== 'string') {
          this.addViolation({
            ruleId: 'my-data-value-invalid',
            severity: 'error',
            file: 'src/data/myData.ts',
            line: 1,
            message: `Entry '${key}' has invalid value.`,
            context: key
          });
        }
      }
    });

    this.context.setMetric('Total Entries Checked', Object.keys(MY_DATA).length);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new MyDataAuditor());
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
import { BaseAuditor, SharedAstContext, createRuleCapabilities } from '@francogp/auditor';

enableCompileCache();

export const MY_AST_RULES = [
  'my-ast-forbidden-call'
] as const;
export type MyAstRuleId = (typeof MY_AST_RULES)[number];

export class MyAstAuditor extends BaseAuditor<MyAstRuleId> {
  constructor() {
    super({
      id: 'validate_my_ast_rule',
      name: 'My AST Rule Validator',
      description: 'Valida llamadas prohibidas en el AST de TypeScript',
      icon: '🌳', // Mandatory thematic emoji
      family: 'architecture',
      ruleIds: MY_AST_RULES,
      packageName: 'AST',
      configKey: 'paths.srcRoots',
      defaultConfig: {
        srcRoots: ['src']
      },
      criticalConfig: {},
      ruleDescriptions: {
        'my-ast-forbidden-call': 'Llamada prohibida detectada en AST'
      },
      ruleCapabilities: createRuleCapabilities(MY_AST_RULES, {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: true,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }),
      requiresAst: true,
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    const astEngine = astContext ?? new SharedAstContext();
    const relFiles = await this.context.collectFiles(['src'], new Set(['.ts', '.vue']));

    this.runSubAuditorSync('my-ast-forbidden-call', () => {
      for (const relFile of relFiles) {
        this.recordScanned(relFile);
        const absPath = path.resolve(this.projectRoot, relFile);
        const sourceFile = astEngine.getSourceFile(absPath);

        ts.forEachChild(sourceFile, (node) => {
          if (ts.isCallExpression(node)) {
            // Inspect AST node properties...
          }
        });
      }
    });

    this.context.setMetric('Files Scanned with AST', relFiles.length);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new MyAstAuditor());
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
🔍 [1/2] MiModulo: Token prohibido en archivo fuente ⚡ (12,4 ms)
🔍 [2/2] MiModulo: Atributo obligatorio faltante [🐛 2] ⚡ (5,1 ms)
```

- **Zero Findings**: Silent and clean, with no badges or verbose text like `(0 encontradas)`.
- **With Findings**: Displays `[🐛 <count>]` prominently in square brackets, with execution duration strictly enclosed in parentheses `(X ms)`.
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

## 6. Universal Empirical Individual Timing Contract & Sub-Auditor Execution Mechanics

To eliminate false passes, unmeasured rules, synthetic time divisions, and duplicate batch timestamps in the terminal Box-Drawing summary table, all sub-auditors and host extensions MUST adhere strictly to the **Universal Empirical Individual Timing Contract**.

### 6.1. 100% Empirical Individual Measurement (Zero Synthetic Division & Zero Batch Duplication)

- **Mandatory Empirical Stamping**: 100% of declared rules in `ruleIds` MUST record and display an empirical execution duration badge (`(X ms)` or `(<0,1 ms)`).
- **Prohibition of Synthetic Division**: Dividing total audit duration by the number of rules ($T / N$) is **STRICTLY PROHIBITED**. Synthetic divisions produce fake numbers that mask actual slow checks.
- **Prohibition of Batch Stamping Duplication**: Running a batch action and stamping the entire elapsed time identically onto every rule (e.g. duplicating `(449,5 ms)` across multiple rules) is **STRICTLY PROHIBITED**. Each rule check must measure its own distinct execution slice.

### 6.2. Superclass Measurement Wrappers (`runSubAuditorSync` & `runSubAuditor`)

`BaseAuditor` and `FileScanAuditor` provide built-in execution wrappers that measure execution time via high-resolution timers (`performance.now()`), accumulate durations across multiple files, and automatically mark rules as evaluated:

1. **Synchronous Checks (`this.runSubAuditorSync`)**:

   ```typescript
   this.runSubAuditorSync('my-rule-id', () => {
     // Perform analysis for this rule...
     if (hasViolation) {
       this.addViolation({ ruleId: 'my-rule-id', ... });
     }
   });
   ```

2. **Asynchronous Checks (`await this.runSubAuditor`)**:

   ```typescript
   await this.runSubAuditor('my-async-rule-id', async () => {
     const data = await fetchOrReadData();
     // Perform async analysis...
   });
   ```

3. **In `FileScanAuditor.scanFile` Loops**:
   When scanning files, wrap the evaluation of each rule inside `runSubAuditorSync`:

   ```typescript
   protected override scanFile(relPath: string, content: string): void {
     const lines = content.split(/\r?\n/);

     this.runSubAuditorSync('rule-one', () => {
       // Evaluate rule one across lines...
     });

     this.runSubAuditorSync('rule-two', () => {
       // Evaluate rule two across lines...
     });
   }
   ```

   `FileScanAuditor` automatically sums the execution time across all scanned files for each rule ID.

### 6.2.1 Generic Action Return Values (`runSubAuditorSync<T>` & `runSubAuditor<T>`)

Both `this.runSubAuditorSync<T>` and `await this.runSubAuditor<T>` return the evaluated result of their action callback directly:

```typescript
// Synchronous check returning data directly:
const parsedConfig = this.runSubAuditorSync('config-syntax', () => {
  return JSON.parse(rawContent) as MyConfig;
});

// Asynchronous check returning data directly:
const verifiedFiles = await this.runSubAuditor('config-missing', async () => {
  return await this.ensureConfigFile(requirement);
});
```

This pattern eliminates the need for outer mutable `let` variables across closures, preventing TypeScript Control Flow Analysis (CFA) narrowing issues (such as variables being inferred as `null` or `never` following an `await` closure).

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Sub-Auditor / scanFile()
    participant Base as BaseAuditor
    participant Timer as performance.now()
    participant Ledger as durationsByRule Map

    Caller->>Base: runSubAuditorSync(ruleId, action)
    Base->>Base: markRuleEvaluated(ruleId)
    Base->>Timer: Record start timestamp
    Base->>Caller: Execute action callback
    Caller-->>Base: Return result <T> (or add violations)
    Base->>Timer: Record end timestamp
    Base->>Base: Calculate elapsed = end - start
    Base->>Ledger: Accumulate duration for ruleId
    Base-->>Caller: Return result <T> directly
```

### 6.3. Deconstruction Pattern for External Multi-Rule Tools (ESLint, Stylelint, Knip, TypeCoverage)

When an auditor wraps a heavy external tool or linter that produces a composite report for multiple rules in a single pass:

1. **Execute Shared Tool Once**: Run the external CLI, parser, or library once up-front to collect the raw findings list.
2. **Deconstruct Rule Evaluation**: Iterate over each declared rule, wrapping the filtering and registration of its specific findings inside `this.runSubAuditorSync(ruleId, () => { ... })`:

```mermaid
flowchart TD
    A["External Multi-Rule Tool (e.g. ESLint / Knip)"] -->|"Single High-Cost Execution"| B["Raw Tool Findings List"]
    B --> C{"Deconstruct per Declared Rule"}
    C -->|"Rule 1"| D1["runSubAuditorSync('rule-1', () => filter findings)"]
    C -->|"Rule 2"| D2["runSubAuditorSync('rule-2', () => filter findings)"]
    C -->|"Rule N"| DN["runSubAuditorSync('rule-N', () => filter findings)"]
    D1 --> E["Empirical Duration Badge: rule-1 (0.2 ms)"]
    D2 --> F["Empirical Duration Badge: rule-2 (0.1 ms)"]
    DN --> G["Empirical Duration Badge: rule-N (0.3 ms)"]
```

```typescript
// Step 1: Run the shared analysis once up-front
const findings = await runExternalTool(this.projectRoot);

// Step 2: Evaluate and measure each declared rule individually
for (const ruleId of MY_DECLARED_RULES) {
  this.runSubAuditorSync(ruleId, () => {
    const matchingFindings = findings.filter(f => f.ruleId === ruleId);
    for (const finding of matchingFindings) {
      this.addViolation({
        ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        message: finding.message
      });
    }
  });
}
```

This pattern guarantees:

- External CLI executes only once (zero performance regression).
- 100% of declared rules receive individual, empirical execution timestamps (`<0,1 ms`, `0,2 ms`, etc.) in the terminal table.
- Zero duplicate batch times (`449,5 ms`) or fake `(0 ms)` badges.

### 6.4. Automatic Rule Evaluation & Prohibition of Redundant `markRuleEvaluated` Boilerplate

`runSubAuditorSync` and `runSubAuditor` internally call `this.markRuleEvaluated(ruleId)`.
Preceding these calls with explicit loops like:

```typescript
// ❌ PROHIBITED: Redundant boilerplate
for (const r of this.ruleIds) {
  this.markRuleEvaluated(r);
}
```

is completely redundant and strictly prohibited. Let the superclass wrappers handle rule evaluation tracking automatically.

### 6.5. Transparent Inapplicability & Empty Targets (`markRuleNotApplicable`)

If a subsystem, configuration, or target folder does not exist on disk (for example, `e2e/` folder does not exist, or `persistence.engine: 'none'`), rules must NEVER be silently skipped without timing, which would leave their duration undefined and cause `(0 ms)` badges.

Always wrap the inapplicability declaration inside `runSubAuditorSync`:

```typescript
if (!fs.existsSync(targetDir)) {
  for (const ruleId of this.ruleIds) {
    this.runSubAuditorSync(ruleId, () => {
      this.markRuleNotApplicable(ruleId, `Directorio objetivo '${targetDir}' no encontrado`);
    });
  }
  return;
}
```

This records a genuine duration badge (`<0,1 ms`), marks the status cleanly as `passed`, and provides transparent audit logging.

### 6.6. Canonical Implementation Blueprints from New Framework Suites

The framework includes 5 modern sub-auditors implementing this contract across architectural, performance, and security domains:

1. **`validate_web_performance`** (`performance` family, 7 rules):
   - Rules: `unoptimized-images`, `font-display-missing`, `inline-svg-bloat`, `css-render-blocking`, `excessive-dom-depth`, `layout-shift-dimensions`, `uncompressed-video`.
   - Pattern: AST and SFC scanner measuring font-display, img dimension attributes, and inline SVG sizes with per-rule `runSubAuditorSync`.

2. **`validate_query_performance`** (`performance` family, 6 rules):
   - Rules: `unindexed-foreign-keys`, `select-star-in-queries`, `unpaginated-queries`, `n-plus-one-patterns`, `heavy-count-queries`, `unindexed-order-by`.
   - Pattern: Static query analyzer inspecting SQL and ORM queries for `SELECT *` anti-patterns, missing `.limit()` calls, and query loops inside array mappings.

3. **`validate_security_hardening`** (`security` family, 8 rules):
   - Rules: `hardcoded-secrets`, `insecure-random`, `vulnerable-regex-redos`, `raw-html-injection`, `missing-csrf-token`, `eval-or-function-constructor`, `permissive-cors`, `unvalidated-redirect`.
   - Pattern: High-speed AST scanner checking `Math.random()`, `eval()`, `new Function()`, `v-html`, and unvalidated redirect targets.

4. **`validate_code_simplification`** (`architecture` family, 6 rules):
   - Rules: `dead-code-accumulation`, `boolean-trap-parameters`, `deep-nesting-control-flow`, `redundant-else-after-return`, `premature-abstraction-wrapper`, `massive-switch-branching`.
   - Pattern: Structural AST analyzer inspecting nested control flow depth, redundant else branches after return/throw, and boolean trap signatures.

5. **`validate_scss_architecture`** (`architecture` family, 5 rules):
   - Rules: `raw-css-in-sfc`, `scss-deep-selector-abuse`, `non-standard-spacing-unit`, `missing-theme-token-usage`, `excessive-scss-nesting`.
   - Pattern: Style preprocessor analyzer enforcing `lang="scss"` on SFC `<style>` blocks, disallowing obsolete spacing units (`pt`, `in`, `cm`), and preventing excessive nesting depth.

---

## 7. Official Stylelint Engine & Pure In-Memory Analysis (Zero External Binaries)

Sub-auditors validating styles, stylesheets (`.css`, `.scss`), or Vue SFC `<style>` blocks **MUST NOT** spawn external native binaries (such as `css-checker-kit`, Go binaries, or unmaintained tools). These binaries cause Smart App Control (SAC) blocks on Windows, fail under `ignore-scripts: true`, and create platform fragility.

Instead, stylesheet and component style hygiene, duplicate class rules, similar selectors, empty blocks, property order, and SCSS syntax are analyzed strictly through the official Stylelint engine with Vue SFC and SCSS support (`stylelint`, `stylelint-scss`, `stylelint-order`) and in-memory PostCSS AST processing:

```typescript
import stylelint from 'stylelint';

export async function lintStyleContent(code: string, codeFilename: string) {
  const result = await stylelint.lint({
    code,
    codeFilename,
    config: {
      extends: ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue/scss']
    }
  });
  return result.results;
}
```

This pattern powers [`src/suites/architecture/validate_stylelint.ts`](../../../../src/suites/architecture/validate_stylelint.ts), evaluating all CSS hygiene, property order, duplicate rules, and SCSS syntax cleanly in milliseconds across all platforms.

### Dart Sass Function Collision Prevention (`sass-traps/collision-casing`)

In SCSS and Vue SFC `<style lang="scss">`, standard CSS functions that share names with Dart Sass built-in functions (`scale`, `scaleX`, `scaleY`, `scaleZ`, `scale3d`, `saturate`, `grayscale`, `invert`, `alpha`, `brightness`, `contrast`, `drop-shadow`, `hue-rotate`, `translateX`, `translateY`, `translateZ`, `translate3d`, `radial-gradient`, `linear-gradient`) must be written with PascalCase/CamelCase initial letters (e.g. `Scale(1.1)`, `Saturate(0.9)`, `Drop-Shadow(...)`, `hue-Rotate(...)`).

Lowercase invocations collide with Dart Sass internal evaluation and cause fatal build crashes:

```text
[sass] $color: 1.1 is not a color.
[sass] Missing argument $amount.
```

The native Stylelint plugin [`src/suites/architecture/stylelintSassTrapsPlugin.ts`](../../../../src/suites/architecture/stylelintSassTrapsPlugin.ts) (`sass-traps/collision-casing`) inspects PostCSS value AST nodes and automatically repairs colliding functions to their canonical capitalized forms when running in `--fix` mode. Standard `.stylelintrc.json` preserves `function-name-case: ['lower', { ignoreFunctions: ['/^[A-Z]/', 'Drop-Shadow', 'Drop-shadow', 'hue-Rotate', 'Hue-Rotate'] }]` and `value-keyword-case: ['lower', { camelCaseSvgKeywords: true, ignoreProperties: ['/--.*/'], ignoreFunctions: ['v-bind'] }]` to ensure zero rule deactivation while preserving unquoted `v-bind(...)` in Vue SFC. Furthermore, `order/order` partitions `@include` mixins by `hasBlock` (`hasBlock: false` before declarations, `hasBlock: true` after declarations) so that media queries properly override declarations down the CSS cascade without being superseded in mobile-first layouts.

---

## 8. Sub-Auditor Capabilities Contract (`AuditorCapabilities`) & Zero-Boilerplate Defaults

Every sub-auditor declares its execution capabilities dynamically. The orchestrator inspects these capabilities to coordinate specialized execution modes (such as `auditor fix`, fast presets, differential runs, or AST sharing) without maintaining hardcoded suite lists.

### The Standard Capabilities

```typescript
export interface AuditorCapabilities {
  /** Supports automatic fixing/repair of detected violations (--fix / auditor fix). */
  readonly fix: boolean;
  /** High priority in auto-repair mode; executed FIRST to bootstrap environment, configs, and scripts. */
  readonly fixPriority: boolean;
  /** Included in fast lint preset (preset=lint). */
  readonly lint: boolean;
  /** Included in markdown documentation preset (preset=md). */
  readonly md: boolean;
  /** Requires in-memory TypeScript AST parsing engine (SharedAstContext). */
  readonly ast: boolean;
  /** Supports differential file scanning (--changed-since / changed-since=origin/main). */
  readonly changedSince: boolean;
  /** Heavy computation / long-running suite, excluded by default from fast presets. */
  readonly heavy: boolean;
  /** Requires compilation / distribution artifacts (dist/) to exist prior to audit (auditor:build). */
  readonly requiresBuild: boolean;
  /** Lifecycle hook executed after primary scan. */
  readonly postRun: boolean;
}
```

### Mandatory Capabilities Contract & 100% Complete Initialization

`BaseAuditor` enforces strict, complete initialization with **zero fallbacks**. Sub-auditors and host extensions **MUST declare ruleCapabilities** (using `createUniformRuleCapabilities(ruleIds, capabilities)` or `createRuleCapabilities(ruleIds, baseCapabilities, fixableRuleIds)`), explicitly declaring all 9 boolean capabilities (`fix`, `fixPriority`, `lint`, `md`, `ast`, `changedSince`, `heavy`, `requiresBuild`, `postRun`) as booleans (`true` or `false`).

> [!CAUTION]
> **V6 → V7 BREAKING CHANGE: PROHIBITION ON PASSING `capabilities` DIRECTLY**
> In v7.0.0+, suite-level `capabilities` must **NEVER** be passed directly to constructor options (`capabilities?: never`). Passing `capabilities: { ... }` throws an immediate, loud `[Auditor Contract Violation]` error. Always use `ruleCapabilities: createRuleCapabilities(...)` or `createUniformRuleCapabilities(...)`. The superclass automatically derives suite-level capabilities from the registered rules!

```typescript
// Standard sub-auditor: initialize ruleCapabilities using createUniformRuleCapabilities
export class MyValidator extends BaseAuditor<MyRuleId> {
  constructor() {
    super({
      id: 'validate_my_validator',
      ruleCapabilities: createUniformRuleCapabilities(MY_RULES, {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }),
      ruleIds: MY_RULES,
      ...
    });
  }
}

// Auto-repair capable sub-auditor: declare fixableRuleIds via createRuleCapabilities
export class MyAutoFixValidator extends BaseAuditor<MyRuleId> {
  constructor() {
    super({
      id: 'validate_my_auto_fix',
      ruleCapabilities: createRuleCapabilities(
        MY_RULES,
        {
          fix: false,
          fixPriority: false,
          lint: true,
          md: false,
          ast: false,
          changedSince: false,
          heavy: false,
          requiresBuild: false,
          postRun: false
        },
        ['my-fixable-rule'] // fixableRuleIds
      ),
      ruleIds: MY_RULES,
      ...
    });
  }
}
```

### Dynamic Auto-Coordination in the Runner (Zero Hardcoding)

- **`auditor fix` / `auditor --fix`**: Automatically discovers all suites declaring `capabilities.fix === true`. Suites declaring `capabilities.fixPriority === true` (environment, tooling, and configuration generators) execute **FIRST**, ensuring `.auditor/audit.config.ts`, `.gitignore`, `package.json` scripts, and linter configs are established before dependent code/style fixers run.
- **Fast presets (`preset=lint`, `preset=md`)**: Automatically run suites with `capabilities.lint === true` or `capabilities.md === true`, while bypassing suites with `capabilities.heavy === true`.
- **Post-Build verification (`auditor:build` / `preset=build`)**: Automatically runs suites with `capabilities.requiresBuild === true` against `dist/` post-compilation, excluding them from source audits.
- **Pre-heat AST**: Automatically initializes `SharedAstContext` before executing any suite with `capabilities.ast === true`.

### Mandatory Speed Contract (`speed: AuditExecutionSpeed`) & Scheduler LPT

The framework enforces strict governance over execution speed across all suites and host extensions:

1. **Mandatory Speed Property (`SubAuditorReport.speed`)**:
   - Every sub-auditor report step MUST contain `speed: AuditExecutionSpeed` (`'fast' | 'heavy'`).
   - The speed property is **strictly non-optional**. Setting `speed` to `undefined` or allowing it to remain unassigned is categorically forbidden.
   - If a sub-auditor or rule capability does not define `heavy: boolean` or cannot resolve its execution speed, the orchestrator **FAILS LOUDLY** (`throw new Error(...)`) at runtime, preventing silent contract degradation.

2. **Longest Processing Time First (Scheduler LPT)**:
   - When preparing the execution queue in `audit_full`, tasks are prioritized dynamically: suites that execute at least one heavy command or rule are placed **FIRST** in the queue.
   - This ensures background worker threads absorb heavy suites (e.g. `validate_type_check`, `validate_eslint`, `validate_fallow`) immediately from $T_0$, while lighter suites execute concurrently across free threads, eliminating tail-end bottlenecks.

3. **Sub-Line Console Indicators (`⚡` / `🐢`)**:
   - The suite header remains clean and unaltered.
   - Sub-auditor child lines render the execution speed emoji alongside the elapsed duration:
     - `⚡` indicates fast command / rule execution.
     - `🐢` indicates heavy command / rule execution.

4. **Logical Classification for `lint: true` vs `lint: false`**:
   - **`lint: true`**: Reserved strictly for fast, pure static analysis of application source code (`.ts`, `.vue`, `.scss`, `.html`), Domain-Type-First validation, and O(1) structures.
   - **`lint: false`**: Heavy workspace scanning, environment and packaging checks (`validate_environment_engines`, `validate_package_scripts`), test hygiene and fragmentation, secret leak scanning, documentation linting (`preset=md`), and database/asset verifications.

---

## 9. Registering Host Extensions in `.auditor/audit.config.ts`

Host applications implementing custom rules in `scripts/auditors/<family>/validate_<name>.ts` register them dynamically in `.auditor/audit.config.ts`:

```typescript
import { defineAuditConfig } from '@francogp/auditor/config';
import { MyCompositeAuditor } from '../scripts/auditors/domain_data/validate_my_composite.ts';

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

When `auditor` or `npm run auditor` runs, `auditScanner.ts` automatically discovers registered extensions and executes them seamlessly within the main Box-Drawing summary table.

---

## 10. Dynamic GitIgnore Requirements Contract (`gitIgnoreEntries`)

Sub-auditors and extensions MUST NOT rely on hardcoded tool lists in the general framework. If a sub-auditor, tool, or CLI runner produces intermediate artifacts (e.g. `.mytoolcache`, `dist/`), it must declare its required patterns via `gitIgnoreEntries`:

```typescript
import { BaseAuditor, type GitIgnoreRequirement } from '@francogp/auditor';

export class MyCustomAuditor extends BaseAuditor<MyRuleId> {
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    {
      id: 'my-cache',
      pattern: '.my-cache/',
      samplePath: '.my-cache/cache.json',
      reason: 'Caché de herramienta personalizada'
    }
  ];

  constructor() {
    super({
      id: 'validate_my_custom',
      name: 'My Custom Validator',
      description: 'Valida reglas personalizadas',
      family: 'architecture',
      packageName: 'MiModulo',
      gitIgnoreEntries: MyCustomAuditor.gitIgnoreEntries
    });
  }
}
```

The orchestrator and `validate_audit_config` will:

1. Dynamically discover this requirement from your extension or subauditor without hardcoding.
2. Assert that `.gitignore` contains the pattern matching your entry (`severity: 'error'`).
3. Automatically append missing entries to `.gitignore` when running with `--fix` (`npm run auditor:fix` or `auditor fix`).

---

## 11. Mandatory Hermetic Unit Testing

Every sub-auditor MUST have a companion unit test file in `tests/<suite_name>.test.ts` (or `tests/node/auditors/` for host extensions) adhering to:

1. **Negative Verification**: Asserts that clean code yields `0 errors` and `status: 'passed'`.
2. **RuleId Coverage**: Every declared rule ID has dedicated dirty snippet assertions.
3. **Zero Live Scanning**: Use `auditor.testScanFile(...)` followed by `await auditor.finishAudit()`, or initialize `BaseAuditor({ projectRoot: tempDir })`. Never run `auditor.execute()` on `process.cwd()`.

---

## 12. Mandatory Thematic Emoji Contract (`AuditorOptions.icon`)

Every sub-auditor (built-in framework suites and user host extensions alike) **MUST** declare a non-empty thematic emoji in `AuditorOptions.icon`:

```typescript
super({
  id: 'validate_combat_invariants',
  name: 'Combat Engine & Invariants Auditor',
  description: 'Invariantes de combate y bifurcación p1/p2',
  icon: '🛡️', // MANDATORY: thematic emoji representing the suite
  family: 'fsm',
  ruleIds: COMBAT_INVARIANTS_RULES,
  packageName: 'Combate',
  ruleDescriptions: COMBAT_INVARIANTS_DESCRIPTIONS
});
```

- **Strict Instantiation Validation**: If `icon` is omitted, `undefined`, or whitespace-only, `validateAuditorOptions` throws an explicit, loud runtime `Error: Auditor [<id>] must define a mandatory thematic icon/emoji`.
- **Zero Fallback Compromise**: Core suites and host extensions are prohibited from relying on generic cogs (`⚙️`) or generic folders (`📁`). Every suite author chooses a meaningful visual symbol matching their domain (e.g. ⚔️, 🛡️, 🎒, 🔴, 🔤, 💾, 📊).
- **Scanner Propagation**: The streaming runner and terminal tables render this icon directly on progress lines and finding breakdowns.

---

## 13. Transparent Skip Reporting Contract (`markSkipped`, `status: 'skipped'`)

When an auditor must be bypassed (e.g. due to environmental guards, configuration flags, or fast presets), it **MUST NOT** pretend to have passed (`status: 'passed'`) with a green checkmark `✅`. Doing so creates cognitive friction and conceals skipped checks.

Instead, sub-auditors call `this.markSkipped(reason)`:

```typescript
if (isSkippedByEnvironment()) {
  this.markSkipped('Omitido por variable de entorno AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS=1');
  return;
}
```

- **Contract Transition**: Sets `result.status = 'skipped'`, updates `result.metrics['Estado'] = 'OMITIDO ⏭️'`, and records the skip justification.
- **Console Stream**: Displays `⏭️  SKIP` in cyan with the suite's thematic icon and skip reason.
- **Summary Accounting**: The Box-Drawing summary table and total footer clearly reflect skipped suites: `(1 Omitida ⏭️)` rather than masking them as passed.

---

## 14. Anti-Abuse Protection for `constants.exemptGlobs`

When configuring path-based constant exceptions, host projects configure `constants.exemptGlobs`:

```typescript
constants: {
  exemptGlobs: [
    'scripts/maintenance/**',
    'src/data/seed/**'
  ]
}
```

---

## 15. Introspection & Canonical DTO Contract (`toManifest()`, `AuditorManifestDTO`)

Every sub-auditor and host extension inherits from `BaseAuditor` and provides the typed `toManifest(): AuditorManifestDTO` method:

```typescript
export interface AuditorManifestDTO {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly icon: string;
  readonly description: string; // <= 60 characters
  readonly capabilities: AuditorCapabilities;
  readonly rules: Readonly<Record<string, string>>;
  readonly configKey?: string;
}
```

### Constraints

1. **Concise Descriptions (Zero Text Walls)**: `description` must not exceed 60 characters and must contain zero newlines.
2. **Dynamic Exposure**: The CLI inspects all suites dynamically via `node --experimental-strip-types src/cli/audit_full.ts --list --json` (or `auditor --list --json`) and `--info=<suiteId>` without hardcoding.

- **Strict Specificity Guard**: Broad wildcards matching entire repositories or primary source trees (`**/*`, `*`, `src/**`, `src/*`) are strictly rejected with an explicit validation error, preventing evasion of the Named Constants Mandate.
- **Safe Scope**: Use specific maintenance scripts, seed files, or test generator catalogs where inline numbers are strictly non-semantic tabular data.

---

## 16. Hierarchical Architecture & Sub-Auditor Composition

The auditor framework follows a 3-tier hierarchical structure:

```mermaid
graph TD
  M["Auditor Maestro (Orquestador Global)"] --> O["Auditores Oficiales"]
  M --> E["Extensiones de Auditores (Proyectos Host)"]
  O --> SO["Sub-Auditores Oficiales (Comparten recursos/contexto)"]
  E --> SE["Sub-Auditores de Extensiones (Comparten recursos/contexto)"]

  style M fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc
  style O fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#f8fafc
  style E fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#f8fafc
  style SO fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#f8fafc
  style SE fill:#831843,stroke:#f472b6,stroke-width:2px,color:#f8fafc
```

### Key Principles for Authors

1. **Symmetric Class Inheritance**:
   Both official suites in `@francogp/auditor` and host project extensions in `scripts/auditors/` inherit from `BaseAuditor<TRuleId>` (or `FileScanAuditor<TRuleId>`). They share identical options, capabilities, and lifecycle methods without duplicate code.
2. **Sub-Auditors Share Resources**:
   When an auditor contains sub-auditors, it coordinates their execution and provides shared resources (e.g. parsed AST, loaded datasets, or external command results) so each sub-check doesn't repeat heavy filesystem or parsing operations.
3. **Atomic Console Reporting**:
   An auditor with sub-auditors MUST wait for all its sub-auditors to complete execution before emitting its progress step lines (`│  🔍 [X/Y] ...`). This prevents mixed line outputs across concurrent background workers.
4. **Mandatory Construction & Runtime Rule Registration Guard**:
   Every rule ID emitted via `this.addViolation` must be explicitly declared in `ruleDescriptions: Record<TRuleId, string>` passed to `super({...})`. Any violation for an undeclared rule throws a loud runtime error immediately.

---

## 17. Declarative Configuration File Requirements & Auto-Fix Contract

Sub-auditors and extensions that validate or depend on external tool configuration files (such as `eslint.config.js`, `.fallowrc.json`, `.stylelintrc.json`, `.htmlvalidate.json`, `.markdownlint.json`, or custom host configs) MUST NOT implement bespoke file writers or manual boilerplate checking.

Instead, declare configuration requirements declaratively via `AuditorConfigFileRequirement` and `configFiles`:

```typescript
import {
  BaseAuditor,
  type AuditorConfigFileRequirement
} from '@francogp/auditor';

export class MyToolAuditor extends BaseAuditor<MyToolRuleId> {
  public static readonly configFiles: readonly AuditorConfigFileRequirement[] = [
    {
      file: '.mytoolrc.json',
      content: () => JSON.stringify({ version: 1, strict: true }, null, 2) + '\n',
      description: 'Canonical MyTool configuration',
      customMissingMessage: 'Missing .mytoolrc.json configuration file.'
    }
  ];

  constructor() {
    super({
      id: 'validate_my_tool',
      name: 'My Tool Validator',
      description: 'Valida contratos y configuración de MyTool',
      icon: '🔧',
      family: 'architecture',
      packageName: 'MyTool',
      ruleIds: MY_TOOL_RULES,
      configKey: 'tools.myTool',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      configFiles: MyToolAuditor.configFiles,
      ruleDescriptions: MY_TOOL_DESCRIPTIONS
    });
  }

  public override async runAudit(): Promise<void> {
    // 1. Automatically verifies config existence and creates default files if in --fix mode:
    const missingConfigs = await this.verifyAndFixConfigFiles();
    for (const missing of missingConfigs) {
      this.addViolation({
        ruleId: 'my-tool-missing-config',
        severity: 'error',
        file: missing.file,
        message: missing.message
      });
    }

    // 2. Or programmatically ensure a specific config file if needed:
    // const result = await this.ensureConfigFile(MyToolAuditor.configFiles[0]);
  }
}
```

### Core Architecture

1. **Dynamic Registration**: `BaseAuditor` registers all declared `configFiles` into `ConfigFileRegistry` automatically during instantiation.
2. **Auto-Repair Protocol (`--fix`)**: When executed with `auditor fix` (`this.isFixActive()`), `verifyAndFixConfigFiles()` writes the canonical default content atomically to disk and avoids logging violations.
3. **Extension Support**: Extensions registered via `defineAuditorExtension({ configFiles: [...] })` also register requirements dynamically without modifying framework internals.

---

## 18. Mandatory Constructor Metadata Contract (Zero Bypass / Zero Optional Defaults)

Under the v5 architecture, it is mathematically impossible to instantiate a sub-auditor or extension without supplying all canonical metadata in the constructor:

| Option | Type | Constraint | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Canonical ID | Unique identifier across the orchestrator (`validate_<name>`). |
| `name` | `string` | Non-empty | Formal human-readable name of the suite. |
| `description` | `string` | `<= 60` chars | Concise Spanish explanation of what the suite verifies. |
| `family` | `AuditFamily` | Strict enum | One of `'architecture'`, `'domain_data'`, `'persistence'`, `'performance'`, `'security'`, `'documentation'` (or dynamic host extensions). |
| `packageName` | `string` | Non-empty | Technology scope prefix (`'ESLint'`, `'TypeScript'`, `'Config'`, `'Estilos'`, `'DOX'`). |
| `icon` | `string` | Thematic emoji | Mandatory visual emoji icon (`'🏛️'`, `'🔍'`, `'🎨'`). |
| `ruleIds` | `readonly TRuleId[]` | Exhaustive | Array of declared rule IDs. |
| `ruleDescriptions` | `Record<TRuleId, string>` | 100% of rules | Pure Spanish description (prefixed `${packageName}: ${desc}` must be `<= 50` chars). |
| `configKey` | `string` | Dotted path | Mandatory SSoT configuration key inspected by the dynamic gating engine. |
| `defaultConfig` | `Record<string, unknown>` | Valid object | Mandatory default object dynamically collected by `auditor fix` to scaffold `.auditor/audit.config.ts`. For all subsystems, `enabled: boolean` is mandatory. |
| `criticalConfig` | `AuditorCriticalConfig` | Valid object (can be `{}`) | Mandatory critical architectural baseline (`requiredMinimums`, `forbiddenOverrides`, `validate`, `repair`). Strictly additive; projects can add restrictions but cannot remove canonical minimums. |

If any of these fields are missing or invalid, `BaseAuditor` throws an immediate runtime `Error` during instantiation.

---

## 19. Dynamic Introspection, Auto-Registration & Dynamic Suite Gating

The master orchestrator does not maintain hardcoded lists of enabled suites. Every auditor dropped into `src/suites/` or declared as a host extension is discovered automatically:

1. **Dynamic Status Resolution**: `evaluateSuiteStatus(suiteId, config, declaredConfigKey)` evaluates the declared `configKey` against `.auditor/audit.config.ts`. If the value resolves to `false` or `'none'`, the suite is cleanly marked `⏭️  SKIP`.
2. **Dynamic Config Scaffolding (`auditor fix`)**: When generating `.auditor/audit.config.ts`, `collectConfigSectionsFromTasks` iterates over all discovered tasks, dynamically assembling their declared `defaultConfig` with zero hardcoding.

---

## 20. Post-Build Compiled Artifact Partitioning (`audit:build` / `preset=build`)

Suites that validate compiled distribution artifacts (such as bundle budgets, export maps, or TypeScript `.d.ts` declaration maps) declare:

```typescript
ruleCapabilities: createUniformRuleCapabilities(RULES, {
  fix: false,
  fixPriority: false,
  lint: false,
  md: false,
  ast: false,
  changedSince: false,
  heavy: false,
  requiresBuild: true,
  postRun: false
})
```

1. **Pre-Build Exclusion**: `npm run auditor` automatically filters out suites with `capabilities.requiresBuild === true` so pre-build development checks never fail due to missing `dist/` folders.
2. **Post-Build Chaining**: In `package.json`, the standard build script chains `auditor:build`:

   ```json
   "build": "npm run auditor && tsc -p tsconfig.build.json && npm run auditor:build"
   ```

   Executing `npm run auditor:build` isolates and evaluates only compiled artifact suites against the fresh `dist/` output.

---

## 21. Mandatory Dynamic Testing Conformance & 5-Point Unit Test Contract

Every official sub-auditor in `@francogp/auditor` and every extension created in host projects (`scripts/auditors/`) MUST have a dedicated Vitest unit test. The test runner dynamically discovers all declared tasks and verifies conformance via `auditorContractConformance.ts`.

### The 5-Point Testing Contract

1. **Construction & Metadata Integrity**:
   Verify that the sub-auditor instantiates cleanly and satisfies all mandatory metadata requirements:

   ```typescript
   import { validateAuditorConstruction } from '@francogp/auditor';

   it('conforms to construction metadata contract and exposes manifest', () => {
     const auditor = new MyFeatureAuditor({ projectRoot: TEST_DIR });
     validateAuditorConstruction(auditor);
     const manifest = auditor.toManifest();
     expect(manifest.packageName).toBe('MiModulo');
     expect(manifest.configKey).toBe('paths.srcRoots');
   });
   ```

2. **Clean Path Verification**:
   Assert that when code has zero violations, the auditor produces zero errors and passes:

   ```typescript
   expect(result.summary.errors).toBe(0);
   expect(result.summary.warnings).toBe(0);
   expect(result.status).toBe('passed');
   expect(result.findings.length).toBe(0);
   ```

3. **Violation Path Verification**:
   Assert that non-compliant code produces errors, a failed status, and structured error findings:

   ```typescript
   expect(result.summary.errors).toBeGreaterThan(0);
   expect(result.status).toBe('failed');
   expect(result.findings.some(f => f.ruleId === 'my-rule-id' && f.severity === 'error')).toBe(true);
   ```

4. **Warning Path Verification**:
   Assert that advisory issues produce warnings and warned status (`severity === 'warning'`, `status === 'warned'`).
5. **100% of Declared Rule IDs Tested**:
   Every rule ID declared in `ruleIds` must be evaluated and covered in unit tests.

### Whole-Workspace Dynamic Conformance in 2 Lines

Host projects can verify all their custom extension sub-auditors dynamically by creating `tests/node/auditors/conformance.test.ts`:

```typescript
import { describe } from 'vitest';
import { runAuditorContractConformanceTests } from '@francogp/auditor';

describe('All Auditors Dynamic Conformance', () => {
  runAuditorContractConformanceTests();
});
```

---

## 22. Dynamic Package Script Contract & Collision Prevention (`PackageScriptRegistry`)

Every sub-auditor and host extension has a mandatory execution contract (`scripts`) defining how it is invoked via CLI and package scripts:

### 1. Automatic Derivation by Convention (`BaseAuditor`)

Sub-auditors and extensions extending `BaseAuditor` do not need to write manual script definitions. The base class automatically derives canonical script requirements by convention:

- **Script Name**: `audit:<short-id>` (e.g. `validate_my_feature` -> `audit:my-feature`).
- **Command**: `auditor task=<id>` (e.g. `auditor task=validate_my_feature`).
- **Description**: Derived directly from the auditor's `description`.
- **Category**: Derived directly from the auditor's `family`.

### 2. Custom Aliases & Flags (`AuditorOptions.scripts`)

If a sub-auditor or extension requires custom aliases or specialized multi-flag commands, they can be declared explicitly:

```typescript
import { BaseAuditor, type AuditorPackageScriptRequirement } from '@francogp/auditor';

export class MyFeatureAuditor extends BaseAuditor<MyFeatureRuleId> {
  public static readonly scripts: readonly AuditorPackageScriptRequirement[] = [
    {
      name: 'audit:my-feature:fast',
      command: 'auditor task=validate_my_feature fast=true',
      description: 'Fast check for my feature violations',
      category: 'architecture'
    }
  ];

  constructor(options: MyFeatureAuditorOptions = {}) {
    super({
      // ...
      scripts: MyFeatureAuditor.scripts,
      // ...
    });
  }
}
```

### 3. Collision Prevention (`[COLISIÓN DE COMANDOS]`)

All scripts are registered into `PackageScriptRegistry`. If two sub-auditors or extensions declare the same command name with conflicting commands, the registry throws an immediate, loud error:

```text
[COLISIÓN DE COMANDOS] El comando de script 'auditor:my-feature' está duplicado entre 'validate_my_feature' ('auditor task=validate_my_feature') y 'otra_extension' ('auditor task=otra_extension'). Cada sub-auditor y extensión DEBE declarar nombres de comandos únicos en package.json. Cambia el nombre del comando para resolver la colisión.
```

### 4. Automated Non-Destructive Injection (`auditor fix`)

When running `auditor fix` (or `npm run auditor:fix`), `validate_audit_config` dynamically inspects the host's `package.json` against all registered scripts in `PackageScriptRegistry` and appends missing ones without modifying existing custom scripts.

---

## 23. Sub-Auditor & Extension Hygiene Governance (`validate_auditor_hygiene`)

All sub-auditors in `@francogp/auditor` and host project extensions (`scripts/auditors/`) are strictly evaluated by `validate_auditor_hygiene`. To guarantee performance, cross-platform stability, and architectural cleanliness, all sub-auditors and extensions MUST follow these 12 invariants:

1. **Zero Manual `package.json` Reading (`auditor-manual-package-json`)**:
   - ❌ **Prohibited**: `fs.readFileSync(path.join(root, 'package.json'))` + `JSON.parse`.
   - ✅ **Canonical**: `getPackageJson(projectRoot)`.

2. **Zero Handcrafted Vue SFC Block Regexes (`auditor-manual-vue-sfc-regex`)**:
   - ❌ **Prohibited**: `/<template[\s\S]*<\/template>/` or manual tag slicing.
   - ✅ **Canonical**: `parseVueSfc(content)` from `@francogp/auditor`.

3. **Zero Isolated AST Creation (`auditor-manual-ts-ast`)**:
   - ❌ **Prohibited**: Direct calls to `ts.createSourceFile()` in scan loops.
   - ✅ **Canonical**: `this.context.getAst()`, `SharedAstContext`, or `AuditedDocument`.

4. **Zero Manual Path Normalization (`auditor-manual-path-normalize`)**:
   - ❌ **Prohibited**: `path.split('\\').join('/')` or `.replace(/\\/g, '/')`.
   - ✅ **Canonical**: `normalizePosixPath(filePath)` or `toPosixRelative(filePath, root)` from `@francogp/auditor`.

5. **Zero Direct Console Logging (`auditor-raw-console`)**:
   - ❌ **Prohibited**: `console.log()` or `console.warn()` inside sub-auditors.
   - ✅ **Canonical**: `this.addViolation()`, `this.context.setMetric()`, or `UnifiedTheme`.

6. **Zero Handcrafted Comment Stripping (`auditor-manual-comment-stripping`)**:
   - ❌ **Prohibited**: Fragile regexes like `code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')`.
   - ✅ **Canonical**: `stripComments()` and `stripCommentsAndStrings()` from `@francogp/auditor`.

7. **Zero Manual Delimiter/Brace Counting (`auditor-manual-brace-counting`)**:
   - ❌ **Prohibited**: Handcrafted loops counting `braceDepth` or `parenDepth`.
   - ✅ **Canonical**: `scanBalancedDelimiter()` or `isPositionInsideFunctionParams()` from `@francogp/auditor`.

8. **Zero Manual CWE-22 Path Containment (`auditor-manual-path-containment`)**:
   - ❌ **Prohibited**: Ad-hoc checks using `.startsWith('..')`.
   - ✅ **Canonical**: `isPathInside(candidatePath, parentPath)` or `isInsideRoot()`.

9. **Zero Handcrafted Recursive File Walkers (`auditor-manual-file-walker`)**:
   - ❌ **Prohibited**: Manual recursive `readdirSync` or custom traversing helpers.
   - ✅ **Canonical**: `this.context.collectFiles()` or `FileScanAuditor` automated file discovery.

10. **Zero Ad-Hoc Test File Predicates (`auditor-homebrew-predicates`)**:
    - ❌ **Prohibited**: Ad-hoc regexes like `/\.(test|spec)\.ts$/`.
    - ✅ **Canonical**: `isTestPath(filePath)` or `isTestFileForCodeAudit(filePath)`.

11. **Zero Manual Execution Timing (`auditor-manual-timing`)**:
    - ❌ **Prohibited**: Handcrafted `const start = performance.now()` with manual delta calculation.
    - ✅ **Canonical**: `this.runSubAuditorSync(ruleId, () => ...)` or `await this.runSubAuditor(ruleId, async () => ...)`.

12. **Zero Hardcoded Paths or Configuration Candidates (`auditor-hardcoded-config`)**:
    - ❌ **Prohibited**: Hardcoded arrays of candidate files (e.g. `['visuals.ts', 'constants.ts']`), local directory ignores, or fallback path lists in sub-auditors or extensions.
    - ✅ **Canonical**: Dynamic resolution from `config.<section>`, `getAuditConfig()`, and `options.exemptPaths` / `isPathExempt`.
