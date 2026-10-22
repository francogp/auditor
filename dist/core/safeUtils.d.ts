import fs from "node:fs";
//#region src/core/safeUtils.d.ts
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
export declare function tryOrNull<T>(fn: () => T): T | null;
/**
 * Executes a synchronous function and returns its result, or undefined if an exception is thrown.
 */
export declare function tryOrUndefined<T>(fn: () => T): T | undefined;
/**
 * Executes a synchronous function and returns its result, or a default value if an exception is thrown.
 */
export declare function tryOrDefault<T>(fn: () => T, defaultValue: T): T;
/**
 * Executes a synchronous function and returns a Result object with either ok: true and the value,
 * or ok: false and the thrown error.
 */
export declare function tryCatchSync<T, E = Error>(fn: () => T): SafeResult<T, E>;
/**
 * Safely parses a JSON string into a typed object.
 * Returns undefined (or optional fallback) if parsing fails.
 */
export declare function safeJsonParse<T = unknown>(text: string, fallback?: T): T | undefined;
/**
 * Safely checks if a file or directory exists and returns its fs.Stats, or null if it cannot be accessed.
 */
export declare function safeStatSync(filePath: string): fs.Stats | null;
/**
 * Safely reads a file to string. Returns null if the file does not exist or cannot be read.
 */
export declare function safeReadFileSync(filePath: string, options?: SafeReadOptions): string | null;
/**
 * Safely removes a file or directory. Returns true if removed or didn't exist, false if removal threw.
 */
export declare function safeRmSync(targetPath: string, options?: SafeRmOptions): boolean;
/**
 * Executes an asynchronous function and returns its resolved value, or null if rejected.
 */
export declare function tryOrNullAsync<T>(fn: () => Promise<T>): Promise<T | null>;
/**
 * Executes an asynchronous function and returns its resolved value, or undefined if rejected.
 */
export declare function tryOrUndefinedAsync<T>(fn: () => Promise<T>): Promise<T | undefined>;
/**
 * Executes an asynchronous function and returns its resolved value, or a defaultValue if rejected.
 */
export declare function tryOrDefaultAsync<T>(fn: () => Promise<T>, defaultValue: T): Promise<T>;
/**
 * Executes an asynchronous function and returns an OperationResult.
 */
export declare function tryCatchAsync<T, E = Error>(fn: () => Promise<T>): Promise<SafeResult<T, E>>;
/**
 * Safely reads a file asynchronously. Returns null if reading fails or file does not exist.
 */
export declare function safeReadFileAsync(filePath: string, options?: SafeReadOptions): Promise<string | null>;
/**
 * Safely reads directory entries asynchronously. Returns null if reading fails.
 */
export declare function safeReaddirAsync(dirPath: string): Promise<fs.Dirent[] | null>;
//#endregion