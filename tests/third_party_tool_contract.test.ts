/**
 * tests/third_party_tool_contract.test.ts
 *
 * Unit test suite for the Third-Party Tool Failure Contract:
 * 1. Constructor fail-loud enforcement:
 *    - Omitting usesThirdPartyTool throws.
 *    - usesThirdPartyTool: true without thirdPartyToolPolicy throws.
 *    - usesThirdPartyTool: true with empty toolName throws.
 *    - usesThirdPartyTool: true with fallbackBehavior: 'violation' without fallbackRuleId throws.
 *    - usesThirdPartyTool: true with undeclared fallbackRuleId throws.
 *    - usesThirdPartyTool: false with thirdPartyToolPolicy provided throws.
 *    - Valid clean path with usesThirdPartyTool: false.
 *    - Valid clean path with usesThirdPartyTool: true and 'throw'.
 *    - Valid clean path with usesThirdPartyTool: true and 'violation'.
 * 2. Conformance inspection with validateAuditorConstruction:
 *    - Reports errors on invalid third-party tool metadata.
 *    - Clean on compliant auditors.
 * 3. Homebrew detector (thirdPartyToolContractDetector):
 *    - Detects missing usesThirdPartyTool when external tool calls exist.
 *    - Detects redundant usesThirdPartyTool: true when zero external tool calls exist.
 *    - Passes cleanly on compliant suites.
 */

import { describe, it, expect } from 'vite-plus/test';

import { thirdPartyToolContractDetector } from '../src/analyzers/homebrew/detectors/thirdPartyToolContractDetector.ts';
import type { HomebrewInspectionContext } from '../src/analyzers/homebrew/homebrewTypes.ts';
import {
  BaseAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  type AuditorOptions
} from '../src/core/auditorBase.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

type ProbeRuleId = 'probe-external' | 'probe-internal';

function createMockOptions(overrides: Record<string, unknown> = {}): AuditorOptions<ProbeRuleId> {
  const base: Record<string, unknown> = {
    id: 'validate_mock_probe',
    name: 'Mock Probe Validator',
    description: 'Valida contratos de herramientas de terceros',
    family: 'architecture',
    packageName: 'Mock',
    icon: '🧪',
    configKey: 'core',
    defaultConfig: {},
    requiredPermissions: [],
    criticalConfig: {},
    usesThirdPartyTool: false,
    ruleFixers: {},
    ruleIds: ['probe-external', 'probe-internal'],
    ruleDescriptions: {
      'probe-external': 'Regla de herramienta externa',
      'probe-internal': 'Regla interna nativa'
    },
    ruleRemediations: {
      'probe-external': 'Remediación de prueba externa.',
      'probe-internal': 'Remediación de prueba interna.'
    },
    ruleRemediationPhases: createUniformRemediationPhases(
      ['probe-external', 'probe-internal'],
      'hygiene'
    ),
    ruleCapabilities: createUniformRuleCapabilities(['probe-external', 'probe-internal'], {
      speed: 'light',
      phase: 'normal',
      md: false,
      ast: false,
      changedOnly: false,
      critical: false
    }),
    coverage: { include: ['src/**'] },
    ...overrides
  };
  return base as unknown as AuditorOptions<ProbeRuleId>;
}

class TestAuditorInstance extends BaseAuditor<ProbeRuleId> {
  constructor(options: Partial<AuditorOptions<ProbeRuleId>> = {}) {
    super(createMockOptions(options as unknown as Record<string, unknown>));
  }
  public override runAudit(): void {}
}

