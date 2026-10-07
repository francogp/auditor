import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { colorizeStreamSubLine, TaskStreamCoordinator } from '../src/core/streamingRunner.ts';
import type { SubAuditorReport } from '../src/core/auditContract.ts';

beforeAll(() => {
  process.env.FORCE_COLOR = '1';
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe('TaskStreamCoordinator', () => {
  it('prints failed task with red badge and red sub-line when errors are present', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const coordinator = new TaskStreamCoordinator(1);

    await coordinator.onTaskComplete({
      taskName: 'Task Architecture',
      taskId: 'validate_architecture',
      isSuccess: false,
      hasWarnings: false,
      durationMs: 15,
      subLines: ['🔍 [01/01] Regla Fallida (🐛 2)'],
      subAuditors: [
        {
          id: 'rule_1',
          name: 'Regla Fallida',
          status: 'failed',
          count: 2,
          errorsCount: 2,
          warningsCount: 0
        }
      ]
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    const headerCall = logSpy.mock.calls[0]![0];
    const subLineCall = logSpy.mock.calls[1]![0];

    expect(headerCall).toContain('❌');
    expect(headerCall).toContain('\u001b[31m');

    expect(subLineCall).toContain('\u001b[31m');
    expect(subLineCall).toContain('Regla Fallida');
  });

  it('prints warning task with yellow badge and yellow sub-line when only warnings are present', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const coordinator = new TaskStreamCoordinator(1);

    await coordinator.onTaskComplete({
      taskName: 'Task Styles',
      taskId: 'validate_stylelint',
      isSuccess: true,
      hasWarnings: true,
      durationMs: 20,
      subLines: ['🔍 [01/01] Regla Warning (🐛 1)'],
      subAuditors: [
        {
          id: 'rule_warn',
          name: 'Regla Warning',
          status: 'warning',
          count: 1,
          errorsCount: 0,
          warningsCount: 1
        }
      ]
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    const headerCall = logSpy.mock.calls[0]![0];
    const subLineCall = logSpy.mock.calls[1]![0];

    expect(headerCall).toContain('⚠️');
    expect(headerCall).toContain('\u001b[33m');

    expect(subLineCall).toContain('\u001b[33m');
    expect(subLineCall).toContain('Regla Warning');
  });

  it('prints clean task with green badge and dim sub-line when passed cleanly', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const coordinator = new TaskStreamCoordinator(1);

    await coordinator.onTaskComplete({
      taskName: 'Task Clean',
      taskId: 'validate_clean',
      isSuccess: true,
      hasWarnings: false,
      durationMs: 10,
      subLines: ['🔍 [01/01] Regla Limpia'],
      subAuditors: [
        {
          id: 'rule_clean',
          name: 'Regla Limpia',
          status: 'passed',
          count: 0,
          errorsCount: 0,
          warningsCount: 0
        }
      ]
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    const headerCall = logSpy.mock.calls[0]![0];
    const subLineCall = logSpy.mock.calls[1]![0];

    expect(headerCall).toContain('✅');
    expect(headerCall).toContain('\u001b[32m');

    expect(subLineCall).toContain('\u001b[2m');
    expect(subLineCall).not.toContain('\u001b[31m');
    expect(subLineCall).not.toContain('\u001b[33m');
  });

  it('prints skipped task with cyan SKIP badge', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const coordinator = new TaskStreamCoordinator(1);

    await coordinator.onTaskComplete({
      taskName: 'Task Skipped',
      taskId: 'validate_skipped',
      isSuccess: true,
      isSkipped: true,
      durationMs: 0,
      subLines: []
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const headerCall = logSpy.mock.calls[0]![0];
    expect(headerCall).toContain('⏭️  SKIP');
    expect(headerCall).toContain('\u001b[36m');
  });
});
