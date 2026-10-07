import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  ValidateValibotParityAuditor,
  VALIBOT_PARITY_RULES,
  extractInterfaceKeys,
  extractEphemeralKeys,
  extractSchemaKeys,
  extractSerializerKeys,
  extractInitialStateKeys
} from '../src/suites/persistence/validate_valibot_parity.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import ts from 'typescript';

const TEST_DIR = path.resolve(process.cwd(), 'scratch/test_valibot_parity_tmp');

describe('ValidateValibotParityAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(TEST_DIR, { recursive: true });
    resetAuditConfig();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Rule Declarations & Metadata', () => {
    it('conforms to construction metadata contract and exposes manifest', () => {
      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      validateAuditorConstruction(auditor);

      const manifest = auditor.toManifest();
      expect(manifest.id).toBe('validate_valibot_parity');
      expect(manifest.family).toBe('persistence');
      expect(auditor.packageName).toBe('Valibot');
      expect(manifest.configKey).toBe('valibot.enabled');
      for (const rule of VALIBOT_PARITY_RULES) {
        expect(manifest.rules[rule]).toBeDefined();
      }
    });

    it('verifies 100% of declared rule IDs', () => {
      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const declaredRules = auditor.ruleIds;
      expect(declaredRules).toEqual(VALIBOT_PARITY_RULES);
      expect(declaredRules.length).toBe(6);
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('passes cleanly when targets array is empty (not applicable)', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Empty Targets Project',
          valibot: {
            enabled: true,
            targets: []
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
      expect(result.findings.length).toBe(0);
    });

    it('passes cleanly with complete parity across interface, schema, serializer, and initial state', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserState {
  id: string;
  name: string;
  ephemeralToken: string;
}
export type EphemeralUserKeys = 'ephemeralToken';
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string } from 'valibot';
export const userSchema = object({
  id: string(),
  name: string()
});
`,
        'utf-8'
      );

      const serializerFile = path.join(TEST_DIR, 'serializer.ts');
      fs.writeFileSync(
        serializerFile,
        `
export function serializeUser(state: any) {
  return {
    id: state.id,
    name: state.name
  };
}
`,
        'utf-8'
      );

      const initialStateFile = path.join(TEST_DIR, 'initial.ts');
      fs.writeFileSync(
        initialStateFile,
        `
export function createInitialUser() {
  return {
    id: '',
    name: ''
  };
}
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Parity Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'user_state',
                typesFile: 'types.ts',
                interfaceName: 'UserState',
                ephemeralTypeAlias: 'EphemeralUserKeys',
                schemaFile: 'schema.ts',
                schemaVarName: 'userSchema',
                serializerFile: 'serializer.ts',
                serializerFunctionName: 'serializeUser',
                initialStateFile: 'initial.ts',
                initialStateFunctionName: 'createInitialUser'
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings.length).toBe(0);
    });

    it('respects allowedNullableFields and allowedUnknownFields configuration', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserProfile {
  id: string;
  bio?: string | null;
  rawJson: any;
}
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string, optional, nullable, unknown } from 'valibot';
export const profileSchema = object({
  id: string(),
  bio: optional(nullable(string())),
  rawJson: unknown()
});
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Allowed Exceptions Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'profile',
                typesFile: 'types.ts',
                interfaceName: 'UserProfile',
                schemaFile: 'schema.ts',
                schemaVarName: 'profileSchema',
                allowedNullableFields: ['bio'],
                allowedUnknownFields: ['rawJson']
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Violation Detection (StandardAuditResult)', () => {
    it('detects missing schema, serializer, and initial state fields (valibot-schema-missing-field, valibot-serializer-missing-field, valibot-initial-state-missing-field)', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserState {
  id: string;
  name: string;
  email: string;
}
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string } from 'valibot';
export const userSchema = object({
  id: string()
});
`,
        'utf-8'
      );

      const serializerFile = path.join(TEST_DIR, 'serializer.ts');
      fs.writeFileSync(
        serializerFile,
        `
export function serializeUser(state: any) {
  return {
    id: state.id
  };
}
`,
        'utf-8'
      );

      const initialStateFile = path.join(TEST_DIR, 'initial.ts');
      fs.writeFileSync(
        initialStateFile,
        `
