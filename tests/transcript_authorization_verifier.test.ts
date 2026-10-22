import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import type { RelaxationCode } from '../src/core/configRatchet.ts';
import { verifyTranscriptAuthorization } from '../src/core/transcriptAuthorizationVerifier.ts';

describe('transcriptAuthorizationVerifier', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-transcript-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('reports unavailable gracefully in headless CI environments when no transcripts exist', () => {
    process.env.CI = 'true';
    delete process.env.ANTIGRAVITY_TRANSCRIPT_PATH;
    delete process.env.ANTIGRAVITY_BRAIN_DIR;

    const code = 'RELAX-12345678' as RelaxationCode;
    const result = verifyTranscriptAuthorization(code, { brainDir: tmpDir });

    expect(result.verified).toBe(false);
    expect(result.tamperingDetected).toBe(false);
    expect(result.reason).toContain('Transcripts unavailable in headless CI/CD environment');
  });

  it('authorizes when relaxation code is explicitly provided in a USER_EXPLICIT step', () => {
    delete process.env.CI;
    const transcriptFile = path.join(tmpDir, 'transcript.jsonl');
    const validStep = {
      step_index: 1,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      content: 'I approve relaxation RELAX-abcd1234 for coverage test'
    };
    fs.writeFileSync(transcriptFile, JSON.stringify(validStep) + '\n', 'utf-8');

    const result = verifyTranscriptAuthorization('RELAX-abcd1234', {
      transcriptPath: transcriptFile
    });

    expect(result.verified).toBe(true);
    expect(result.tamperingDetected).toBe(false);
    expect(result.userPrompt).toContain('RELAX-abcd1234');
  });

  it('detects tampering and permanently blocks if a model tool calls touches transcripts', () => {
    delete process.env.CI;
    const transcriptFile = path.join(tmpDir, 'transcript.jsonl');
    const userStep = {
      step_index: 1,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      content: 'I approve relaxation RELAX-deadbeef'
    };
    const tamperingStep = {
      step_index: 2,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      tool_calls: [
        {
          name: 'write_file',
          args: {
            Path: 'C:\\Users\\test\\.gemini\\antigravity\\brain\\123\\.system_generated\\logs\\transcript.jsonl'
          }
        }
      ]
    };
    fs.writeFileSync(
      transcriptFile,
      `${JSON.stringify(userStep)}\n${JSON.stringify(tamperingStep)}\n`,
      'utf-8'
    );

    const result = verifyTranscriptAuthorization('RELAX-deadbeef', {
      transcriptPath: transcriptFile
    });

    expect(result.verified).toBe(false);
    expect(result.tamperingDetected).toBe(true);
    expect(result.reason).toContain('Tampering detected');
  });
});
