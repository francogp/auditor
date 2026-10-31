import { describe, expect, it, beforeEach } from 'vite-plus/test';

import { HomebrewDetectorRegistry } from '../src/analyzers/homebrew/homebrewRegistry.ts';
import { BaseEntityRegistry, resetAllEntityRegistries } from '../src/core/baseRegistry.ts';
import { ConfigFileRegistry } from '../src/core/configFileRegistry.ts';
import { GitIgnoreRegistry, CORE_GITIGNORE_REQUIREMENTS } from '../src/core/gitIgnoreRegistry.ts';
import {
  PackageScriptRegistry,
  CORE_PACKAGE_SCRIPT_REQUIREMENTS
} from '../src/core/packageScriptRegistry.ts';

describe('Canonical Entity Registries SSoT & Isolation', () => {
  beforeEach(() => {
    resetAllEntityRegistries();
  });

  describe('1. BaseEntityRegistry Primitive', () => {
    it('manages items, keys, existence, and deletion deterministically', () => {
      interface MockItem {
        id: string;
        val: number;
      }
      const registry = new BaseEntityRegistry<MockItem>((item) => item.id);
      expect(registry.getAll()).toHaveLength(0);
      expect(registry.size).toBe(0);

      registry.register({ id: 'item-1', val: 10 });
      expect(registry.has('item-1')).toBe(true);
      expect(registry.get('item-1')?.val).toBe(10);
      expect(registry.size).toBe(1);

      registry.delete('item-1');
      expect(registry.has('item-1')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('executes onReset hook when instantiated and upon reset()', () => {
      interface MockItem {
        id: string;
      }
      const registry = new BaseEntityRegistry<MockItem>(
        (item) => item.id,
        (reg) => {
          reg.register({ id: 'initial-1' });
        }
      );

      expect(registry.getAll()).toHaveLength(1);
      expect(registry.get('initial-1')).toBeDefined();

      registry.register({ id: 'extra-1' });
      expect(registry.getAll()).toHaveLength(2);

      registry.reset();
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.get('initial-1')).toBeDefined();
      expect(registry.get('extra-1')).toBeUndefined();
    });
  });

  describe('2. GitIgnoreRegistry', () => {
    it('initializes with core gitignore requirements and allows custom additions', () => {
      const initial = GitIgnoreRegistry.getAll();
      expect(initial.length).toBeGreaterThanOrEqual(CORE_GITIGNORE_REQUIREMENTS.length);

      GitIgnoreRegistry.register({
        id: 'custom-dist',
        pattern: 'dist/',
        samplePath: 'dist/index.js',
        reason: 'Build outputs',
        isApplicable: () => true
      });

      const updated = GitIgnoreRegistry.getAll();
      expect(updated.some((r) => r.id === 'custom-dist')).toBe(true);

      GitIgnoreRegistry.reset();
      const resetList = GitIgnoreRegistry.getAll();
      expect(resetList.some((r) => r.id === 'custom-dist')).toBe(false);
    });
  });

  describe('3. PackageScriptRegistry', () => {
    it('initializes with core package scripts and detects collisions with disparate commands', () => {
      expect(PackageScriptRegistry.has('auditor')).toBe(true);
      expect(PackageScriptRegistry.get('auditor')?.command).toBe('auditor');

      // Re-registering exact same command is idempotent
      expect(() => {
        PackageScriptRegistry.register({
          name: 'auditor',
          command: 'auditor',
          description: 'Identical invocation'
        });
      }).not.toThrow();

      // Conflicting command throws loud COMMAND COLLISION error
      expect(() => {
        PackageScriptRegistry.register(
          {
            name: 'auditor',
            command: 'auditor --conflicting-flag',
            description: 'Conflicting command'
          },
          'extension:conflict'
        );
      }).toThrowError(/\[COMMAND COLLISION\]/i);
    });
  });

  describe('4. ConfigFileRegistry', () => {
    it('registers configuration requirements and clears them on reset', () => {
      ConfigFileRegistry.register({
        id: 'custom-tool-config',
        file: 'tool.config.json',
        candidateFiles: ['tool.config.json'],
        description: 'Mock tool config',
        ruleId: 'mock-config-rule',
        generateDefaultContent: () => '{}'
      });

      expect(ConfigFileRegistry.get('custom-tool-config')?.file).toBe('tool.config.json');
      expect(ConfigFileRegistry.getAll().some((c) => c.id === 'custom-tool-config')).toBe(true);

      ConfigFileRegistry.reset();
      expect(ConfigFileRegistry.get('custom-tool-config')).toBeUndefined();
    });
  });

  describe('5. Universal Reset: resetAllEntityRegistries', () => {
    it('resets all canonical registries in one hermetic invocation', () => {
      GitIgnoreRegistry.register({
        id: 'temp-ignore',
        pattern: 'temp/',
        samplePath: 'temp/file.txt',
        reason: 'Temporary',
        isApplicable: () => true
      });
      ConfigFileRegistry.register({
        id: 'temp-config',
        file: 'temp.json',
        candidateFiles: ['temp.json'],
        description: 'Temp config',
        ruleId: 'mock-temp-rule',
        generateDefaultContent: () => '{}'
      });

      expect(GitIgnoreRegistry.getAll().some((r) => r.id === 'temp-ignore')).toBe(true);
      expect(ConfigFileRegistry.get('temp-config')).toBeDefined();

      resetAllEntityRegistries();

      expect(GitIgnoreRegistry.getAll().some((r) => r.id === 'temp-ignore')).toBe(false);
      expect(ConfigFileRegistry.get('temp-config')).toBeUndefined();
      expect(GitIgnoreRegistry.getAll().length).toBe(CORE_GITIGNORE_REQUIREMENTS.length);
      expect(PackageScriptRegistry.getAll().length).toBe(CORE_PACKAGE_SCRIPT_REQUIREMENTS.length);
    });
  });

  describe('6. HomebrewDetectorRegistry Polymorphism & Isolation', () => {
    it('inherits from BaseEntityRegistry and participates in universal reset', () => {
      expect(HomebrewDetectorRegistry instanceof BaseEntityRegistry).toBe(true);

      const dummyDetector = {
        id: 'test-custom-detector',
        ruleId: 'auditor-raw-console' as const,
        ruleDescription: 'Test custom detector',
        detect: () => [
          {
            file: 'src/bad.ts',
            ruleId: 'auditor-raw-console' as const,
            message: 'Direct console call',
            line: 10
          }
        ]
      };

      HomebrewDetectorRegistry.register(dummyDetector);
      expect(HomebrewDetectorRegistry.has('test-custom-detector')).toBe(true);
      expect(HomebrewDetectorRegistry.get('test-custom-detector')?.id).toBe('test-custom-detector');

      const mockContext = {
        filePath: 'src/bad.ts',
        absolutePath: '/project/src/bad.ts',
        content: 'console.log("hello");',
        lines: ['console.log("hello");'],
        isExtension: false,
        isBuiltinSuite: true,
        isAnalyzer: false,
        projectRoot: process.cwd()
      };

      const findings = HomebrewDetectorRegistry.scanFile('src/bad.ts', mockContext as never);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('auditor-raw-console');

      const allFindings = HomebrewDetectorRegistry.scanAll(mockContext as never);
      expect(allFindings.length).toBeGreaterThanOrEqual(1);

      resetAllEntityRegistries();
      expect(HomebrewDetectorRegistry.has('test-custom-detector')).toBe(false);
    });
  });
});
