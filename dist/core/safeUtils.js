import fs from "node:fs";
//#region src/core/safeUtils.ts
/**
* packages/auditor/src/core/safeUtils.ts
*
* CANONICAL SAFE EXECUTION & IO UTILITIES
* Provides robust, typed, functional helpers to execute potentially failing operations
* and optional IO without boilerplate, silent catch blocks, or suppressed errors.
*/
/**
* Executes a synchronous function and returns its result, or null if an exception is thrown.
*/
function tryOrNull(fn) {
	try {
		return fn();
	} catch {
		return null;
	}
}
/**
* Executes a synchronous function and returns its result, or undefined if an exception is thrown.
*/
function tryOrUndefined(fn) {
	try {
		return fn();
	} catch {
		return;
	}
}
/**
* Executes a synchronous function and returns its result, or a default value if an exception is thrown.
*/
function tryOrDefault(fn, defaultValue) {
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
function tryCatchSync(fn) {
	try {
		return {
			status: "success",
			ok: true,
			value: fn()
		};
	} catch (error) {
		return {
			status: "failure",
			ok: false,
			error
		};
	}
}
/**
* Safely parses a JSON string into a typed object.
* Returns undefined (or optional fallback) if parsing fails.
*/
function safeJsonParse(text, fallback) {
	try {
		return JSON.parse(text);
	} catch {
		return fallback;
	}
}
/**
* Safely checks if a file or directory exists and returns its fs.Stats, or null if it cannot be accessed.
*/
function safeStatSync(filePath) {
	try {
		return fs.statSync(filePath);
	} catch {
		return null;
	}
}
/**
* Safely reads a file to string. Returns null if the file does not exist or cannot be read.
*/
function safeReadFileSync(filePath, options) {
	try {
		return fs.readFileSync(filePath, options?.encoding ?? "utf-8");
	} catch {
		return null;
	}
}
/**
* Safely removes a file or directory. Returns true if removed or didn't exist, false if removal threw.
*/
function safeRmSync(targetPath, options) {
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
async function tryOrNullAsync(fn) {
	try {
		return await fn();
	} catch {
		return null;
	}
}
/**
* Executes an asynchronous function and returns its resolved value, or undefined if rejected.
*/
async function tryOrUndefinedAsync(fn) {
	try {
		return await fn();
	} catch {
		return;
	}
}
/**
* Executes an asynchronous function and returns its resolved value, or a defaultValue if rejected.
*/
async function tryOrDefaultAsync(fn, defaultValue) {
	try {
		return await fn();
	} catch {
		return defaultValue;
	}
}
/**
* Executes an asynchronous function and returns an OperationResult.
*/
async function tryCatchAsync(fn) {
	try {
		return {
			status: "success",
			ok: true,
			value: await fn()
		};
	} catch (error) {
		return {
			status: "failure",
			ok: false,
			error
		};
	}
}
/**
* Safely reads a file asynchronously. Returns null if reading fails or file does not exist.
*/
async function safeReadFileAsync(filePath, options) {
	try {
		return await fs.promises.readFile(filePath, options?.encoding ?? "utf-8");
	} catch {
		return null;
	}
}
/**
* Safely reads directory entries asynchronously. Returns null if reading fails.
*/
async function safeReaddirAsync(dirPath) {
	try {
		return await fs.promises.readdir(dirPath, { withFileTypes: true });
	} catch {
		return null;
	}
}
//#endregion
export { safeJsonParse, safeReadFileAsync, safeReadFileSync, safeReaddirAsync, safeRmSync, safeStatSync, tryCatchAsync, tryCatchSync, tryOrDefault, tryOrDefaultAsync, tryOrNull, tryOrNullAsync, tryOrUndefined, tryOrUndefinedAsync };
