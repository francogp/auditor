import { describe, it, expect } from 'vite-plus/test';

import { inefficientFileScanDetector } from '../src/analyzers/homebrew/detectors/inefficientFileScanDetector.ts';
import { type HomebrewInspectionContext } from '../src/analyzers/homebrew/homebrewTypes.ts';

function createContext(
  content: string,
  filePath = 'src/suites/testSuite.ts'
): HomebrewInspectionContext {
  const lines = content.split('\n');
  return {
    filePath,
    absolutePath: `/project/${filePath}`,
    content,
    lines,
    isExtension: false,
    isBuiltinSuite: true,
    isAnalyzer: false,
    projectRoot: '/project'
  };
}

describe('inefficientFileScanDetector', () => {
  it('exposes correct detector metadata and rule id', () => {
    expect(inefficientFileScanDetector.id).toBe('inefficient-file-scan');
    expect(inefficientFileScanDetector.ruleId).toBe('auditor-inefficient-file-scan');
    expect(inefficientFileScanDetector.ruleDescription).toBe('Inefficient file scanning');
  });

  it('detects nested rule loop over file iteration', () => {
    const code = [
      'for (const ruleId of MY_RULES) {',
      '  for (const filePath of filePaths) {',
      '    const content = fs.readFileSync(filePath, "utf-8");',
      '  }',
      '}'
    ].join('\n');

    const findings = inefficientFileScanDetector.detect(createContext(code));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('auditor-inefficient-file-scan');
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toContain('Nested loop of rule over files detected');
  });

  it('detects blind wildcards passed to external tools', () => {
    const code = ['const args = ["**/*.md", "--dot"];', 'executeNodeCli(binPath, args);'].join(
      '\n'
    );

    const findings = inefficientFileScanDetector.detect(createContext(code));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('auditor-inefficient-file-scan');
    expect(findings[0]!.line).toBe(1);
    expect(findings[0]!.message).toContain('Blind global wildcard');
  });

  it('passes cleanly when using scanFilesSinglePass or targetArgs', () => {
    const code = [
      'await this.scanFilesSinglePass(filePaths, [',
      '  { ruleId: "my-rule", scan: (file, content) => {} }',
      ']);',
      'const targetArgs = totalChars < 6000 ? relFiles : ["**/*.md", "--dot"];'
    ].join('\n');

    const findings = inefficientFileScanDetector.detect(createContext(code));
    expect(findings).toHaveLength(0);
  });
});
