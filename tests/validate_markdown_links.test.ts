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

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { collectDocumentationFiles } from '../src/core/auditorBase.ts';
import {
  MarkdownLinkAuditor,
  MARKDOWN_LINK_RULES,
  checkMarkdownLinksInContent,
  clearGitIgnoredPathsCache,
  collectMarkdownFiles
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
      const auditor = new MarkdownLinkAuditor({ roots: [], projectRoot: PROJECT_ROOT });
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

      const broken = brokenLinks.find((b) => b.ruleId === 'markdown-broken-relative-link');
      expect(broken).toBeDefined();
      expect(broken?.error).toContain('Target path does not exist on disk');
    });

    it('suggests relocated path when a broken link targets a file that exists elsewhere', async () => {
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-relocated-'));
      try {
        await fs.mkdir(path.join(sandbox, 'src/core'), { recursive: true });
        await fs.mkdir(path.join(sandbox, 'docs'), { recursive: true });
        // File exists in src/core/service.ts
        await fs.writeFile(
          path.join(sandbox, 'src/core/service.ts'),
          'export const service = true;\n',
          'utf-8'
        );

        // Markdown in docs links to ./service.ts (which doesn't exist in docs/)
        const mdPath = path.join(sandbox, 'docs/guide.md');
        const markdown = `# Guide\nSee [Service](./service.ts).\n`;
        await fs.writeFile(mdPath, markdown, 'utf-8');

        const { brokenLinks } = checkMarkdownLinksInContent(markdown, mdPath, sandbox);
        const broken = brokenLinks.find((b) => b.ruleId === 'markdown-broken-relative-link');
        expect(broken).toBeDefined();
        expect(broken?.error).toContain('was apparently located at: "src/core/service.ts"');
        expect(broken?.error).toContain(
          'Check if the link should be updated to: "../src/core/service.ts"'
        );
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });

    it('detects absolute paths and file:// URLs (markdown-absolute-path)', () => {
      const markdown = `
        # Prohibited links
        See [Root Path](/src/index.ts) or [File URL](file:///etc/hosts).
        Also standalone text with file:///home/user/test.txt should fail.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const absoluteViolations = brokenLinks.filter((b) => b.ruleId === 'markdown-absolute-path');
      expect(absoluteViolations.length).toBeGreaterThanOrEqual(2);
      expect(absoluteViolations.some((b) => b.rawUrl.includes('/src/index.ts'))).toBe(true);
      expect(absoluteViolations.some((b) => b.rawUrl.includes('file:///'))).toBe(true);
    });

    it('detects stale legacy environment references (markdown-stale-environment-path)', () => {
      const markdown = `
        # Legacy Path Warning
        Refer to [Old Repo](https://github.com/test/repo) or path /home/franco/projects.
        Also check /Users/Franco/documents in plaintext.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const staleViolations = brokenLinks.filter(
        (b) => b.ruleId === 'markdown-stale-environment-path'
      );
      expect(staleViolations.length).toBeGreaterThanOrEqual(1);
      expect(staleViolations.some((b) => b.error.includes('Stale legacy environment'))).toBe(true);
    });

    it('detects links targeting git-ignored files (markdown-gitignored-target)', () => {
      const markdown = `
        # Gitignored Resource
        Do not link to temporary files: [Ephemeral Artifact](../scratch/audits/temp.json).
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const gitignored = brokenLinks.find((b) => b.ruleId === 'markdown-gitignored-target');
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

      const pkgViolations = brokenLinks.filter(
        (b) => b.ruleId === 'markdown-broken-workspace-package'
      );
      expect(pkgViolations.length).toBeGreaterThanOrEqual(1);
      expect(pkgViolations.some((b) => b.error.includes('non-existent workspace package'))).toBe(
        true
      );
    });

    it('allows workspace package mentions in migration context', () => {
      const markdown = `
        ## Guía de Migración
        Elimina packages/auditor de los workspaces locales.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks } = checkMarkdownLinksInContent(markdown, dummyFilePath, PROJECT_ROOT);

      const pkgViolations = brokenLinks.filter(
        (b) => b.ruleId === 'markdown-broken-workspace-package'
      );
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

    it('ignores markdown link and image syntax inside inline code spans', () => {
      const markdown = `
        # Syntax Guide
        Reference the image as \`![alt](./nonexistent-settings.png)\` in documentation.
        Also syntax like \`[text](./nonexistent-link.md)\` should be ignored.
        However real link [real](./real.md) is parsed.
      `;
      const dummyFilePath = path.join(PROJECT_ROOT, 'docs/test.md');
      const { brokenLinks, linksChecked } = checkMarkdownLinksInContent(
        markdown,
        dummyFilePath,
        PROJECT_ROOT
      );

      // Only [real](./real.md) is checked as an active link
      expect(linksChecked).toBe(1);
      expect(brokenLinks).toHaveLength(1);
      expect(brokenLinks[0]?.rawUrl).toBe('./real.md');
    });

    it('detects violations and fails with status failed and severity error', async () => {
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-fail-'));
      try {
        await fs.writeFile(
          path.join(sandbox, 'README.md'),
          '# Broken\n[Missing](./does_not_exist.md)\n',
          'utf-8'
        );
        const auditor = new MarkdownLinkAuditor({ roots: [], projectRoot: sandbox });
        const result = await auditor.audit();
        expect(result.status).toBe('failed');
        expect(result.summary.errors).toBeGreaterThan(0);
        expect(result.findings.some((f) => f.severity === 'error')).toBe(true);
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });

    it('audits AGENTS.md files and detects broken links within them', async () => {
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-agents-'));
      try {
        await fs.writeFile(
          path.join(sandbox, 'AGENTS.md'),
          '# Purpose\n\n[Broken Link](./non_existent_module.ts)\n',
          'utf-8'
        );
        const auditor = new MarkdownLinkAuditor({ roots: [], projectRoot: sandbox });
        const result = await auditor.audit();
        expect(result.status).toBe('failed');
        expect(
          result.findings.some(
            (f) => f.ruleId === 'markdown-broken-relative-link' && f.file?.includes('AGENTS.md')
          )
        ).toBe(true);
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });
  });

  describe('Clean Execution', () => {
    it('executes cleanly when scan roots contain no broken links and reports 0 errors', async () => {
      // Hermetic sandbox: a valid relative link must not leak live repository defects into the test
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-clean-'));
      try {
        await fs.writeFile(path.join(sandbox, 'guide.md'), '# Guide\n', 'utf-8');
        await fs.writeFile(
          path.join(sandbox, 'README.md'),
          '# Readme\n\nSee [guide](./guide.md).\n',
          'utf-8'
        );
        const auditor = new MarkdownLinkAuditor({ roots: [], projectRoot: sandbox });
        const result = await auditor.audit();

        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });

    it('skips gitignored markdown files inside scanned codeRoots and root files (e.g. supabase/docker/README.md)', async () => {
      const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'md-links-gitignore-'));
      try {
        await fs.writeFile(
          path.join(sandbox, '.gitignore'),
          ['supabase/docker/', 'supabase/generated/', 'ignored-root.md', '.agents/', 'docs/'].join(
            '\n'
          ),
          'utf-8'
        );
        await fs.mkdir(path.join(sandbox, 'supabase/docker'), { recursive: true });
        await fs.mkdir(path.join(sandbox, '.agents/skills/local'), { recursive: true });
        await fs.mkdir(path.join(sandbox, 'docs/public'), { recursive: true });
        await fs.mkdir(path.join(sandbox, 'docs/secret'), { recursive: true });
        await fs.writeFile(
          path.join(sandbox, 'supabase/docker/README.md'),
          '# Cloned Stack\nBroken link [Missing](./does_not_exist.md) and packages/missing_pkg.\n',
          'utf-8'
        );
        await fs.writeFile(
          path.join(sandbox, 'ignored-root.md'),
          '# Local Scratch Doc\nBroken link [Missing](./does_not_exist.md).\n',
          'utf-8'
        );
        await fs.writeFile(
          path.join(sandbox, '.agents/skills/local/SKILL.md'),
          '# Local Skill\nSee [Guide](../../../guide.md).\n',
          'utf-8'
        );
        await fs.writeFile(path.join(sandbox, 'docs/public/spec.md'), '# Public Spec\n', 'utf-8');
        await fs.writeFile(path.join(sandbox, 'docs/secret/draft.md'), '# Secret Draft\n', 'utf-8');
        await fs.writeFile(path.join(sandbox, 'guide.md'), '# Guide\n', 'utf-8');
        await fs.writeFile(
          path.join(sandbox, 'supabase/README.md'),
          '# Supabase\nSee [Guide](../guide.md).\n',
          'utf-8'
        );

        expect(collectMarkdownFiles('ignored-root.md', sandbox)).toEqual([]);
        expect(collectMarkdownFiles('guide.md', sandbox)).toEqual([path.join(sandbox, 'guide.md')]);
        // Single-segment unignore (`.agents` default) rescues `.agents/skills/local/SKILL.md`
        expect(collectMarkdownFiles('.agents', sandbox)).toEqual([
          path.join(sandbox, '.agents/skills/local/SKILL.md')
        ]);
        // Multi-segment unignore (`docs/public`) rescues `docs/public/spec.md` while keeping `docs/secret/draft.md` pruned
        expect(
          collectDocumentationFiles(sandbox, sandbox, [], new Set(['.md']), ['docs/public'])
        ).toContain(path.join(sandbox, 'docs/public/spec.md'));
        expect(
          collectDocumentationFiles(sandbox, sandbox, [], new Set(['.md']), ['docs/public'])
        ).not.toContain(path.join(sandbox, 'docs/secret/draft.md'));

        const auditor = new MarkdownLinkAuditor({
          roots: ['.', 'ignored-root.md', 'supabase'],
          projectRoot: sandbox
        });
        const result = await auditor.audit();

        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        await fs.rm(sandbox, { recursive: true, force: true });
      }
    });
  });
});
