// src/analyzers/nativePaths/nativePathTypes.ts
const NATIVE_PATH_RULES = [
	"unsafe-path-concat",
	"unsanitized-env-argv-path",
	"untrusted-url-fetch",
	"hardcoded-slash-path",
	"homebrew-path-manipulation",
	"homebrew-path-parsing",
	"homebrew-path-containment",
	"homebrew-file-url",
	"homebrew-url-parsing"
];
/** Rules that only apply where `node:path` / `node:url` are available. */
const NODE_ONLY_RULES = /* @__PURE__ */ new Set([
	"unsafe-path-concat",
	"unsanitized-env-argv-path",
	"hardcoded-slash-path",
	"homebrew-path-manipulation",
	"homebrew-path-parsing",
	"homebrew-path-containment",
	"homebrew-file-url"
]);
export { NATIVE_PATH_RULES, NODE_ONLY_RULES };
