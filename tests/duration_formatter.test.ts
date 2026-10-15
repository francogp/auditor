/**
 * tests/duration_formatter.test.ts
 *
 * Unit tests for duration and number formatting utility using native Intl.NumberFormat.
 */

import { describe, it, expect } from 'vite-plus/test';
import {
  formatNumber,
  formatDurationMs,
  formatDuration,
  DURATION_PAD_LENGTH
} from '../src/core/durationFormatter.ts';

describe('durationFormatter', () => {
  describe('formatNumber', () => {
    it('formats numbers with standard Spanish thousands separators (dots)', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(450)).toBe('450');
      expect(formatNumber(1250)).toBe('1.250');
      expect(formatNumber(12500)).toBe('12.500');
      expect(formatNumber(1250000)).toBe('1.250.000');
    });

    it('formats decimal numbers with Spanish comma', () => {
      expect(formatNumber(53510.5)).toBe('53.510,5');
      expect(formatNumber(12.3)).toBe('12,3');
    });

    it('handles non-finite numbers safely', () => {
      expect(formatNumber(NaN)).toBe('NaN');
      expect(formatNumber(Infinity)).toBe('Infinity');
    });
  });

  describe('formatDurationMs', () => {
    it('formats duration in milliseconds with space before ms', () => {
      expect(formatDurationMs(0)).toBe('0 ms');
      expect(formatDurationMs(450)).toBe('450 ms');
      expect(formatDurationMs(2140)).toBe('2.140 ms');
      expect(formatDurationMs(56814)).toBe('56.814 ms');
      expect(formatDurationMs(53510.1)).toBe('53.510,1 ms');
    });
  });

  describe('formatDuration', () => {
    it('pads formatted duration to DURATION_PAD_LENGTH', () => {
      const padded = formatDuration(450);
      expect(padded.trim()).toBe('450 ms');
      expect(padded.length).toBe(DURATION_PAD_LENGTH);
    });

    it('pads large durations correctly', () => {
      const padded = formatDuration(56814);
      expect(padded.trim()).toBe('56.814 ms');
      expect(padded.length).toBe(DURATION_PAD_LENGTH);
    });
  });
});
