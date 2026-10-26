import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import {
  discoverRecordKeyFindings,
  injectImportStatement,
  remediateRecordKeysInFile
} from '../src/core/refactor/domainRecordKeyRemediator.ts';
import { DomainRefactorEngine } from '../src/core/refactor/domainRefactorEngine.ts';

describe('DomainRefactorEngine - Record String Key Remediation', () => {
  it('discovers open Record<string, T> but ignores Record<string, any> and Record<string, unknown>', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-domain-test-'));
    const testFile = path.join(tempDir, 'testData.ts');

    const content = `
export interface ItemRegistry {
  items: Record<string, number>;
  entities: Record<PropertyKey, boolean>;
  openUnknown: Record<string, unknown>;
  openAny: Record<string, any>;
}
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    try {
      const findings = DomainRefactorEngine.discoverInFile(testFile);
      const recordFindings = findings.filter((f) => f.kind === 'record-string-key');

      expect(recordFindings.length).toBe(2);
      expect(recordFindings[0]?.originalSnippet).toBe('Record<string, number>');
      expect(recordFindings[0]?.suggestedReplacement).toBe('Record<DisplayText, number>');

      expect(recordFindings[1]?.originalSnippet).toBe('Record<PropertyKey, boolean>');
      expect(recordFindings[1]?.suggestedReplacement).toBe('Record<DisplayText, boolean>');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds plan and safely applies replacements with automatic DisplayText import injection', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-domain-test-'));
    const testFile = path.join(tempDir, 'catalog.ts');

    const content = `import { ref } from 'vue';

export interface Catalog {
  scores: Record<string, number>;
}
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    try {
      const findings = DomainRefactorEngine.discoverInFile(testFile);
      const plan = DomainRefactorEngine.buildDomainHygienePlan('test-plan', [testFile], findings);

      expect(plan.recordKeyReplacements?.length).toBe(1);
      expect(plan.recordKeyReplacements?.[0]?.replacementTypeRef).toBe(
        'Record<DisplayText, number>'
      );

      DomainRefactorEngine.applyPlan(tempDir, plan);

      const modified = fs.readFileSync(testFile, 'utf-8');
      expect(modified).toContain("import type { DisplayText } from '@francogp/auditor';");
      expect(modified).toContain('scores: Record<DisplayText, number>;');
      expect(modified).not.toContain('scores: Record<string, number>;');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('applies plan to Vue SFC <script setup> blocks seamlessly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-domain-test-'));
    const testFile = path.join(tempDir, 'Component.vue');

    const content = `<template>
  <div class="user-map"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const map = ref<Record<string, { id: number; name: string }>>({});
</script>

<style scoped>
.user-map { color: blue; }
</style>
`;
    fs.writeFileSync(testFile, content, 'utf-8');

    try {
      const findings = DomainRefactorEngine.discoverInFile(testFile);
      const plan = DomainRefactorEngine.buildDomainHygienePlan('vue-plan', [testFile], findings);

      DomainRefactorEngine.applyPlan(tempDir, plan);

      const modified = fs.readFileSync(testFile, 'utf-8');
      expect(modified).toContain("import type { DisplayText } from '@francogp/auditor';");
      expect(modified).toContain('Record<DisplayText, { id: number; name: string }>');
      expect(modified).toContain('<template>');
      expect(modified).toContain('<style scoped>');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('remediates record keys in file and injects import directly via domainRecordKeyRemediator', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-remediator-test-'));
    const testFile = path.join(tempDir, 'data.ts');
    const content = 'export const registry: Record<string, number> = {};';
    fs.writeFileSync(testFile, content, 'utf-8');

    try {
      const res = remediateRecordKeysInFile(testFile, tempDir);
      expect(res.changed).toBe(true);
      expect(res.replacementCount).toBe(1);

      const updated = fs.readFileSync(testFile, 'utf-8');
      expect(updated).toContain("import type { DisplayText } from '@francogp/auditor';");
      expect(updated).toContain('Record<DisplayText, number>');

      const findings = discoverRecordKeyFindings(testFile, updated);
      expect(findings.length).toBe(0);

      const injectedShebang = injectImportStatement(
        '#!/usr/bin/env node\nconsole.log(1);',
        'import x;',
        false
      );
      expect(injectedShebang.startsWith('#!/usr/bin/env node\nimport x;')).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
