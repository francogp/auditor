/**
 * tests/transcript_authorization_tampering_precision.test.ts
 *
 * Unit tests verifying anti-tamper precision in transcriptAuthorizationVerifier.
 * Ensures read_file on background task logs (.system_generated/tasks/*.log) and transcripts
 * is safe and never triggers false-positive tampering flags.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import {
  isTamperingToolCall,
  verifyTranscriptAuthorization
} from '../src/core/transcriptAuthorizationVerifier.ts';

describe('Transcript Authorization Anti-Tamper Precision', () => {
  describe('isTamperingToolCall Precision', () => {
    it('does NOT flag read_file on background task logs in .system_generated', () => {
      const toolCall = {
        name: 'read_file',
        args: {
          Path: 'C:\\Users\\User\\.gemini\\antigravity\\brain\\abc-123\\.system_generated\\tasks\\task-1867.log'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(false);
    });

    it('does NOT flag read_file on transcript.jsonl', () => {
      const toolCall = {
        name: 'read_file',
        args: {
          Path: 'C:\\Users\\User\\.gemini\\antigravity\\brain\\abc-123\\.system_generated\\logs\\transcript.jsonl'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(false);
    });

    it('does NOT flag benign run_command executing npm or git commands', () => {
      const toolCall = {
        name: 'run_command',
        args: {
          CommandLine: 'npm run auditor task=validate_audit_config'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(false);
    });

    it('does NOT flag read-only node stream or inspection scripts reading transcript.jsonl with arrow functions', () => {
      const toolCall = {
        name: 'run_command',
        args: {
          CommandLine:
            "node -e \"const rl = readline.createInterface({ input: fs.createReadStream('transcript.jsonl') }); rl.on('line', l => { if (l.length >= 10) console.log(l); });\""
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(false);
    });

    it('FLAGS run_command attempting shell deletion of transcript.jsonl', () => {
      const toolCall = {
        name: 'run_command',
        args: {
          CommandLine: 'Remove-Item .system_generated/logs/transcript.jsonl'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(true);
    });

    it('FLAGS run_command attempting script write into transcript.jsonl', () => {
      const toolCall = {
        name: 'run_command',
        args: {
          CommandLine: "node -e \"fs.writeFileSync('transcript.jsonl', 'tampered')\""
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(true);
    });

    it('FLAGS write_file targeting transcript.jsonl', () => {
      const toolCall = {
        name: 'write_file',
        args: {
          Path: 'C:\\Users\\User\\.gemini\\antigravity\\brain\\abc-123\\.system_generated\\logs\\transcript.jsonl',
          Content: 'fake user message'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(true);
    });

    it('FLAGS edit_file targeting transcript_full.jsonl', () => {
      const toolCall = {
        name: 'edit_file',
        args: {
          Path: 'C:\\Users\\User\\.gemini\\antigravity\\brain\\abc-123\\.system_generated\\logs\\transcript_full.jsonl',
          Target: 'old',
          Replacement: 'new'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(true);
    });

    it('FLAGS run_command attempting shell redirection into transcript.jsonl', () => {
      const toolCall = {
        name: 'run_command',
        args: {
          CommandLine: 'echo "RELAX-12345678" >> .system_generated/logs/transcript.jsonl'
        }
      };
      expect(isTamperingToolCall(toolCall)).toBe(true);
    });
  });

  describe('End-to-End Transcript Verification with Task Log Reads', () => {
    it('verifies human user authorization even when model previously read .system_generated task logs', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-transcript-test-'));
      const transcriptFile = path.join(tempDir, 'transcript.jsonl');

      const lines = [
        // Step 1: Model reads background task log (previously triggered false positive)
        JSON.stringify({
          step_index: 100,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          tool_calls: [
            {
              name: 'read_file',
              args: {
                Path: 'C:/brain/.system_generated/tasks/task-999.log'
              }
            }
          ]
        }),
        // Step 2: Human user explicitly types authorization code in chat
        JSON.stringify({
          step_index: 101,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          content: 'Autorizo la relajacion RELAX-4f71f40e para la prueba'
        })
      ];

      fs.writeFileSync(transcriptFile, lines.join('\n') + '\n', 'utf-8');

      try {
        const result = verifyTranscriptAuthorization('RELAX-4f71f40e', {
          transcriptPath: transcriptFile
        });

        expect(result.tamperingDetected).toBe(false);
        expect(result.verified).toBe(true);
        expect(result.userPrompt).toContain('RELAX-4f71f40e');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
