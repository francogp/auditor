/**
 * tests/node/auditors/validate_markdown_code_references.test.ts
 *
 * Comprehensive unit test suite for MarkdownCodeReferencesAuditor.
 * Verifies detection of broken source references, unregistered npm scripts,
 * hardcoded runtime versions, broken skill references, and file casing mismatches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  MarkdownCodeReferencesAuditor,
  MARKDOWN_CODE_REFERENCE_RULES,
  resolveMarkdownScanDirectories
} from '../src/suites/documentation/validate_markdown_code_references.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('MarkdownCodeReferencesAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-code-ref-test-'));

    // Create a mock package.json with defined scripts
    const mockPackageJson = {
      name: 'test-project',
      scripts: {
        audit: 'node scripts/audit.ts',
        lint: 'node scripts/lint.ts',
        test: 'vitest'
      }
    };
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(mockPackageJson, null, 2),
      'utf-8'
    );
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('instantiates with correct metadata conforming to auditor', () => {
    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    expect(auditor.id).toBe('validate_markdown_code_references');
    expect(auditor.family).toBe('documentation');
    expect(auditor.name).toBe('Markdown Code References Validator');
    expect(auditor.description.length).toBeLessThanOrEqual(60);
    expect(auditor.ruleIds).toEqual(MARKDOWN_CODE_REFERENCE_RULES);
  });

  it('detects broken source code references (src/..., scripts/..., supabase/..., tests/...)', async () => {
    const mdContent = `
# Documentation
See the implementation in \`src/nonexistent/broken_file.ts\`.
Also check \`supabase/nonexistent_table.sql\`.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(2);
    const brokenRefs = result.findings.filter(f => f.ruleId === 'markdown-broken-source-ref');
    expect(brokenRefs.length).toBe(2);
    expect(brokenRefs[0]?.context).toBe('src/nonexistent/broken_file.ts');
    expect(brokenRefs[1]?.context).toBe('supabase/nonexistent_table.sql');
  });

  it('detects broken workspace package references (packages/...)', async () => {
    const mdContent = `
# Architecture
See the standalone package in \`packages/auditor/src/index.ts\`.
Also check \`packages/legacy_pkg\`.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(2);
    const brokenRefs = result.findings.filter(f => f.ruleId === 'markdown-broken-source-ref');
    expect(brokenRefs.length).toBe(2);
    expect(brokenRefs[0]?.context).toBe('packages/auditor/src/index.ts');
    expect(brokenRefs[1]?.context).toBe('packages/legacy_pkg');
  });

  it('accepts valid existing source code references', async () => {
    await fs.mkdir(path.join(tempDir, 'src/data'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src/data/items.ts'), 'export const items = {};', 'utf-8');

    const mdContent = `
# Valid Documentation
Refer to \`src/data/items.ts\` or \`src/data/items\` for details.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    const brokenRefs = result.findings.filter(f => f.ruleId === 'markdown-broken-source-ref');
    expect(brokenRefs.length).toBe(0);
  });

  it('detects case mismatches on disk (Linux ext4 case sensitivity)', async () => {
    await fs.mkdir(path.join(tempDir, 'src/data'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src/data/items.ts'), 'export const items = {};', 'utf-8');

    const mdContent = `
# Casing Issue
Refer to \`src/data/Items.ts\` for details.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    const caseFindings = result.findings.filter(f => f.ruleId === 'markdown-case-mismatch');
    expect(caseFindings.length).toBe(1);
    expect(caseFindings[0]?.context).toBe('src/data/Items.ts');
  });

  it('detects case mismatches on local AGENTS.md bullet declarations', async () => {
    const sessionDir = path.join(tempDir, 'src/logic/billing/data');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'database.ts'), 'export class Database {}', 'utf-8');

    const agentsContent = `
# Purpose
- \`Database.ts\`: Local dictionary class
    `;
    await fs.writeFile(path.join(sessionDir, 'AGENTS.md'), agentsContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    const caseFindings = result.findings.filter(f => f.ruleId === 'markdown-case-mismatch');
    expect(caseFindings.length).toBe(1);
    expect(caseFindings[0]?.context).toBe('Database.ts');
  });

  it('detects broken skill references (@/<skill-name>)', async () => {
    await fs.mkdir(path.join(tempDir, '.agents/skills/clean-code'), { recursive: true });

    const mdContent = `
# Skill References
Valid: @/clean-code
Invalid: @/nonexistent-broken-skill
Path alias (ignored): @/components/Button.vue
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    const skillFindings = result.findings.filter(f => f.ruleId === 'markdown-broken-skill-ref');
    expect(skillFindings.length).toBe(1);
    expect(skillFindings[0]?.context).toBe('@/nonexistent-broken-skill');
  });

  it('ignores code paths inside fenced code blocks', async () => {
    const mdContent = `
# Tutorial with Code Snippets
Here is how you run a tool:
\`\`\`bash
fallow src/index.ts
\`\`\`
And in code:
\`\`\`typescript
import './src/nonexistent/sample.css';
\`\`\`
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    const brokenRefs = result.findings.filter(f => f.ruleId === 'markdown-broken-source-ref');
    expect(brokenRefs.length).toBe(0);
  });

  it('ignores wildcards, placeholders, and known abstract paths', async () => {
    const mdContent = `
# Abstract References
Check \`src/data/*\` or \`supabase/migrations/YYYYMMDD_test.sql\`.
Also \`supabase/migrations\` and \`scripts/.cache/\`.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    const brokenRefs = result.findings.filter(f => f.ruleId === 'markdown-broken-source-ref');
    expect(brokenRefs.length).toBe(0);
  });

  it('detects unregistered npm run commands', async () => {
    const mdContent = `
# Commands
Run \`npm run nonexistent-script\` to verify.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    const scriptFinding = result.findings.find(f => f.ruleId === 'markdown-unregistered-npm-script');
    expect(scriptFinding).toBeDefined();
    expect(scriptFinding?.context).toBe('npm run nonexistent-script');
    expect(scriptFinding?.message).toBe(
      'ERR! missing or relocated script: command "npm run nonexistent-script" is not registered in package.json.scripts'
    );
  });

  it('accepts registered npm run commands and trailing colon placeholders', async () => {
    const mdContent = `
# Valid Commands
Run \`npm run audit\` or \`npm run lint\`.
Example pattern: \`npm run audit:family:<name>\`.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    const scriptFindings = result.findings.filter(f => f.ruleId === 'markdown-unregistered-npm-script');
    expect(scriptFindings.length).toBe(0);
  });

  it('detects hardcoded runtime version assertions in markdown', async () => {
    const mdContent = `
# Prerequisites
- Node >= 26.9
- npm >= 12.0
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(2);
    const versionFindings = result.findings.filter(f => f.ruleId === 'markdown-hardcoded-runtime-version');
    expect(versionFindings.length).toBe(2);
  });

  it('passes completely with zero errors when documentation adheres to all rules', async () => {
    await fs.mkdir(path.join(tempDir, 'src/data'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src/data/items.ts'), 'export const items = {};', 'utf-8');
    await fs.mkdir(path.join(tempDir, '.agents/skills/clean-code'), { recursive: true });

    const mdContent = `
# Clean Documentation
Runtime versions are managed via package.json (\`engines\`) and \`.nvmrc\`.
Run \`npm run audit\` for validation.
Source code resides in \`src/data/items.ts\`.
Refer to @/clean-code.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('dynamically ignores gitignored paths like scratch/ and does not force their presence', async () => {
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'scratch/\n*.tmp\n', 'utf-8');

    const mdContent = `
# Documentation with Scratch References
The audit output is stored in \`scratch/audits/latest_audit.json\`.
Temporary artifacts are placed in \`scratch/bundle_stats.html\`.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('recognizes skills distributed with @francogp/auditor package and node_modules', async () => {
    // Simulate library distribution in node_modules/@francogp/auditor/skills
    await fs.mkdir(path.join(tempDir, 'node_modules/@francogp/auditor/skills/domain-type-first'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'node_modules/@francogp/auditor/skills/auditor'), { recursive: true });

    const mdContent = `
# Skill References from Framework
Refer to @/domain-type-first and @/auditor.
    `;
    await fs.writeFile(path.join(tempDir, 'README.md'), mdContent, 'utf-8');

    const auditor = new MarkdownCodeReferencesAuditor(['.'], tempDir);
    const result = await auditor.execute();

    const skillFindings = result.findings.filter(f => f.ruleId === 'markdown-broken-skill-ref');
    expect(skillFindings).toHaveLength(0);
    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('resolves markdown scan directories dynamically from config including codeRoots, demoRoots, dataRoots, and top-level markdown files', async () => {
    setAuditConfig(defineAuditConfig({
      name: 'Custom Markdown Roots Test',
      paths: {
        srcRoots: ['src'],
        codeRoots: ['src', 'scripts', 'database'],
        demoRoots: ['ui-demo'],
        dataRoots: ['src/data', 'data'],
        cliRoots: ['cli'],
        migrationsDir: 'database/migrations'
      },
      persistence: {
        engine: 'supabase',
        supabaseDir: 'supabase'
      }
    }), tempDir);

    await fs.writeFile(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n', 'utf-8');

    const dirs = resolveMarkdownScanDirectories(tempDir);
    expect(dirs).toContain('database');
    expect(dirs).toContain('ui-demo');
    expect(dirs).toContain('data');
    expect(dirs).toContain('cli');
    expect(dirs).toContain('database/migrations');
    expect(dirs).toContain('supabase');
    expect(dirs).toContain('CHANGELOG.md');
  });

  it('extracts top-level parent directories from nested testRoots and codeRoots without duplicating', async () => {
    setAuditConfig(defineAuditConfig({
      name: 'Nested Roots Test',
      paths: {
        testRoots: ['tests/unit', 'tests/node', 'tests/e2e'],
        codeRoots: ['packages/core', 'packages/cli']
      }
    }), tempDir);

    const dirs = resolveMarkdownScanDirectories(tempDir);
    expect(dirs).toContain('tests');
    expect(dirs).toContain('packages');
    expect(dirs).toContain('src');
    expect(dirs).toContain('docs');
  });
});

