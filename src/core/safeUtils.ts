/**
 * packages/auditor/src/core/safeUtils.ts
 *
 * CANONICAL SAFE EXECUTION & IO UTILITIES
 * Provides robust, typed, functional helpers to execute potentially failing operations
 * and optional IO without boilerplate, silent catch blocks, or suppressed errors.
 */

import fs from 'node:fs';

export type SafeOperationStatus = 'success' | 'failure';

export interface SafeOperationSuccess<T> {
  readonly status: 'success';
  readonly ok: boolean;
  readonly value: T;
}

export interface SafeOperationFailure<E = Error> {
  readonly status: 'failure';
  readonly ok: boolean;
  readonly error: E;
}

export type SafeResult<T, E = Error> = SafeOperationSuccess<T> | SafeOperationFailure<E>;

export interface SafeReadOptions {
  readonly encoding?: BufferEncoding;
}

export interface SafeRmOptions {
  readonly recursive?: boolean;
  readonly force?: boolean;
}

/**
 * Executes a synchronous function and returns its result, or null if an exception is thrown.
 */
export function tryOrNull<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Executes a synchronous function and returns its result, or undefined if an exception is thrown.
 */
export function tryOrUndefined<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Executes a synchronous function and returns its result, or a default value if an exception is thrown.
 */
export function tryOrDefault<T>(fn: () => T, defaultValue: T): T {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
}

/**
 * Executes a synchronous function and returns a Result object with either ok: true and the value,
 * or ok: false and the thrown error.
 */
export function tryCatchSync<T, E = Error>(fn: () => T): SafeResult<T, E> {
  try {
    return { status: 'success', ok: true, value: fn() };
  } catch (error) {
    return { status: 'failure', ok: false, error: error as E };
  }
}

/**
 * Safely parses a JSON string into a typed object.
 * Returns undefined (or optional fallback) if parsing fails.
 */
export function safeJsonParse<T = unknown>(text: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely checks if a file or directory exists and returns its fs.Stats, or null if it cannot be accessed.
 */
export function safeStatSync(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Safely reads a file to string. Returns null if the file does not exist or cannot be read.
 */
export function safeReadFileSync(filePath: string, options?: SafeReadOptions): string | null {
  try {
    return fs.readFileSync(filePath, options?.encoding ?? 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Safely removes a file or directory. Returns true if removed or didn't exist, false if removal threw.
 */
export function safeRmSync(targetPath: string, options?: SafeRmOptions): boolean {
  try {
    fs.rmSync(targetPath, {
      recursive: options?.recursive ?? true,
      force: options?.force ?? true
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes an asynchronous function and returns its resolved value, or null if rejected.
 */
export async function tryOrNullAsync<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Executes an asynchronous function and returns its resolved value, or undefined if rejected.
 */
export async function tryOrUndefinedAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Executes an asynchronous function and returns its resolved value, or a defaultValue if rejected.
 */
export async function tryOrDefaultAsync<T>(fn: () => Promise<T>, defaultValue: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return defaultValue;
  }
}

/**
 * Executes an asynchronous function and returns an OperationResult.
 */
export async function tryCatchAsync<T, E = Error>(fn: () => Promise<T>): Promise<SafeResult<T, E>> {
  try {
    const value = await fn();
    return { status: 'success', ok: true, value };
  } catch (error) {
    return { status: 'failure', ok: false, error: error as E };
  }
}

/**
 * Safely reads a file asynchronously. Returns null if reading fails or file does not exist.
 */
export async function safeReadFileAsync(filePath: string, options?: SafeReadOptions): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, options?.encoding ?? 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Safely reads directory entries asynchronously. Returns null if reading fails.
 */
export async function safeReaddirAsync(dirPath: string): Promise<fs.Dirent[] | null> {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }
}
