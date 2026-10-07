/**
 * packages/auditor/tests/validate_documentation_language.test.ts
 *
 * Dedicated unit test suite for DocumentationLanguageAuditor:
 * - Manifest & rule IDs verification ('docs-unauthorized-language', 'docs-missing-language-mandate').
 * - Clean path: English markdown and valid AGENTS.md pass cleanly under 'en' mode.
 * - Violation: Spanish markdown flags 'docs-unauthorized-language'.
 * - Clean path in 'es' mode: Spanish markdown passes cleanly under 'es' mode.
 * - Root AGENTS.md mandate verification: Missing or outdated mandate flags 'docs-missing-language-mandate'.
 * - Auto-fix: Injects or modernizes canonical language mandate in AGENTS.md.
 * - Exemption: Exempted paths/globs are ignored.
 * - Noise filtering: Code blocks, inline code, shell commands are stripped without false positives.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DocumentationLanguageAuditor,
  DOCUMENTATION_LANGUAGE_RULES,
  CANONICAL_LANGUAGE_MANDATE_SNIPPET_EN,
  CANONICAL_LANGUAGE_MANDATE_SNIPPET_ES,
  containsLanguageMandate,
  extractProseParagraphs,
  isLanguageExemptPath
} from '../src/suites/documentation/validate_documentation_language.ts';

function createValidAgentsMd(extraContract = ''): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
${CANONICAL_LANGUAGE_MANDATE_SNIPPET_EN}
${extraContract}

## Work Guidance

- Follow clean code practices.

## Verification

- Run test: npm test

## Child DOX Index

- _This directory contains isolated modules with no subdirectories._
`;
}

function createMissingMandateAgentsMd(): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.

## Work Guidance

- Follow clean code practices.

## Verification

- Run test: npm test

## Child DOX Index

- _This directory contains isolated modules with no subdirectories._
`;
}

function createOutdatedMandateAgentsMd(): string {
  return `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
- **Universal English Documentation Default Mandate & Language Governance (\`validate_documentation_language\`)**: Across \`@francogp/auditor\` and all consumer host applications governed by it, if config.documentation?.language is not explicitly declared in \`.auditor/audit.config.ts\`, the default documentation language is STRICTLY AND UNCONDITIONALLY English (\`'en'\`).

## Work Guidance

- Follow clean code practices.
`;
}

describe('DocumentationLanguageAuditor', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch/test_lang_' + crypto.randomUUID());

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createValidAgentsMd(), 'utf8');
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  it('exposes declared rule IDs and manifest metadata correctly', () => {
    const auditor = new DocumentationLanguageAuditor(scratchDir);
    expect(auditor.ruleIds).toEqual(DOCUMENTATION_LANGUAGE_RULES);
    const manifest = auditor.toManifest();
    expect(manifest.id).toBe('validate_documentation_language');
    expect(manifest.family).toBe('documentation');
    expect(manifest.rules['docs-unauthorized-language']).toBeDefined();
    expect(manifest.rules['docs-missing-language-mandate']).toBeDefined();
    expect(manifest.capabilities.fix).toBe(true);
  });

  it('detects language governance mandate across English and Spanish snippets', () => {
    expect(containsLanguageMandate(CANONICAL_LANGUAGE_MANDATE_SNIPPET_EN, 'en')).toBe(true);
    expect(containsLanguageMandate(CANONICAL_LANGUAGE_MANDATE_SNIPPET_ES, 'es')).toBe(true);
    expect(containsLanguageMandate('Normal contract without mention of documentation language', 'en')).toBe(false);
    expect(containsLanguageMandate(CANONICAL_LANGUAGE_MANDATE_SNIPPET_ES, 'en')).toBe(false);
  });

  it('extracts prose paragraphs while skipping code blocks, tables, and inline code', () => {
    const md = `---
title: Guide
---

# Architecture Overview

This is an architectural overview document written in English explaining all module boundaries.
Here is an inline snippet: \`const a = 10;\` and a link [documentation](https://example.com).

\`\`\`typescript
// Este comentario en español dentro de código debe ignorarse completamente
function test() { return true; }
\`\`\`

| Header 1 | Header 2 |
| --- | --- |
| Col 1 | Col 2 |

<!-- HTML comment here -->

Another English paragraph describing the execution model and lifecycle hooks.
`;

    const paragraphs = extractProseParagraphs(md);
    expect(paragraphs.length).toBe(3);
    expect(paragraphs[0]?.text).toBe('Architecture Overview');
    expect(paragraphs[1]?.text).toContain('architectural overview document written in English');
    expect(paragraphs[1]?.text).not.toContain('const a = 10');
    expect(paragraphs[2]?.text).toContain('Another English paragraph describing the execution model');
  });

  it('correctly matches language exemption paths and globs', () => {
    const exemptions = ['docs/es/**', 'legacy/*.md', 'guia-usuario.md'];
    expect(isLanguageExemptPath('docs/es/tutorial.md', exemptions)).toBe(true);
    expect(isLanguageExemptPath('docs/en/tutorial.md', exemptions)).toBe(false);
    expect(isLanguageExemptPath('guia-usuario.md', exemptions)).toBe(true);
  });

  it('passes clean verification with 0 errors on English markdown and valid AGENTS.md', async () => {
    const englishMd = `# Overview

This module provides the core static analysis engine and verification framework.
All components follow strict object-oriented design and modular architecture.
Developers must consult architectural guidelines before introducing new dependencies.
`;
    fs.writeFileSync(path.join(scratchDir, 'README.md'), englishMd, 'utf8');

    const auditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('flags docs-unauthorized-language on Spanish markdown when configured for English', async () => {
    const spanishMd = `# Visión General

Este módulo proporciona el motor central de análisis estático y verificación del framework.
Todos los componentes siguen un diseño orientado a objetos estricto y arquitectura modular.
Los desarrolladores deben consultar las directrices antes de introducir dependencias.
`;
    fs.writeFileSync(path.join(scratchDir, 'README.md'), spanishMd, 'utf8');

    const auditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.status).toBe('failed');
    const finding = result.findings.find(f => f.ruleId === 'docs-unauthorized-language');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.file).toBe('README.md');
  });

  it('passes clean verification on Spanish markdown and Spanish AGENTS.md when configured for Spanish', async () => {
    const spanishAgentsMd = `# Propósito

Índice de documentación y límites arquitectónicos.

## Ownership

Ingenieros de Arquitectura.

## Local Contracts

${CANONICAL_LANGUAGE_MANDATE_SNIPPET_ES}

## Work Guidance

- Seguir buenas prácticas.

## Verification

- Ejecutar tests: npm test

## Child DOX Index

- _Sin subdirectorios._
`;
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), spanishAgentsMd, 'utf8');

    const spanishMd = `# Visión General

Este módulo proporciona el motor central de análisis estático y verificación del framework.
Todos los componentes siguen un diseño orientado a objetos estricto y arquitectura modular.
Los desarrolladores deben consultar las directrices antes de introducir dependencias.
`;
    fs.writeFileSync(path.join(scratchDir, 'README.md'), spanishMd, 'utf8');

    const auditor = new DocumentationLanguageAuditor(scratchDir, { language: 'es' });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('ignores exempted files even if written in an unauthorized language', async () => {
    const spanishMd = `# Visión General

Este módulo proporciona el motor central de análisis estático y verificación del framework.
Todos los componentes siguen un diseño orientado a objetos estricto y arquitectura modular.
`;
    fs.writeFileSync(path.join(scratchDir, 'SPANISH_GUIDE.md'), spanishMd, 'utf8');

    const auditor = new DocumentationLanguageAuditor(scratchDir, {
      language: 'en',
      exemptions: ['SPANISH_GUIDE.md']
    });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('fails with docs-missing-language-mandate when mandate is absent from AGENTS.md', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createMissingMandateAgentsMd(), 'utf8');

    const auditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.status).toBe('failed');
    const violation = result.findings.find(v => v.ruleId === 'docs-missing-language-mandate');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.file).toBe('AGENTS.md');
  });

  it('fails with docs-missing-language-mandate when root AGENTS.md does not exist', async () => {
    fs.rmSync(path.join(scratchDir, 'AGENTS.md'));

    const auditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.findings[0]?.ruleId).toBe('docs-missing-language-mandate');
  });

  it('auto-repairs missing language mandate in fix mode', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createMissingMandateAgentsMd(), 'utf8');

    const fixAuditor = new DocumentationLanguageAuditor(scratchDir, { fix: true, language: 'en' });
    await fixAuditor.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('Universal English Documentation Default Mandate & Language Governance');
    expect(updatedContent).toContain('learning_proposal.md');
    expect(updatedContent).toContain('Whenever in doubt');

    // Subsequent audit should pass cleanly
    const verifyAuditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const verifyResult = await verifyAuditor.execute();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('auto-repairs outdated language mandate in fix mode replacing in place', async () => {
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), createOutdatedMandateAgentsMd(), 'utf8');

    const fixAuditor = new DocumentationLanguageAuditor(scratchDir, { fix: true, language: 'en' });
    await fixAuditor.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('learning_proposal.md');
    expect(updatedContent).toContain('Whenever in doubt');

    // Ensure it replaced in place without duplicate contract lines
    const matches = updatedContent.match(/validate_documentation_language/g);
    expect(matches?.length).toBe(1);

    // Subsequent audit should pass cleanly
    const verifyAuditor = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const verifyResult = await verifyAuditor.execute();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('supports Spanish language configuration for validation and auto-repair', async () => {
    const spanishAgentsWithoutMandate = `# Propósito

Índice de documentación y límites arquitectónicos del motor.

## Ownership

Ingenieros de Arquitectura.

## Local Contracts

- **Agnóstico del Dominio**: Cero acoplamiento a facturación de servicios o dominios específicos.

## Work Guidance

- Seguir buenas prácticas de desarrollo y estándares de arquitectura.

## Verification

- Ejecutar tests: npm test

## Child DOX Index

- _Sin subdirectorios._
`;
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), spanishAgentsWithoutMandate, 'utf8');

    // Run fix in Spanish mode
    const fixAuditorEs = new DocumentationLanguageAuditor(scratchDir, { fix: true, language: 'es' });
    await fixAuditorEs.execute();

    const updatedContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(updatedContent).toContain('Mandato de Idioma de Documentación en Español y Gobernanza de Lenguaje');
    expect(updatedContent).toContain('learning_proposal.md');

    // Verification in Spanish mode passes cleanly
    const verifyEs = new DocumentationLanguageAuditor(scratchDir, { language: 'es' });
    const resultEs = await verifyEs.execute();
    expect(resultEs.summary.errors).toBe(0);
    expect(resultEs.status).toBe('passed');
  });

  it('replaces Spanish language mandate with English when switching to English mode in fix mode', async () => {
    const englishAgentsWithSpanishMandate = `# Purpose

Core engine documentation and architectural boundary index.

## Ownership

Architecture & Tooling Engineers.

## Local Contracts

- **Domain Agnostic**: Zero coupling to utility billing or specific host business domains.
${CANONICAL_LANGUAGE_MANDATE_SNIPPET_ES}

## Work Guidance

- Follow clean code practices.

## Verification

- Run test: npm test

## Child DOX Index

- _This directory contains isolated modules with no subdirectories._
`;
    fs.writeFileSync(path.join(scratchDir, 'AGENTS.md'), englishAgentsWithSpanishMandate, 'utf8');

    // Running fix in English mode replaces the Spanish mandate with English
    const fixAuditorEn = new DocumentationLanguageAuditor(scratchDir, { fix: true, language: 'en' });
    await fixAuditorEn.execute();

    const finalContent = fs.readFileSync(path.join(scratchDir, 'AGENTS.md'), 'utf8');
    expect(finalContent).toContain('Universal English Documentation Default Mandate & Language Governance');
    expect(finalContent).not.toContain('Mandato de Idioma de Documentación en Español');

    const verifyEn = new DocumentationLanguageAuditor(scratchDir, { language: 'en' });
    const finalResult = await verifyEn.execute();
    expect(finalResult.summary.errors).toBe(0);
    expect(finalResult.status).toBe('passed');
  });
});
