import { describe, it, expect, beforeAll } from 'vitest';
import { colorizeStreamSubLine } from '../src/core/streamingRunner.ts';
import type { SubAuditorReport } from '../src/core/auditContract.ts';

beforeAll(() => {
  process.env.FORCE_COLOR = '1';
});

describe('colorizeStreamSubLine', () => {
  it('colors line red when subAuditor has errors', () => {
    const subAuditors: SubAuditorReport[] = [
      {
        id: 'rule_1',
        name: 'Reglas de Arquitectura: Funciones Anidadas',
        status: 'failed',
        count: 5,
        errorsCount: 5,
        warningsCount: 0
      }
    ];

    const line = '🔍 [01/01] Reglas de Arquitectura: Funciones Anidadas (🐛 5)';
    const colored = colorizeStreamSubLine(line, {
      isSuccess: false,
      hasWarnings: false,
      subAuditors
    });

    // Contains ANSI red escape code (\u001b[31m)
    expect(colored).toContain('\u001b[31m');
    expect(colored).toContain('(🐛 5)');
  });

  it('colors line yellow when subAuditor has only warnings', () => {
    const subAuditors: SubAuditorReport[] = [
      {
        id: 'rule_1',
        name: 'Reglas de Estilo: Mixins',
        status: 'warning',
        count: 2,
        errorsCount: 0,
        warningsCount: 2
      }
    ];

    const line = '🔍 [01/01] Reglas de Estilo: Mixins (🐛 2)';
    const colored = colorizeStreamSubLine(line, {
      isSuccess: true,
      hasWarnings: true,
      subAuditors
    });

    // Contains ANSI yellow escape code (\u001b[33m)
    expect(colored).toContain('\u001b[33m');
    expect(colored).toContain('(🐛 2)');
  });

  it('colors line dim when subAuditor passed cleanly with 0 findings', () => {
    const subAuditors: SubAuditorReport[] = [
      {
        id: 'rule_1',
        name: 'Reglas de Arquitectura: Inyección de Dependencias',
        status: 'passed',
        count: 0,
        errorsCount: 0,
        warningsCount: 0
      }
    ];

    const line = '🔍 [01/01] Reglas de Arquitectura: Inyección de Dependencias';
    const colored = colorizeStreamSubLine(line, {
      isSuccess: true,
      hasWarnings: false,
      subAuditors
    });

    // Contains ANSI dim escape code (\u001b[2m)
    expect(colored).toContain('\u001b[2m');
    expect(colored).not.toContain('\u001b[31m');
    expect(colored).not.toContain('\u001b[33m');
  });

  it('falls back to heuristics when subAuditors is not provided', () => {
    const errorLine = 'Regla X (🐛 3)';
    const coloredError = colorizeStreamSubLine(errorLine, {
      isSuccess: false
    });
    expect(coloredError).toContain('\u001b[31m');

    const warningLine = 'Regla Y (warning)';
    const coloredWarn = colorizeStreamSubLine(warningLine, {
      isSuccess: true,
      hasWarnings: true
    });
    expect(coloredWarn).toContain('\u001b[33m');
  });
});
