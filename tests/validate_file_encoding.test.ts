import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig, setAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateFileEncodingAuditor,
  FILE_ENCODING_RULES
} from '../src/suites/architecture/validate_file_encoding.ts';

describe('ValidateFileEncodingAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-encoding-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_file_encoding');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(FILE_ENCODING_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });

    it('populates coverage.exclude with config.encoding.exemptGlobs, exemptPaths and exemptFiles', () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'test-app',
          paths: {
            srcRoots: ['src'],
            codeRoots: ['src'],
            testRoots: ['tests'],
            scriptsRoots: ['scripts']
          },
          encoding: {
            exemptGlobs: ['database/backups/**'],
            exemptPaths: ['legacy/vendor'],
            exemptFiles: ['legacy/file.txt']
          }
        }),
        tmpDir
      );
      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const declaration = auditor.getCoverageRecorder().declaration;
      expect(declaration.exclude).toContain('database/backups/**');
      expect(declaration.exclude).toContain('legacy/vendor');
      expect(declaration.exclude).toContain('legacy/file.txt');
      resetAuditConfig();
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical clean UTF-8 text files', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        "export const message = 'Hola mundo';\n",
        'utf8'
      );
      fs.writeFileSync(path.join(srcDir, 'styles.scss'), '.hero { display: flex; }\n', 'utf8');
      fs.writeFileSync(
        path.join(srcDir, 'app.vue'),
        '<template><div>App</div></template>\n',
        'utf8'
      );

      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('UTF-8 BOM Detection and Auto-Fix', () => {
    it('detects UTF-8 BOM in .scss and .vue files and removes it in fix mode', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const scssFile = path.join(srcDir, 'broken.scss');
      const vueFile = path.join(srcDir, 'broken.vue');

      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const scssContent = Buffer.concat([bom, Buffer.from('.selector { color: red; }\n', 'utf8')]);
      const vueContent = Buffer.concat([
        bom,
        Buffer.from('<template><h1>Hi</h1></template>\n', 'utf8')
      ]);

      fs.writeFileSync(scssFile, scssContent);
      fs.writeFileSync(vueFile, vueContent);

      // Check mode
      const auditorCheck = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const checkResult = await auditorCheck.execute();

      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(2);
      expect(checkResult.findings).toHaveLength(2);
      expect(checkResult.findings[0]?.ruleId).toBe('file-encoding-unwanted-bom');
      expect(checkResult.findings[1]?.ruleId).toBe('file-encoding-unwanted-bom');

      // Fix mode
      const auditorFix = new ValidateFileEncodingAuditor({ fix: true }, tmpDir);
      const fixResult = await auditorFix.execute();

      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fixResult.findings).toHaveLength(0);

      // Verify files on disk have no BOM
      const fixedScssBuf = fs.readFileSync(scssFile);
      const fixedVueBuf = fs.readFileSync(vueFile);

      expect(fixedScssBuf[0]).not.toBe(0xef);
      expect(fixedScssBuf.toString('utf8')).toBe('.selector { color: red; }\n');
      expect(fixedVueBuf.toString('utf8')).toBe('<template><h1>Hi</h1></template>\n');
    });
  });

  describe('Non-UTF8 Transcoding and Auto-Fix', () => {
    it('detects UTF-16LE with BOM and transcodes cleanly to UTF-8 without BOM', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const targetFile = path.join(srcDir, 'config.ts');
      const utf16leBom = Buffer.from([0xff, 0xfe]);
      const textBuffer = Buffer.from('export const port = 3000;\n', 'utf16le');
      const fullBuffer = Buffer.concat([utf16leBom, textBuffer]);

      fs.writeFileSync(targetFile, fullBuffer);

      // Check mode
      const auditorCheck = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const checkResult = await auditorCheck.execute();

      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('file-encoding-invalid-charset');

      // Fix mode
      const auditorFix = new ValidateFileEncodingAuditor({ fix: true }, tmpDir);
      const fixResult = await auditorFix.execute();

      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fixResult.findings).toHaveLength(0);

      const fixedContent = fs.readFileSync(targetFile, 'utf8');
      expect(fixedContent).toBe('export const port = 3000;\n');
      const diskBuf = fs.readFileSync(targetFile);
      expect(diskBuf[0]).not.toBe(0xff);
      expect(diskBuf[0]).not.toBe(0xef);
    });

    it('detects UTF-16BE with BOM and transcodes cleanly to UTF-8', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const targetFile = path.join(srcDir, 'be.ts');
      const utf16beBom = Buffer.from([0xfe, 0xff]);
      // Encode "A\n" in UTF-16BE: 0x00, 0x41, 0x00, 0x0A
      const beBytes = Buffer.from([0x00, 0x41, 0x00, 0x0a]);
      const fullBuffer = Buffer.concat([utf16beBom, beBytes]);

      fs.writeFileSync(targetFile, fullBuffer);

      const auditorFix = new ValidateFileEncodingAuditor({ fix: true }, tmpDir);
      const fixResult = await auditorFix.execute();

      expect(fixResult.status).toBe('passed');
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('A\n');
    });

    it('detects Latin1 / Windows-1252 invalid UTF-8 bytes and transcodes them', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const targetFile = path.join(srcDir, 'legacy.txt');
      // In Latin1, 0xE9 is 'é', which is an invalid standalone byte in UTF-8
      const latin1Bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]); // "café\n"

      fs.writeFileSync(targetFile, latin1Bytes);

      const auditorCheck = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const checkResult = await auditorCheck.execute();

      expect(checkResult.status).toBe('failed');
      expect(checkResult.findings[0]?.ruleId).toBe('file-encoding-invalid-charset');

      const auditorFix = new ValidateFileEncodingAuditor({ fix: true }, tmpDir);
      const fixResult = await auditorFix.execute();

      expect(fixResult.status).toBe('passed');
      expect(fs.readFileSync(targetFile, 'utf8')).toBe('café\n');
    });

    it('detects mojibake corruption and reports file-encoding-mojibake-detected', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const mojibakeFile = path.join(srcDir, 'mojibake.ts');
      fs.writeFileSync(mojibakeFile, "export const name = 'cafÃ©';\n", 'utf8');

      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.summary.warnings).toBe(1);
      expect(result.findings.some((f) => f.ruleId === 'file-encoding-mojibake-detected')).toBe(
        true
      );
    });

    it('flags mojibake regardless of SQL -- mojibake-ok: comments (Zero-Ignore Mandate)', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const sqlFile = path.join(srcDir, '20260611120000_migrate_save_v3_ids.sql');
      fs.writeFileSync(
        sqlFile,
        "UPDATE items SET item_id = 'item_potion' WHERE item_id = 'PociÃ³n'; -- mojibake-ok: legacy save repair\n",
        'utf8'
      );

      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.summary.warnings).toBeGreaterThan(0);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('requires valid comment delimiter for mojibake-ok suppression', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const rawCode = path.join(srcDir, 'broken.ts');
      // mojibake-ok is inside literal string, not comment
      fs.writeFileSync(rawCode, "const msg = 'PociÃ³n with mojibake-ok: in string';\n", 'utf8');

      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.summary.warnings).toBe(1);
      expect(result.findings[0]?.ruleId).toBe('file-encoding-mojibake-detected');
    });
  });

  describe('Binary Files & Exemptions Safety', () => {
    it('ignores binary files and exempt globs without emitting false positives', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Binary file with arbitrary bytes
      const pngFile = path.join(srcDir, 'logo.png');
      fs.writeFileSync(
        pngFile,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
      );

      // Unknown extension file with null bytes
      const binFile = path.join(srcDir, 'sample.unknown');
      fs.writeFileSync(binFile, Buffer.from([0x01, 0x02, 0x00, 0x03, 0x00, 0x00, 0x05]));

      const auditor = new ValidateFileEncodingAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });
});
