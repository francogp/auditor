/**
 * tests/script_command_extractors.test.ts
 *
 * Hermetic unit tests for AST and syntax-aware script command extractors.
 */

import { describe, it, expect } from 'vitest';
import {
  extractCommandsFromShell,
  extractCommandsFromYaml,
  extractCommandsFromDockerfile,
  extractCommandsFromPowerShell,
  extractCommandsFromTypeScript,
  extractScriptCommands,
  inspectCommandTokens
} from '../src/core/scriptCommandExtractors.ts';
import type { ExtractedCommand } from '../src/core/npmCommandUtils.ts';

describe('scriptCommandExtractors', () => {
  describe('extractCommandsFromShell', () => {
    it('extracts commands from simple shell scripts and unwraps sudo', () => {
      const code = [
        '#!/bin/bash',
        'npm run build',
        'sudo npm install -g npm@latest',
        'npm ci',
        'npx vitest run'
      ].join('\n');

      const commands = extractCommandsFromShell(code);
      expect(commands).toHaveLength(4);
      expect(commands[0]).toEqual({
        lineNum: 2,
        rawText: 'npm run build',
        type: 'npm-run',
        target: 'build'
      });
      expect(commands[1]).toEqual({
        lineNum: 3,
        rawText: 'sudo npm install -g npm@latest',
        type: 'npm-direct',
        target: 'install'
      });
      expect(commands[2]?.type).toBe('npm-direct');
      expect(commands[2]?.target).toBe('ci');
      expect(commands[3]?.type).toBe('npx');
      expect(commands[3]?.target).toBe('vitest');
    });

    it('extracts nested commands from if statements and pipelines', () => {
      const code = [
        'if true; then',
        '  npm ci && npm run test | tee out.txt',
        'fi'
      ].join('\n');

      const commands = extractCommandsFromShell(code);
      expect(commands.some(c => c.target === 'ci')).toBe(true);
      expect(commands.some(c => c.target === 'test' && c.type === 'npm-run')).toBe(true);
    });

    it('extracts subshell and command substitution expressions', () => {
      const code = 'OUT=$(npm run build); BACK=`npx eslint .`; (npm test)';
      const commands = extractCommandsFromShell(code);
      expect(commands.some(c => c.target === 'build' && c.type === 'npm-run')).toBe(true);
      expect(commands.some(c => c.target === 'eslint' && c.type === 'npx')).toBe(true);
      expect(commands.some(c => c.target === 'test' && c.type === 'npm-direct')).toBe(true);
    });

    it('ignores echo and loop variables', () => {
      const code = [
        'echo "npm run fake"',
        'for bin in node npm npx; do',
        '  echo "$bin"',
        'done'
      ].join('\n');

      const commands = extractCommandsFromShell(code);
      expect(commands).toHaveLength(0);
    });
  });

  describe('extractCommandsFromYaml', () => {
    it('extracts commands from GitHub Actions run: blocks and ignores name: keys', () => {
      const yaml = [
        'name: Build & Test',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Update npm to latest version',
        '        run: npm install -g npm@latest',
        '      - name: Execute test runner',
        '        run: |',
        '          echo "Starting tests"',
        '          npm ci',
        '          npm run test'
      ].join('\n');

      const commands = extractCommandsFromYaml(yaml);
      expect(commands.some(c => c.target === 'install')).toBe(true);
      expect(commands.some(c => c.target === 'ci')).toBe(true);
      expect(commands.some(c => c.target === 'test' && c.type === 'npm-run')).toBe(true);
      // Ensure "npm to" from step name was completely ignored
      expect(commands.some(c => c.target === 'to')).toBe(false);
    });
  });

  describe('extractCommandsFromDockerfile', () => {
    it('extracts commands from RUN instructions in shell form and JSON exec form', () => {
      const dockerfile = [
        'FROM node:26-alpine',
        'WORKDIR /app',
        'RUN npm ci \\',
        '    && npm run build',
        'RUN ["npx", "vitest", "run"]',
        'RUN echo "Done!"'
      ].join('\n');

      const commands = extractCommandsFromDockerfile(dockerfile);
      expect(commands.some(c => c.target === 'ci')).toBe(true);
      expect(commands.some(c => c.target === 'build' && c.type === 'npm-run')).toBe(true);
      expect(commands.some(c => c.target === 'vitest' && c.type === 'npx')).toBe(true);
    });

    it('extracts commands from RUN heredoc blocks', () => {
      const dockerfile = [
        'FROM node:26-alpine',
        'RUN <<EOF',
        'npm ci',
        'npm run build',
        'EOF'
      ].join('\n');

      const commands = extractCommandsFromDockerfile(dockerfile);
      expect(commands.some(c => c.target === 'ci')).toBe(true);
      expect(commands.some(c => c.target === 'build')).toBe(true);
    });
  });

  describe('extractCommandsFromPowerShell', () => {
    it('extracts commands and ignores Write-Host, Write-Error, comments, and strings', () => {
      const ps = [
        '# This is a comment with npm run fake',
        '<# Multiline comment',
        'npm test',
        '#>',
        'Write-Host "npm a la última versión"',
        'Write-Error "npm instalado"',
        '$var = "npm run test"',
        'npm install -g npm@latest',
        'npm ci',
        'npm run env:post-setup'
      ].join('\n');

      const commands = extractCommandsFromPowerShell(ps);
      expect(commands).toHaveLength(3);
      expect(commands[0]?.target).toBe('install');
      expect(commands[1]?.target).toBe('ci');
      expect(commands[2]?.target).toBe('env:post-setup');
    });

    it('handles Windows batch files (.bat, .cmd)', () => {
      const bat = [
        'REM comment with npm run fake',
        ':: another comment',
        'echo npm run something',
        '@echo off',
        'call npm ci',
        'npm run build'
      ].join('\n');

      const commands = extractCommandsFromPowerShell(bat, '.bat');
      expect(commands.some(c => c.target === 'ci')).toBe(true);
      expect(commands.some(c => c.target === 'build')).toBe(true);
    });
  });

  describe('extractCommandsFromTypeScript', () => {
    it('extracts process runner calls and CLI help/error messages while ignoring placeholders and non-log methods', () => {
      const code = [
        "import { execSync, spawnSync } from 'node:child_process';",
        "execSync('npm run build');",
        "spawnSync('npx', ['vitest', 'run']);",
        "console.log('npm run test');",
        "console.log('USO: npm run <comando>');",
        "throw new Error('Please run npm run setup');",
        "if (line.includes('npm notice')) {}"
      ].join('\n');

      const commands = extractCommandsFromTypeScript(code, 'scripts/run.ts');
      expect(commands).toHaveLength(4);
      expect(commands[0]?.target).toBe('build');
      expect(commands[0]?.type).toBe('npm-run');
      expect(commands[1]?.target).toBe('vitest');
      expect(commands[1]?.type).toBe('npx');
      expect(commands[2]?.target).toBe('test');
      expect(commands[2]?.type).toBe('npm-run');
      expect(commands[3]?.target).toBe('setup');
      expect(commands[3]?.type).toBe('npm-run');
      // <comando> placeholder is ignored
      expect(commands.some(c => c.target === '<comando>')).toBe(false);
    });
  });

  describe('extractScriptCommands dispatcher', () => {
    it('dispatches according to file extension and path', () => {
      const sh = extractScriptCommands('npm run test', 'deploy.sh');
      expect(sh[0]?.target).toBe('test');

      const ps = extractScriptCommands('npm run build', 'setup.ps1');
      expect(ps[0]?.target).toBe('build');

      const yml = extractScriptCommands('steps:\n  - run: npm ci', '.github/workflows/ci.yml');
      expect(yml[0]?.target).toBe('ci');

      const df = extractScriptCommands('RUN npm ci', 'Dockerfile');
      expect(df[0]?.target).toBe('ci');
    });
  });

  describe('inspectCommandTokens', () => {
    it('handles pnpm dlx and yarn dlx', () => {
      const out: ExtractedCommand[] = [];
      inspectCommandTokens('pnpm', ['dlx', 'vitest'], 1, 'pnpm dlx vitest', out);
      expect(out).toHaveLength(1);
      expect(out[0]?.type).toBe('npx');
      expect(out[0]?.target).toBe('vitest');
    });

    it('handles flags like --prefix and --workspace', () => {
      const out: ExtractedCommand[] = [];
      inspectCommandTokens('npm', ['--prefix', './app', 'run', 'build'], 1, 'npm --prefix ./app run build', out);
      expect(out).toHaveLength(1);
      expect(out[0]?.type).toBe('npm-run');
      expect(out[0]?.target).toBe('build');
    });
  });
});
