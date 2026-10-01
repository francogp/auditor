/**
 * packages/auditor/tests/validate_html_validate.test.ts
 *
 * Dedicated unit test suite for HtmlValidateAuditor & parseHtmlValidateResults:
 * - Detects HTML5 / markup violations and elevates to error severity (html-validate-issue)
 * - Verifies JSON output parsing from stdout with noise
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HtmlValidateAuditor,
  HTML_VALIDATE_RULES,
  parseHtmlValidateResults
} from '../src/suites/architecture/validate_html_validate.ts';

describe('HtmlValidateAuditor & parseHtmlValidateResults', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in HTML_VALIDATE_RULES', () => {
      expect(HTML_VALIDATE_RULES).toContain('html-validate-issue');
      expect(HTML_VALIDATE_RULES).toHaveLength(1);
    });

    it('initializes with correct id and family', () => {
      const auditor = new HtmlValidateAuditor();
      expect(auditor.id).toBe('validate_html_validate');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('parseHtmlValidateResults', () => {
    it('parses raw array of html-validate file reports into AuditFindings with severity error', () => {
      const rawReports = [
        {
          filePath: '/home/project/src/components/MyFrame.vue',
          messages: [
            {
              ruleId: 'no-deprecated-attr',
              severity: 2,
              message: 'Attribute "frameborder" is deprecated on <iframe> element',
              line: 12,
              column: 5
            },
            {
              ruleId: 'deprecated',
              severity: 2,
              message: '<center> is deprecated: use CSS instead',
              line: 20,
              column: 3
            }
          ]
        }
      ];

      const findings = parseHtmlValidateResults(rawReports, '/home/project');
      expect(findings).toHaveLength(2);
      expect(findings[0]!.ruleId).toBe('html-validate-issue');
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.file).toBe('src/components/MyFrame.vue');
      expect(findings[0]!.line).toBe(12);
      expect(findings[0]!.context).toBe('no-deprecated-attr');
      expect(findings[0]!.message).toContain('frameborder');

      expect(findings[1]!.ruleId).toBe('html-validate-issue');
      expect(findings[1]!.context).toBe('deprecated');
      expect(findings[1]!.message).toContain('<center>');
    });

    it('parses JSON string output with npm notice and node warning noise', () => {
      const jsonStr = `
        npm notice run facturacion2@2.0.0 npx
        (node:1234) ExperimentalWarning: CommonJS is not recommended
        [
          {
            "filePath": "src/App.vue",
            "messages": [
              {
                "ruleId": "element-required-attributes",
                "severity": 2,
                "message": "<iframe> is missing required title attribute",
                "line": 15,
                "column": 4
              }
            ]
          }
        ]
      `;

      const findings = parseHtmlValidateResults(jsonStr, '/home/project');
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('html-validate-issue');
      expect(findings[0]!.context).toBe('element-required-attributes');
    });

    it('returns empty findings on clean output', () => {
      const findings = parseHtmlValidateResults('[]');
      expect(findings).toHaveLength(0);
    });

    it('handles malformed JSON gracefully without throwing', () => {
      const findings = parseHtmlValidateResults('invalid json string [not json]');
      expect(findings).toHaveLength(0);
    });
  });

  class CleanHtmlValidateAuditor extends HtmlValidateAuditor {
    public override async runAudit(): Promise<void> {
      this.filesScannedCount = 1;
      this.context.setMetric('html_violations', 0);
    }
  }

  describe('Clean execution', () => {
    it('runs on clean results and reports zero errors', async () => {
      const auditor = new CleanHtmlValidateAuditor();
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});
