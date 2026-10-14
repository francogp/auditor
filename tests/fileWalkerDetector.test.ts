import { describe, it, expect } from 'vitest';
import { fileWalkerDetector } from '../src/analyzers/homebrew/detectors/fileWalkerDetector.ts';
import { type HomebrewInspectionContext } from '../src/analyzers/homebrew/homebrewTypes.ts';

function createContext(content: string, filePath = 'src/suites/testSuite.ts'): HomebrewInspectionContext {
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

describe('fileWalkerDetector', () => {
  it('exposes correct detector metadata and rule id', () => {
    expect(fileWalkerDetector.id).toBe('file-walker');
    expect(fileWalkerDetector.ruleId).toBe('auditor-manual-file-walker');
    expect(fileWalkerDetector.ruleDescription).toBe('Recorrido recursivo manual de dirs');
  });

  it('detects recursive readdirSync calls', () => {
    const code = 'const files = fs.readdirSync(dir, { recursive: true });';
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('auditor-manual-file-walker');
    expect(findings[0]!.message).toContain('readdirSync');
  });

  it('detects custom recursive directory walker definitions', () => {
    const code = 'function walkDirectory(dir: string): string[] { return []; }';
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('auditor-manual-file-walker');
  });

  it('detects walk functions with directory parameters', () => {
    const code = 'private walk(currentDir: string): void {}';
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('auditor-manual-file-walker');
  });

  it('ignores canonical collectFiles and collectRepositoryFiles', () => {
    const code = [
      'const files = this.context.collectFiles(roots, new Set([".vue"]));',
      'const repoFiles = collectRepositoryFiles(fullRoot, projectRoot, ignores);',
      'await this.scanFilesSinglePass(files, handlers);'
    ].join('\n');
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(0);
  });

  it('ignores PostCSS and AST node walking methods', () => {
    const code = [
      'root.walkDecls((decl) => {',
      '  parsed.walk((node) => {});',
      '  node.walkRules((rule) => {});',
      '});'
    ].join('\n');
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(0);
  });

  it('respects walker-ok escape hatch comments', () => {
    const code = 'function walkDirectory(dir: string) { // walker-ok: Allowed specialized check';
    const findings = fileWalkerDetector.detect(createContext(code));
    expect(findings).toHaveLength(0);
  });
});
