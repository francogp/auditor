/**
 * tests/package_script_registry.test.ts
 *
 * Unit tests for Centralized Package Script Registry, Collision Detection,
 * and BaseAuditor automatic script derivation contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PackageScriptRegistry } from '../src/core/packageScriptRegistry.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import type { AuditorPackageScriptRequirement } from '../src/core/auditContract.ts';

class DummyAuditorWithoutScripts extends BaseAuditor {
  constructor(projectRoot = process.cwd()) {
    super({
      id: 'validate_dummy_component',
      name: 'Dummy Component Auditor',
      description: 'Valida componentes simulados para pruebas de scripts',
      family: 'architecture',
      packageName: 'Dummy',
      icon: '🧩',
      configKey: 'core',
      defaultConfig: { enabled: true },
      coverage: { include: ['src/**'] },
      ruleDescriptions: {
        'dummy-rule': 'Regla de prueba'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('dummy-rule');
  }
}

class DummyAuditorWithCustomScripts extends BaseAuditor {
  constructor(projectRoot = process.cwd()) {
    super({
      id: 'validate_dummy_custom',
      name: 'Dummy Custom Auditor',
      description: 'Auditor con scripts personalizados explícitos',
      family: 'architecture',
      packageName: 'Custom',
      icon: '⚙️',
      configKey: 'core',
      defaultConfig: { enabled: true },
      coverage: { include: ['src/**'] },
      ruleDescriptions: {
        'custom-rule': 'Regla personalizada'
      },
      scripts: [
        {
          name: 'audit:dummy-custom-alias',
          command: 'auditor task=validate_dummy_custom --fast',
          description: 'Alias personalizado rápido',
          category: 'architecture'
        }
      ],
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    this.markRuleEvaluated('custom-rule');
  }
}

describe('PackageScriptRegistry & Command Collision Detection', () => {
  beforeEach(() => {
    PackageScriptRegistry.reset();
  });

  afterEach(() => {
    PackageScriptRegistry.reset();
  });

  it('initializes and resets with core package script requirements', () => {
    const all = PackageScriptRegistry.getAll();
    expect(all.length).toBeGreaterThan(0);
    expect(PackageScriptRegistry.has('audit')).toBe(true);
    expect(PackageScriptRegistry.has('audit:fix')).toBe(true);
    expect(PackageScriptRegistry.has('version:analyze')).toBe(true);
    expect(PackageScriptRegistry.get('audit')?.command).toBe('auditor');
  });

  it('allows registering the exact same command idempotently without throwing', () => {
    const script: AuditorPackageScriptRequirement = {
      name: 'audit',
      command: 'auditor',
      description: 'Mismo comando idéntico',
      category: 'core'
    };

    expect(() => PackageScriptRegistry.register(script, 'test-task')).not.toThrow();
  });

  it('throws an explicit loud error when two sources declare conflicting commands for the same script name', () => {
    const collisionScript: AuditorPackageScriptRequirement = {
      name: 'audit',
      command: 'custom-auditor-command-conflict',
      description: 'Comando en conflicto',
      category: 'core'
    };

    expect(() => {
      PackageScriptRegistry.register(collisionScript, 'conflicting-subauditor');
    }).toThrow(/\[COLISIÓN DE COMANDOS\]/);
  });

  it('reports source IDs in the collision error message to facilitate renaming', () => {
    const customReq1: AuditorPackageScriptRequirement = {
      name: 'audit:unique-tool',
      command: 'tool --first',
      description: 'Primera herramienta',
      category: 'reporting'
    };
    PackageScriptRegistry.register(customReq1, 'subauditor_alpha');

    const customReq2: AuditorPackageScriptRequirement = {
      name: 'audit:unique-tool',
      command: 'tool --second',
      description: 'Segunda herramienta en colisión',
      category: 'reporting'
    };

    expect(() => {
      PackageScriptRegistry.register(customReq2, 'subauditor_beta');
    }).toThrow(/El comando de script 'audit:unique-tool' está duplicado entre 'subauditor_alpha'/);
  });

  it('automatically derives canonical package scripts in BaseAuditor when scripts option is omitted', () => {
    const auditor = new DummyAuditorWithoutScripts();
    expect(auditor.scripts.length).toBe(1);

    const derived = auditor.scripts[0]!;
    expect(derived.name).toBe('audit:dummy-component');
    expect(derived.command).toBe('auditor task=validate_dummy_component');
    expect(derived.category).toBe('architecture');
    expect(derived.description).toBe('Valida componentes simulados para pruebas de scripts');

    expect(PackageScriptRegistry.has('audit:dummy-component')).toBe(true);
    expect(PackageScriptRegistry.get('audit:dummy-component')?.command).toBe('auditor task=validate_dummy_component');
  });

  it('honors explicitly declared custom scripts in BaseAuditor', () => {
    const auditor = new DummyAuditorWithCustomScripts();
    expect(auditor.scripts.length).toBe(1);

    const custom = auditor.scripts[0]!;
    expect(custom.name).toBe('audit:dummy-custom-alias');
    expect(custom.command).toBe('auditor task=validate_dummy_custom --fast');

    expect(PackageScriptRegistry.has('audit:dummy-custom-alias')).toBe(true);
  });

  it('throws an error during BaseAuditor instantiation if a custom script collides with existing registered script', () => {
    expect(() => {
      new (class extends BaseAuditor {
        constructor() {
          super({
            id: 'validate_collision_maker',
            name: 'Collision Maker',
            description: 'Intenta pisar audit:fix con otro comando',
            family: 'architecture',
            packageName: 'Collision',
            icon: '💥',
            configKey: 'core',
            defaultConfig: { enabled: true },
            coverage: { include: ['src/**'] },
            ruleDescriptions: { 'rule-1': 'Desc' },
            scripts: [
              {
                name: 'audit:fix',
                command: 'different-fix-command',
                description: 'Intento de sobreescritura',
                category: 'core'
              }
            ]
          });
        }
        public override async runAudit(): Promise<void> {}
      })();
    }).toThrow(/\[COLISIÓN DE COMANDOS\]/);
  });
});
