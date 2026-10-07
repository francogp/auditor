/**
 * packages/auditor/tests/validate_agents_config_mandate.test.ts
 *
 * Dedicated unit test suite for AgentsConfigMandateAuditor:
 * - Clean path: AGENTS.md with all mandatory architecture contracts passes with 0 errors and 'passed' status.
 * - Negative paths: Missing config mandate, missing backward-compat mandate, or missing fake-pass mandate reports corresponding rule.
 * - Missing file: Project missing AGENTS.md reports errors for all declared mandate rules.
 * - Auto-fix: Fix mode injects canonical mandate snippets under ## Local Contracts and modernizes outdated ones.
 * - Bilingual: Validates Spanish vs English modes and repairs cross-language mandates in-place.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AgentsConfigMandateAuditor,
  AGENTS_CONFIG_MANDATE_RULES,
  CANONICAL_MANDATE_SNIPPET_EN,
  CANONICAL_BACKWARD_COMPAT_SNIPPET_EN,
  CANONICAL_FAKE_PASS_SNIPPET_EN,
  containsConfigAntiTamperingMandate,
  containsBackwardCompatMandate,
  containsFakePassMandate
} from '../src/suites/documentation/validate_agents_config_mandate.ts';

function createValidAgentsMd(extraContract = ''): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
${CANONICAL_MANDATE_SNIPPET_EN}
${CANONICAL_BACKWARD_COMPAT_SNIPPET_EN}
${CANONICAL_FAKE_PASS_SNIPPET_EN}
${extraContract}

## Work Guidance

- Follow clean code practices.

## Verification

- Run test: npm test

## Child DOX Index

- _This directory contains isolated modules with no subdirectories._
`;
}

function createMissingMandatesAgentsMd(): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
- **Strict Node 26 Execution**: Native execution only.

## Work Guidance

- Follow clean code practices.

## Verification

- Run test: npm test

## Child DOX Index

- _This directory contains isolated modules with no subdirectories._
`;
}

function createOutdatedMandatesAgentsMd(): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
- **Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation**: Developers and AI agents are strictly prohibited from disabling, turning off, altering, or modifying auditor configurations (\`.auditor/audit.config.ts\`, \`eslint.config.js\`, \`.stylelintrc.json\`, \`.fallowrc.json\`) when encountering errors or warnings without consulting and obtaining explicit prior authorization from the human programmer.
- **Backward-Compatible Code**: Shims should generally be avoided.
- **Suppressing Rules**: Rules should not be silenced.

## Work Guidance

- Follow clean code practices.
`;
}

describe('AgentsConfigMandateAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_mandate_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  it('exposes declared rule IDs and manifest metadata correctly', () => {
    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    expect(auditor.ruleIds).toEqual(AGENTS_CONFIG_MANDATE_RULES);
    const manifest = auditor.toManifest();
    expect(manifest.id).toBe('validate_agents_config_mandate');
    expect(manifest.family).toBe('documentation');
    expect(manifest.rules['agents-missing-config-mandate']).toBeDefined();
    expect(manifest.rules['agents-missing-backward-compat-mandate']).toBeDefined();
    expect(manifest.rules['agents-missing-fake-pass-mandate']).toBeDefined();
  });

  it('detects anti-tampering mandate across Spanish and English variations', () => {
    expect(
      containsConfigAntiTamperingMandate(
        'Jamás se deben apagar o prender configuraciones del auditor sin consultar antes al programador, justificando siempre pros y contras con una explicación técnica.'
      )
    ).toBe(true);

    expect(
      containsConfigAntiTamperingMandate(
        'Strictly prohibited from disabling configuration files of the auditor without consulting the human programmer, providing an explanation and justifying pros and cons.'
      )
    ).toBe(true);

    expect(
      containsConfigAntiTamperingMandate(
        'Normal local contracts without any mention of auditor config or consulting developers.'
      )
    ).toBe(false);
  });

  it('detects backward-compatible prohibition mandate across Spanish and English variations', () => {
    expect(
      containsBackwardCompatMandate(
        'Writing backward-compatible shims or deprecated alias suites is strictly prohibited. Outdated consumers must fail loudly with throw new Error.'
      )
    ).toBe(true);

    expect(
      containsBackwardCompatMandate(
        'Escribir shims retrocompatibles o código legado está estrictamente prohibido. Debe fallar ruidosamente con código de salida 1.'
      )
    ).toBe(true);

    expect(
      containsBackwardCompatMandate(
        'We support backwards compatibility whenever possible to avoid breaking callers.'
      )
    ).toBe(false);
  });

  it('detects fake pass prohibition mandate across Spanish and English variations', () => {
    expect(
      containsFakePassMandate(
        'AI agents are categorically prohibited from suppressing or silencing rules for a fake pass. Zero-tolerance for gross misconduct.'
      )
    ).toBe(true);

    expect(
      containsFakePassMandate(
        'Está terminantemente prohibido suprimir o silenciar reglas para lograr un pase falso. Cero tolerancia y falta grave.'
      )
    ).toBe(true);

    expect(
      containsFakePassMandate(
        'Standard audit procedures allow warnings when ratchets permit.'
      )
    ).toBe(false);
  });

  it('passes clean verification with 0 errors when all mandates are present', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createValidAgentsMd(), 'utf8');

    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('fails with errors when all mandates are absent', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createMissingMandatesAgentsMd(), 'utf8');

    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(3);
    expect(result.status).toBe('failed');
    expect(result.findings.some(v => v.ruleId === 'agents-missing-config-mandate')).toBe(true);
    expect(result.findings.some(v => v.ruleId === 'agents-missing-backward-compat-mandate')).toBe(true);
    expect(result.findings.some(v => v.ruleId === 'agents-missing-fake-pass-mandate')).toBe(true);
  });

  it('fails with agents-missing-backward-compat-mandate when only backward-compat is missing', async () => {
    const content = `# Purpose\n\n## Local Contracts\n\n${CANONICAL_MANDATE_SNIPPET_EN}\n${CANONICAL_FAKE_PASS_SNIPPET_EN}\n`;
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), content, 'utf8');

    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('agents-missing-backward-compat-mandate');
  });

  it('fails with agents-missing-fake-pass-mandate when only fake-pass is missing', async () => {
    const content = `# Purpose\n\n## Local Contracts\n\n${CANONICAL_MANDATE_SNIPPET_EN}\n${CANONICAL_BACKWARD_COMPAT_SNIPPET_EN}\n`;
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), content, 'utf8');

    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('agents-missing-fake-pass-mandate');
  });

  it('fails with all mandate errors when root AGENTS.md does not exist', async () => {
    const auditor = new AgentsConfigMandateAuditor(scratchDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(3);
    expect(result.status).toBe('failed');
    expect(result.findings.map(f => f.ruleId).sort()).toEqual([...AGENTS_CONFIG_MANDATE_RULES].sort());
  });

  it('auto-repairs missing mandates when running in fix mode', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createMissingMandatesAgentsMd(), 'utf8');

    const fixAuditor = new AgentsConfigMandateAuditor(scratchDir, { fix: true });
    await fixAuditor.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation');
    expect(updatedContent).toContain('Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate');
    expect(updatedContent).toContain('Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate');

    // Subsequent audit on repaired file should pass cleanly
    const verifyAuditor = new AgentsConfigMandateAuditor(scratchDir);
    const verifyResult = await verifyAuditor.execute();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('auto-repairs outdated mandates in fix mode replacing in place', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createOutdatedMandatesAgentsMd(), 'utf8');

    const fixAuditor = new AgentsConfigMandateAuditor(scratchDir, { fix: true });
    await fixAuditor.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('trade-offs, pros, and cons');
    expect(updatedContent).toContain('Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate');
    expect(updatedContent).toContain('Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate');

    // Subsequent audit on repaired file should pass cleanly
    const verifyAuditor = new AgentsConfigMandateAuditor(scratchDir);
    const verifyResult = await verifyAuditor.execute();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('supports Spanish language configuration for validation and auto-repair', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createMissingMandatesAgentsMd(), 'utf8');

    // Run fix in Spanish mode
    const fixAuditorEs = new AgentsConfigMandateAuditor(scratchDir, { fix: true, language: 'es' });
    await fixAuditorEs.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('Prohibición de Modificar o Desactivar Configuraciones Sin Consulta Previa al Programador');
    expect(updatedContent).toContain('Prohibición Absoluta de Código Retrocompatible y Mandato de Fallo Ruidoso');
    expect(updatedContent).toContain('Prohibición Absoluta de Suprimir, Silenciar, Anular o Eludir Reglas de Auditoría y Mandato de Cero Tolerancia a Pases Falsos');

    // Verification in Spanish mode passes cleanly
    const verifyEs = new AgentsConfigMandateAuditor(scratchDir, { language: 'es' });
    const resultEs = await verifyEs.execute();
    expect(resultEs.summary.errors).toBe(0);
    expect(resultEs.status).toBe('passed');

    // But verification in English mode fails for all 3 mandates
    const verifyEn = new AgentsConfigMandateAuditor(scratchDir, { language: 'en' });
    const resultEn = await verifyEn.execute();
    expect(resultEn.summary.errors).toBe(3);

    // Running fix in English mode updates all mandates to English
    const fixAuditorEn = new AgentsConfigMandateAuditor(scratchDir, { fix: true, language: 'en' });
    await fixAuditorEn.execute();

    const finalContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(finalContent).toContain('Prohibition on Modifying or Disabling Configurations Without Prior Programmer Consultation');
    expect(finalContent).toContain('Absolute Prohibition on Backward-Compatible Code & Loud Failure Mandate');
    expect(finalContent).toContain('Absolute Prohibition on Suppressing, Silencing, Nullifying, or Bypassing Audit Rules & Zero-Tolerance Fake Pass Mandate');
    expect(finalContent).not.toContain('Prohibición de Modificar o Desactivar');

    const verifyAuditorEn = new AgentsConfigMandateAuditor(scratchDir, { language: 'en' });
    const finalVerify = await verifyAuditorEn.execute();
    expect(finalVerify.summary.errors).toBe(0);
  });
});