export function createInitialUser() {
  return {
    id: ''
  };
}
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Missing Fields Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'user_state',
                typesFile: 'types.ts',
                interfaceName: 'UserState',
                schemaFile: 'schema.ts',
                schemaVarName: 'userSchema',
                serializerFile: 'serializer.ts',
                serializerFunctionName: 'serializeUser',
                initialStateFile: 'initial.ts',
                initialStateFunctionName: 'createInitialUser'
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);

      const schemaViolation = result.findings.find(f => f.ruleId === 'valibot-schema-missing-field' && f.context === 'name');
      expect(schemaViolation).toBeDefined();
      expect(schemaViolation?.severity).toBe('error');

      const serializerViolation = result.findings.find(f => f.ruleId === 'valibot-serializer-missing-field' && f.context === 'name');
      expect(serializerViolation).toBeDefined();
      expect(serializerViolation?.severity).toBe('error');

      const initialViolation = result.findings.find(f => f.ruleId === 'valibot-initial-state-missing-field' && f.context === 'name');
      expect(initialViolation).toBeDefined();
      expect(initialViolation?.severity).toBe('error');
    });

    it('detects nested parity violations (valibot-nested-missing-field)', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserProfile {
  id: string;
}
export interface NestedSettings {
  theme: string;
  notifications: boolean;
}
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string } from 'valibot';
export const profileSchema = object({
  id: string()
});
export const settingsSchema = object({
  theme: string()
});
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Nested Missing Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'profile',
                typesFile: 'types.ts',
                interfaceName: 'UserProfile',
                schemaFile: 'schema.ts',
                schemaVarName: 'profileSchema',
                nestedTargets: [
                  {
                    id: 'settings',
                    interfaceName: 'NestedSettings',
                    schemaVarName: 'settingsSchema'
                  }
                ]
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const nestedViolation = result.findings.find(f => f.ruleId === 'valibot-nested-missing-field' && f.context === 'notifications');
      expect(nestedViolation).toBeDefined();
      expect(nestedViolation?.severity).toBe('error');
    });

    it('detects unknown() type violations (valibot-domain-type-violation)', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserProfile {
  id: string;
  metadata: any;
}
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string, unknown } from 'valibot';
export const profileSchema = object({
  id: string(),
  metadata: unknown()
});
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Unknown Violation Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'profile',
                typesFile: 'types.ts',
                interfaceName: 'UserProfile',
                schemaFile: 'schema.ts',
                schemaVarName: 'profileSchema'
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.status).toBe('failed');
      const unknownViolation = result.findings.find(f => f.ruleId === 'valibot-domain-type-violation' && f.context === 'metadata');
      expect(unknownViolation).toBeDefined();
      expect(unknownViolation?.severity).toBe('error');
    });
  });

  describe('Warning Path Verification (StandardAuditResult)', () => {
    it('detects redundant optional(nullable(...)) patterns as warnings (valibot-redundant-nullability)', async () => {
      const typesFile = path.join(TEST_DIR, 'types.ts');
      fs.writeFileSync(
        typesFile,
        `
export interface UserProfile {
  id: string;
  bio?: string | null;
}
`,
        'utf-8'
      );

      const schemaFile = path.join(TEST_DIR, 'schema.ts');
      fs.writeFileSync(
        schemaFile,
        `
import { object, string, optional, nullable } from 'valibot';
export const profileSchema = object({
  id: string(),
  bio: optional(nullable(string()))
});
`,
        'utf-8'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Redundant Nullability Project',
          valibot: {
            enabled: true,
            targets: [
              {
                id: 'profile',
                typesFile: 'types.ts',
                interfaceName: 'UserProfile',
                schemaFile: 'schema.ts',
                schemaVarName: 'profileSchema'
              }
            ]
          },
          persistence: { engine: 'none' }
        }),
        TEST_DIR
      );

      const auditor = new ValidateValibotParityAuditor({ projectRoot: TEST_DIR });
      const result = await auditor.execute();

      expect(result.summary.warnings).toBeGreaterThan(0);
      const warningFinding = result.findings.find(f => f.ruleId === 'valibot-redundant-nullability' && f.context === 'bio');
      expect(warningFinding).toBeDefined();
      expect(warningFinding?.severity).toBe('warning');
    });
  });

  describe('AST Helper Functions Verification', () => {
    it('tests AST extraction helper functions directly', () => {
      const code = `
interface Person {
  name: string;
  age?: number;
}
type EphemeralKeys = 'age';
export const personSchema = object({
  name: string()
});
function serializePerson() {
  return {
    name: 'test'
  };
}
function createInitialPerson() {
  return {
    name: '',
    extra: { prop: 1 }
  };
}
`;
      const sf = ts.createSourceFile('sample.ts', code, ts.ScriptTarget.Latest, true);

      const ifaceKeys = extractInterfaceKeys(sf, 'Person');
      expect(ifaceKeys.has('name')).toBe(true);
      expect(ifaceKeys.has('age')).toBe(true);

      const ephemKeys = extractEphemeralKeys(sf, 'EphemeralKeys');
      expect(ephemKeys.has('age')).toBe(true);

      const { keys: schemaKeys } = extractSchemaKeys(sf, 'personSchema');
      expect(schemaKeys.has('name')).toBe(true);

      const serKeys = extractSerializerKeys(sf, 'serializePerson');
      expect(serKeys.has('name')).toBe(true);

      const { topLevelKeys, nestedKeys } = extractInitialStateKeys(sf, 'createInitialPerson');
      expect(topLevelKeys.has('name')).toBe(true);
      expect(topLevelKeys.has('extra')).toBe(true);
      expect(nestedKeys.get('extra')?.has('prop')).toBe(true);
    });
  });
});
