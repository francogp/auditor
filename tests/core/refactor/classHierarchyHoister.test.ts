import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Project } from 'ts-morph';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { ClassHierarchyHoister } from '../../../src/core/refactor/classHierarchyHoister.ts';

describe('ClassHierarchyHoister', () => {
  let tmpDir: string;
  let project: Project;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoister-test-'));
    project = new Project({ useInMemoryFileSystem: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects a common base class across multiple derived classes', () => {
    const baseCode = `export class EntityBase {\n  id: string = '';\n}`;
    const child1Code = `import { EntityBase } from './base.ts';\nexport class PlayerEntity extends EntityBase {}`;
    const child2Code = `import { EntityBase } from './base.ts';\nexport class EnemyEntity extends EntityBase {}`;

    project.createSourceFile('base.ts', baseCode);
    const c1 = project.createSourceFile('child1.ts', child1Code);
    const c2 = project.createSourceFile('child2.ts', child2Code);

    const target = ClassHierarchyHoister.findCommonBaseClass(project, [
      c1.getFilePath(),
      c2.getFilePath()
    ]);

    expect(target).not.toBeNull();
    expect(target?.baseClassName).toBe('EntityBase');
    expect(target?.canHoist).toBe(true);
    expect(target?.derivedClassNames).toEqual(['PlayerEntity', 'EnemyEntity']);
  });

  it('returns null when classes do not share the same base class', () => {
    const code1 = `export class FooBase {}\nexport class ChildA extends FooBase {}`;
    const code2 = `export class BarBase {}\nexport class ChildB extends BarBase {}`;

    const f1 = project.createSourceFile('foo.ts', code1);
    const f2 = project.createSourceFile('bar.ts', code2);

    const target = ClassHierarchyHoister.findCommonBaseClass(project, [
      f1.getFilePath(),
      f2.getFilePath()
    ]);

    expect(target).toBeNull();
  });

  it('returns null when fewer than two files are provided', () => {
    const code1 = `export class OnlyOne {}`;
    const f1 = project.createSourceFile('one.ts', code1);

    const target = ClassHierarchyHoister.findCommonBaseClass(project, [f1.getFilePath()]);
    expect(target).toBeNull();
  });

  it('hoists method into base class and prevents duplicate re-insertion', () => {
    const baseFile = project.createSourceFile(
      'modelBase.ts',
      `export class ModelBase {\n  createdAt: number = 0;\n}`
    );

    const hoisted = ClassHierarchyHoister.hoistMethod(
      baseFile,
      'ModelBase',
      'resetTimestamps(): void',
      '    this.createdAt = Date.now();',
      true
    );

    expect(hoisted).toBe(true);
    expect(baseFile.getFullText()).toContain('protected resetTimestamps(): void');

    // Attempting to hoist again should return false (already present)
    const duplicateHoist = ClassHierarchyHoister.hoistMethod(
      baseFile,
      'ModelBase',
      'resetTimestamps(): void',
      '    this.createdAt = 0;',
      true
    );

    expect(duplicateHoist).toBe(false);
  });
});
