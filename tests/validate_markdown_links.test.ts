/**
 * tests/validate_markdown_links.test.ts
 *
 * Dedicated unit test suite for MarkdownLinkAuditor & checkMarkdownLinksInContent:
 * - Detects broken relative links (markdown-broken-relative-link)
 * - Detects prohibited absolute paths and file:// URLs (markdown-absolute-path)
 * - Detects stale environment paths like /home/user or /Users/user (markdown-stale-environment-path)
 * - Detects links to git-ignored targets (markdown-gitignored-target)
 * - Verifies clean execution (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  MarkdownLinkAuditor,
  MARKDOWN_LINK_RULES,
  checkMarkdownLinksInContent,
  clearGitIgnoredPathsCache
} from '../src/suites/documentation/validate_markdown_links.ts';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('MarkdownLinkAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    clearGitIgnoredPathsCache();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    clearGitIgnoredPathsCache();
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(MARKDOWN_LINK_RULES).toContain('markdown-broken-relative-link');
      expect(MARKDOWN_LINK_RULES).toContain('markdown-absolute-path');
      expect(MARKDOWN_LINK_RULES).toContain('markdown-stale-environment-path');
      expect(MARKDOWN_LINK_RULES).toContain('markdown-gitignored-target');
      expect(MARKDOWN_LINK_RULES).toContain('markdown-broken-workspace-package');
    });

    it('initializes with correct id and family', () => {
      const auditor = new MarkdownLinkAuditor([], PROJECT_ROOT);
      expect(auditor.id).toBe('validate_markdown_links');
      expect(auditor.family).toBe('documentation');
      expect(auditor.ruleIds).toEqual(MARKDOWN_LINK_RULES);
    });
  });

  describe('Violation Detection', () => {
    it('detects broken relative links (markdown-broken-relative-link)', () => {
      const markdown = `
        # Documentation
        Check out [Missing Guide](./non_existent_file_12345.md) for details.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const broken = brokenLinks.find(b => b.ruleId === 'markdown-broken-relative-link');
      expect(broken).toBeDefined();
      expect(broken?.error).toContain('Target path does not exist on disk');
    });

    it('detects absolute paths and file:// URLs (markdown-absolute-path)', () => {
      const markdown = `
        # Prohibited links
        See [Root Path](/src/index.ts) or [File URL](file:///etc/hosts).
        Also standalone text with file:///home/user/test.txt should fail.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const absoluteViolations = brokenLinks.filter(b => b.ruleId === 'markdown-absolute-path');
      expect(absoluteViolations.length).toBeGreaterThanOrEqual(2);
      expect(absoluteViolations.some(b => b.rawUrl.includes('/src/index.ts'))).toBe(true);
      expect(absoluteViolations.some(b => b.rawUrl.includes('file:///'))).toBe(true);
    });

    it('detects stale legacy environment references (markdown-stale-environment-path)', () => {
      const markdown = `
        # Legacy Path Warning
        Refer to [Old Repo](https://github.com/test/repo) or path /home/franco/projects.
        Also check /Users/Franco/documents in plaintext.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const staleViolations = brokenLinks.filter(b => b.ruleId === 'markdown-stale-environment-path');
      expect(staleViolations.length).toBeGreaterThanOrEqual(1);
      expect(staleViolations.some(b => b.error.includes('Stale legacy environment'))).toBe(true);
    });

    it('detects links targeting git-ignored files (markdown-gitignored-target)', () => {
      const markdown = `
        # Gitignored Resource
        Do not link to temporary files: [Ephemeral Artifact](../scratch/audits/temp.json).
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const gitignored = brokenLinks.find(b => b.ruleId === 'markdown-gitignored-target');
      expect(gitignored).toBeDefined();
      expect(gitignored?.error).toContain('ignored by git (.gitignore)');
    });

    it('detects nonexistent workspace packages in text and inline code (markdown-broken-workspace-package)', () => {
      const markdown = `
        # Architecture
        Core auditor resides in the standalone package @fgp/auditor (packages/auditor/).
        Also check \`packages/nonexistent_subpkg\`.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const pkgViolations = brokenLinks.filter(b => b.ruleId === 'markdown-broken-workspace-package');
      expect(pkgViolations.length).toBeGreaterThanOrEqual(1);
      expect(pkgViolations.some(b => b.error.includes('workspace package inexistente'))).toBe(true);
    });

    it('allows workspace package mentions in migration context', () => {
      const markdown = `
        ## Guía de Migración
        Elimina packages/auditor de los workspaces locales.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const pkgViolations = brokenLinks.filter(b => b.ruleId === 'markdown-broken-workspace-package');
      expect(pkgViolations).toHaveLength(0);
    });

    it('ignores valid external links, in-page anchors, and fenced code blocks', () => {
      const markdown = `
        # Valid Links
        - External: [Documentation](https://nodejs.org)
        - Anchor: [Back to top](#valid-links)
        - Mail: [Contact](mailto:test@example.com)

        \`\`\`markdown
        [This is inside code block](./does_not_matter_if_missing.md)
        \`\`\`
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      expect(brokenLinks).toHaveLength(0);
    });
  });

  describe('Clean Execution', () => {
    it('executes cleanly when scan roots contain no broken links and reports 0 errors', async () => {
      // Hermetic sandbox: a valid relative link must not leak live repository defects into the test
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-clean-'));
      try {
        await fs.writeFile(path.join(sandbox, 'guide.md'), '# Guide\n', 'utf-8');
        await fs.writeFile(path.join(sandbox, 'README.md'), '# Readme\n\nSee [guide](./guide.md).\n', 'utf-8');
        const auditor = new MarkdownLinkAuditor([], sandbox);
        const result = await auditor.execute();

        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });
  });
});
