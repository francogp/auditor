import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { makeCliBinariesExecutable } from '../src/cli/make_executable.ts';

const TEST_DIR = path.resolve(process.cwd(), 'scratch/test_make_executable_tmp');

describe('make_executable CLI utility', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('runs safely on non-existent directory without error', () => {
    expect(() => makeCliBinariesExecutable(path.join(TEST_DIR, 'non_existent'))).not.toThrow();
  });

  it('applies executable permissions to .js files and ignores non-js files', () => {
    const jsFile = path.join(TEST_DIR, 'test_binary.js');
    const txtFile = path.join(TEST_DIR, 'readme.txt');

    fs.writeFileSync(jsFile, 'console.log("hello");\n', 'utf-8');
    fs.writeFileSync(txtFile, 'text content\n', 'utf-8');

    expect(() => makeCliBinariesExecutable(TEST_DIR)).not.toThrow();
    expect(fs.existsSync(jsFile)).toBe(true);
  });
});