describe('Third-Party Tool Failure Contract', () => {
  describe('Constructor Fail-Loud Enforcement', () => {
    it('throws when usesThirdPartyTool is omitted or not a boolean', () => {
      class BareAuditor extends BaseAuditor<ProbeRuleId> {
        constructor(rawOpts: Record<string, unknown>) {
          super(rawOpts as unknown as AuditorOptions<ProbeRuleId>);
        }
        public override runAudit(): void {}
      }
      const opts = { ...createMockOptions() };
      delete (opts as unknown as Record<string, unknown>).usesThirdPartyTool;
      expect(() => new BareAuditor(opts as unknown as Record<string, unknown>)).toThrow(
        /must define mandatory 'usesThirdPartyTool' as a boolean/
      );
    });

    it('throws when usesThirdPartyTool is true but thirdPartyToolPolicy is missing', () => {
      const opts = createMockOptions({ usesThirdPartyTool: true });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /declared usesThirdPartyTool: true but failed to provide mandatory 'thirdPartyToolPolicy'/
      );
    });

    it('throws when thirdPartyToolPolicy.toolName is empty', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: '   ',
          fallbackBehavior: 'throw'
        }
      });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /'thirdPartyToolPolicy.toolName' must be a non-empty string/
      );
    });

    it('throws when fallbackBehavior is invalid', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'ESLint',
          fallbackBehavior: 'ignore' as unknown as 'throw'
        }
      });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /'thirdPartyToolPolicy.fallbackBehavior' must be either 'throw' or 'violation'/
      );
    });

    it('throws when fallbackBehavior is violation but fallbackRuleId is omitted', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'ESLint',
          fallbackBehavior: 'violation'
        }
      });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /declared fallbackBehavior: 'violation' but omitted mandatory 'fallbackRuleId'/
      );
    });

    it('throws when fallbackRuleId is not in declared ruleIds', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'ESLint',
          fallbackBehavior: 'violation',
          fallbackRuleId: 'unknown-rule' as ProbeRuleId
        }
      });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /designated fallbackRuleId 'unknown-rule' which is not in declared 'ruleIds'/
      );
    });

    it('throws when usesThirdPartyTool is false but thirdPartyToolPolicy is defined', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: false,
        thirdPartyToolPolicy: {
          toolName: 'ESLint',
          fallbackBehavior: 'throw'
        }
      });
      expect(() => new TestAuditorInstance(opts)).toThrow(
        /declared usesThirdPartyTool: false but provided 'thirdPartyToolPolicy'/
      );
    });

    it('instantiates cleanly with usesThirdPartyTool: false', () => {
      const opts = createMockOptions({ usesThirdPartyTool: false });
      const auditor = new TestAuditorInstance(opts);
      expect(auditor.usesThirdPartyTool).toBe(false);
      expect(auditor.thirdPartyToolPolicy).toBeUndefined();
    });

    it('instantiates cleanly with usesThirdPartyTool: true and fallbackBehavior: throw', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'TypeScript',
          fallbackBehavior: 'throw'
        }
      });
      const auditor = new TestAuditorInstance(opts);
      expect(auditor.usesThirdPartyTool).toBe(true);
      expect(auditor.thirdPartyToolPolicy).toEqual({
        toolName: 'TypeScript',
        fallbackBehavior: 'throw'
      });
    });

    it('instantiates cleanly with usesThirdPartyTool: true and fallbackBehavior: violation', () => {
      const opts = createMockOptions({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'ESLint',
          fallbackBehavior: 'violation',
          fallbackRuleId: 'probe-external'
        }
      });
      const auditor = new TestAuditorInstance(opts);
      expect(auditor.usesThirdPartyTool).toBe(true);
      expect(auditor.thirdPartyToolPolicy).toEqual({
        toolName: 'ESLint',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'probe-external'
      });
      const manifest = auditor.toManifest();
      expect(manifest.usesThirdPartyTool).toBe(true);
      expect(manifest.thirdPartyToolPolicy?.toolName).toBe('ESLint');
    });
  });

  describe('Conformance Engine Integration (validateAuditorConstruction)', () => {
    it('passes conformance for compliant native auditor', () => {
      const auditor = new TestAuditorInstance({ usesThirdPartyTool: false });
      const errors = validateAuditorConstruction(auditor);
      expect(errors).toEqual([]);
    });

    it('passes conformance for compliant third-party auditor', () => {
      const auditor = new TestAuditorInstance({
        usesThirdPartyTool: true,
        thirdPartyToolPolicy: {
          toolName: 'Fallow',
          fallbackBehavior: 'violation',
          fallbackRuleId: 'probe-external'
        }
      });
      const errors = validateAuditorConstruction(auditor);
      expect(errors).toEqual([]);
    });
  });

  describe('Homebrew Detector (thirdPartyToolContractDetector)', () => {
    function createContext(content: string): HomebrewInspectionContext {
      return {
        filePath: 'src/suites/architecture/validate_fake.ts',
        absolutePath: '/repo/src/suites/architecture/validate_fake.ts',
        content,
        lines: content.split('\n'),
        isExtension: false,
        isBuiltinSuite: true,
        isAnalyzer: false,
        projectRoot: '/repo'
      };
    }

    it('detects missing third-party policy when executeNodeCli is used with usesThirdPartyTool: false', () => {
      const code = `
export class FakeAuditor extends BaseAuditor {
  constructor() {
    super({
      usesThirdPartyTool: false,
    });
  }
  run() {
    executeNodeCli('bin', []);
  }
}
      `;
      const findings = thirdPartyToolContractDetector.detect(createContext(code));
      expect(findings.length).toBe(1);
      expect(findings[0]?.ruleId).toBe('auditor-third-party-tool-contract');
      expect(findings[0]?.context).toBe('missing-third-party-tool-policy');
    });

    it('detects redundant usesThirdPartyTool: true when no external tool is invoked', () => {
      const code = `
export class FakeAuditor extends BaseAuditor {
  constructor() {
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: { toolName: 'Fake', fallbackBehavior: 'throw' }
    });
  }
  run() {
    const a = 1 + 2;
  }
}
      `;
      const findings = thirdPartyToolContractDetector.detect(createContext(code));
      expect(findings.length).toBe(1);
      expect(findings[0]?.ruleId).toBe('auditor-third-party-tool-contract');
      expect(findings[0]?.context).toBe('redundant-third-party-tool-policy');
    });

    it('detects completely missing usesThirdPartyTool in constructor', () => {
      const code = `
export class FakeAuditor extends BaseAuditor {
  constructor() {
    super({
      id: 'fake',
    });
  }
}
      `;
      const findings = thirdPartyToolContractDetector.detect(createContext(code));
      expect(findings.length).toBe(1);
      expect(findings[0]?.ruleId).toBe('auditor-third-party-tool-contract');
      expect(findings[0]?.context).toBe('missing-usesThirdPartyTool');
    });

    it('passes cleanly when third-party tool is invoked and usesThirdPartyTool: true with policy is declared', () => {
      const code = `
export class FakeAuditor extends BaseAuditor {
  constructor() {
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'ESLint',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'fake-rule'
      }
    });
  }
  run() {
    executeNodeCli('bin', []);
  }
}
      `;
      const findings = thirdPartyToolContractDetector.detect(createContext(code));
      expect(findings).toEqual([]);
    });

    it('passes cleanly when native auditor has usesThirdPartyTool: false and invokes no external tools', () => {
      const code = `
export class FakeAuditor extends FileScanAuditor {
  constructor() {
    super({
      usesThirdPartyTool: false,
    });
  }
  run() {
    const doc = 1;
  }
}
      `;
      const findings = thirdPartyToolContractDetector.detect(createContext(code));
      expect(findings).toEqual([]);
    });
  });
});
