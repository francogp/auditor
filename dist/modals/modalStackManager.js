import { createDomainSet } from "../core/domainCollections.js";
import { addToSetMap } from "./modalInternalUtils.js";
import { resolveModalMotionPreset } from "./modalMotionPresets.js";
import { CANONICAL_Z_LAYERS, resolveModalZLayers } from "./modalZLayers.js";
// src/modals/modalStackManager.ts
/**
* src/modals/modalStackManager.ts
*
* Framework-agnostic O(1) LIFO modal stack manager with customizable z-index
* allocation, instant active-top / simplification transfer, background
* occlusion tracking, dismissal guards, customizable motion presets, and
* two-phase exit animation handshakes.
*/
const DEFAULT_BACKDROP_OFFSET = 0;
const DEFAULT_CONTENT_OFFSET = 1;
const DEFAULT_Z_INDEX_OFFSET = 0;
const DEFAULT_OPEN_TIMEOUT_MS = 0;
const DEFAULT_CLOSE_TIMEOUT_MS = 800;
const INACTIVE_ORDER_SENTINEL = -1;
const USER_DISMISS_REASONS = createDomainSet([
	"escape",
	"backdrop",
	"close-button",
	"back-navigation"
]);
function defaultUidFactory() {
	return globalThis.crypto.randomUUID();
}
function noopDeferDone() {}
function isReasonAllowedByDismissMode(dismissMode, reason) {
	if (!USER_DISMISS_REASONS.has(reason)) return true;
	if (dismissMode === "none") return false;
	if (dismissMode === "closerequest" && reason === "backdrop") return false;
	return true;
}
function isPromiseLikeBoolean(value) {
	return typeof value === "object" && value !== null && "then" in value;
}
var ModalStackManager = class {
	zLayers;
	baseZIndex;
	stepZIndex;
	backdropOffset;
	contentOffset;
	ceilingZIndex;
	defaultDismissMode;
	defaultSingletonPolicy;
	defaultObscuresBackground;
	defaultMotionPreset;
	simplifyNonTop;
	animatedClose;
	holdClosingUntilFinalized;
	instantOnReducedMotion;
	openTimeoutMs;
	closeTimeoutMs;
	isReducedMotionFn;
	uidFactory;
	onCeilingExceeded;
	nextSlot = 0;
	orderedUids = [];
	recordsByUid = /* @__PURE__ */ new Map();
	uidsByKind = /* @__PURE__ */ new Map();
	pendingGuardUids = /* @__PURE__ */ new Set();
	closeWaitersByUid = /* @__PURE__ */ new Map();
	snapshotListeners = /* @__PURE__ */ new Set();
	lifecycleListeners = /* @__PURE__ */ new Map();
	cachedSnapshot;
	cachedEntriesByUid = /* @__PURE__ */ new Map();
	constructor(config = {}) {
		this.zLayers = resolveModalZLayers(config.zLayers);
		this.baseZIndex = config.baseZIndex ?? this.zLayers.MODAL;
		this.stepZIndex = config.stepZIndex ?? this.zLayers.MODAL_STEP;
		this.backdropOffset = config.backdropOffset ?? DEFAULT_BACKDROP_OFFSET;
		this.contentOffset = config.contentOffset ?? DEFAULT_CONTENT_OFFSET;
		const defaultCeilingHeadroom = CANONICAL_Z_LAYERS.TOOLTIP - CANONICAL_Z_LAYERS.MODAL;
		this.ceilingZIndex = config.ceilingZIndex !== void 0 ? config.ceilingZIndex : config.zLayers?.TOOLTIP !== void 0 || this.baseZIndex < this.zLayers.TOOLTIP ? this.zLayers.TOOLTIP : this.baseZIndex + defaultCeilingHeadroom;
		this.defaultDismissMode = config.defaultDismissMode ?? "any";
		this.defaultSingletonPolicy = config.defaultSingletonPolicy ?? "allow-multiple";
		this.defaultObscuresBackground = config.defaultObscuresBackground ?? true;
		this.defaultMotionPreset = resolveModalMotionPreset(config.defaultMotion);
		this.simplifyNonTop = config.simplifyNonTop ?? true;
		this.animatedClose = config.animatedClose ?? true;
		this.holdClosingUntilFinalized = config.holdClosingUntilFinalized ?? false;
		this.instantOnReducedMotion = config.instantOnReducedMotion ?? true;
		this.openTimeoutMs = config.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
		this.closeTimeoutMs = config.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
		this.isReducedMotionFn = config.isReducedMotion;
		this.uidFactory = config.uidFactory ?? defaultUidFactory;
		this.onCeilingExceeded = config.onCeilingExceeded;
		this.cachedSnapshot = this.computeSnapshot();
	}
	getZLayers() {
		return this.zLayers;
	}
	getDefaultMotionPreset() {
		return this.defaultMotionPreset;
	}
	setReducedMotionProvider(provider) {
		this.isReducedMotionFn = provider;
		if (this.orderedUids.length > 0) this.commitSnapshot();
	}
	getSnapshot() {
		return this.cachedSnapshot;
	}
	getByUid(modalUid) {
		return this.cachedEntriesByUid.get(modalUid);
	}
	hasUid(modalUid, options = {}) {
		const rec = this.recordsByUid.get(modalUid);
		if (!rec) return false;
		return options.includeClosing ? true : rec.phase !== "closing";
	}
	hasKind(kind, options = {}) {
		const set = this.uidsByKind.get(kind);
		if (!set || set.size === 0) return false;
		if (options.includeClosing) return true;
		for (const uid of set) {
			const rec = this.recordsByUid.get(uid);
			if (rec && rec.phase !== "closing") return true;
		}
		return false;
	}
	isActiveTop(modalUid) {
		return this.cachedSnapshot.activeTop?.modalUid === modalUid;
	}
	subscribe(listener) {
		this.snapshotListeners.add(listener);
		return () => {
			this.snapshotListeners.delete(listener);
		};
	}
	on(eventType, listener) {
		const bucket = addToSetMap(this.lifecycleListeners, eventType, listener);
		return () => {
			bucket.delete(listener);
		};
	}
	open(options) {
		const singletonResult = this.resolveSingletonOnOpen(options);
		if (singletonResult) return singletonResult;
		const modalUid = options.modalUid !== void 0 ? options.modalUid : this.uidFactory();
		if (this.recordsByUid.has(modalUid)) throw new Error(`Duplicate modalUid "${modalUid}" is already present in ModalStackManager`);
		const record = this.createModalRecord(modalUid, options);
		this.registerRecord(record);
		this.commitSnapshot();
		const entry = this.cachedEntriesByUid.get(modalUid);
		this.emitLifecycleEvent("open-start", entry);
		if (this.shouldShortCircuitMotion() || record.openTimeoutMs === 0 && entry.motion.enter.durationSec === 0) {
			this.completeOpen(modalUid);
			return this.cachedEntriesByUid.get(modalUid) ?? entry;
		}
		if (record.openTimeoutMs > 0) record.openTimer = globalThis.setTimeout(() => {
			record.openTimer = null;
			this.completeOpen(modalUid);
		}, record.openTimeoutMs);
		return this.cachedEntriesByUid.get(modalUid) ?? entry;
	}
	completeOpen(modalUid) {
		const record = this.recordsByUid.get(modalUid);
		if (!record || record.phase !== "opening") return false;
		this.clearOpenTimer(record);
		record.phase = "open";
		this.commitSnapshot();
		this.emitLifecycleEvent("open-end", this.cachedEntriesByUid.get(modalUid) ?? null);
		return true;
	}
	bringToFront(modalUid) {
		const record = this.recordsByUid.get(modalUid);
		if (!record || record.phase === "closing") return;
		if (this.isActiveTop(modalUid)) return this.cachedEntriesByUid.get(modalUid);
		const index = this.orderedUids.indexOf(modalUid);
		if (index !== INACTIVE_ORDER_SENTINEL) {
			this.orderedUids.splice(index, 1);
			this.orderedUids.push(modalUid);
		}
		this.assignNextSlot(record);
		this.commitSnapshot();
		const updated = this.cachedEntriesByUid.get(modalUid);
		this.emitLifecycleEvent("reordered", updated ?? null);
		return updated;
	}
	requestClose(modalUid, reason = "programmatic") {
		const outcome = this.evaluateCloseAttempt(modalUid, reason);
		if (typeof outcome === "boolean") return outcome;
		outcome.then(() => void 0, () => void 0);
		return false;
	}
	requestCloseAsync(modalUid, reason = "programmatic") {
		const outcome = this.evaluateCloseAttempt(modalUid, reason);
		return typeof outcome === "boolean" ? Promise.resolve(outcome) : outcome;
	}
	closeTop(reason = "escape") {
		const top = this.cachedSnapshot.activeTop;
		if (!top) return false;
		return this.requestClose(top.modalUid, reason);
	}
	closeTopAsync(reason = "escape") {
		const top = this.cachedSnapshot.activeTop;
		if (!top) return Promise.resolve(false);
		return this.requestCloseAsync(top.modalUid, reason);
	}
	closeByKind(kind, reason = "programmatic") {
		const uids = this.collectActiveUidsByKind(kind);
		let closedCount = 0;
		for (let i = uids.length - 1; i >= 0; i--) if (this.requestClose(uids[i], reason)) closedCount++;
		return closedCount;
	}
	finalizeClose(modalUid) {
		const record = this.recordsByUid.get(modalUid);
		if (!record) return false;
		const closingEntry = this.cachedEntriesByUid.get(modalUid) ?? null;
		const closeReason = record.closingReason;
		const closeResult = {
			modalUid: record.modalUid,
			kind: record.kind,
			reason: closeReason,
			meta: record.meta
		};
		this.unregisterRecord(record);
		if (this.recordsByUid.size === 0) this.nextSlot = 0;
		this.commitSnapshot();
		this.emitLifecycleEvent("close-end", closingEntry, closeReason);
		this.resolveCloseWaiters(modalUid, closeResult);
		if (this.recordsByUid.size === 0) this.emitLifecycleEvent("stack-empty", null);
		return true;
	}
	forceClose(modalUid, reason = "programmatic") {
		const record = this.recordsByUid.get(modalUid);
		if (!record) return false;
		record.closingReason = reason;
		return this.finalizeClose(modalUid);
	}
	clearAll(options = {}) {
		const immediate = options.immediate ?? true;
		const reason = options.reason ?? "clear-all";
		const snapshotUids = Array.from(this.orderedUids).reverse();
		for (const uid of snapshotUids) {
			const record = this.recordsByUid.get(uid);
			if (!record) continue;
			if (immediate) this.forceClose(uid, reason);
			else if (record.phase !== "closing") this.beginClosingPhase(record, reason);
		}
	}
	waitForClose(modalUid) {
		if (!this.recordsByUid.get(modalUid)) return Promise.reject(/* @__PURE__ */ new Error(`Cannot waitForClose on unknown modalUid "${modalUid}" in ModalStackManager`));
		return new Promise((resolve) => {
			addToSetMap(this.closeWaitersByUid, modalUid, resolve);
		});
	}
	dispose() {
		this.clearAll({
			immediate: true,
			reason: "clear-all"
		});
		this.snapshotListeners.clear();
		this.lifecycleListeners.clear();
		this.pendingGuardUids.clear();
	}
	resolveSingletonOnOpen(options) {
		const policy = options.singletonPolicy ?? this.defaultSingletonPolicy;
		if (policy === "allow-multiple") return null;
		const existingActiveUids = this.collectActiveUidsByKind(options.kind);
		if (existingActiveUids.length === 0) return null;
		const latestUid = existingActiveUids[existingActiveUids.length - 1];
		if (policy === "ignore-new") return this.cachedEntriesByUid.get(latestUid) ?? null;
		if (policy === "focus-existing") {
			const record = this.recordsByUid.get(latestUid);
			if (options.meta !== void 0) record.meta = options.meta;
			if (this.isActiveTop(latestUid)) {
				this.commitSnapshot();
				return this.cachedEntriesByUid.get(latestUid) ?? null;
			}
			return this.bringToFront(latestUid) ?? null;
		}
		for (let i = existingActiveUids.length - 1; i >= 0; i--) {
			const existingRecord = this.recordsByUid.get(existingActiveUids[i]);
			if (existingRecord && existingRecord.phase !== "closing") this.beginClosingPhase(existingRecord, "replace");
		}
		return null;
	}
	createModalRecord(modalUid, options) {
		const slot = this.nextSlot++;
		const zIndexOffset = options.zIndexOffset ?? DEFAULT_Z_INDEX_OFFSET;
		const autoBaseZ = this.computeNextMonotonicBaseZ(slot);
		const zIndex = (options.customZIndex ?? autoBaseZ) + zIndexOffset;
		this.notifyCeilingIfNeeded(modalUid, options.kind, slot, zIndex);
		return {
			modalUid,
			kind: options.kind,
			phase: "opening",
			slot,
			customZIndex: options.customZIndex,
			zIndexOffset,
			zIndex,
			backdropZIndex: zIndex + this.backdropOffset,
			contentZIndex: zIndex + this.contentOffset,
			dismissMode: options.dismissMode ?? this.defaultDismissMode,
			obscuresBackground: options.obscuresBackground ?? this.defaultObscuresBackground,
			motionInput: options.motion,
			animatedClose: options.animatedClose ?? this.animatedClose,
			holdClosingUntilFinalized: options.holdClosingUntilFinalized ?? this.holdClosingUntilFinalized,
			openTimeoutMs: options.openTimeoutMs ?? this.openTimeoutMs,
			closeTimeoutMs: options.closeTimeoutMs ?? this.closeTimeoutMs,
			meta: options.meta,
			canClose: options.canClose,
			onCloseAnimation: options.onCloseAnimation,
			closingReason: "programmatic",
			openTimer: null,
			closeTimer: null
		};
	}
	assignNextSlot(record) {
		const slot = this.nextSlot++;
		const monotonicZ = this.computeNextMonotonicBaseZ(slot, record.modalUid);
		const zIndex = (record.customZIndex !== void 0 ? Math.max(record.customZIndex, monotonicZ) : monotonicZ) + record.zIndexOffset;
		record.slot = slot;
		record.zIndex = zIndex;
		record.backdropZIndex = zIndex + this.backdropOffset;
		record.contentZIndex = zIndex + this.contentOffset;
		this.notifyCeilingIfNeeded(record.modalUid, record.kind, slot, zIndex);
	}
	computeNextMonotonicBaseZ(slot, excludeUid) {
		const slotZ = this.baseZIndex + slot * this.stepZIndex;
		let maxBaseZ = Number.NEGATIVE_INFINITY;
		let maxSurfaceZ = Number.NEGATIVE_INFINITY;
		for (const [uid, rec] of this.recordsByUid) {
			if (uid === excludeUid) continue;
			if (rec.zIndex > maxBaseZ) maxBaseZ = rec.zIndex;
			const surfaceTop = Math.max(rec.zIndex, rec.backdropZIndex, rec.contentZIndex);
			if (surfaceTop > maxSurfaceZ) maxSurfaceZ = surfaceTop;
		}
		if (!Number.isFinite(maxSurfaceZ) || slotZ > maxSurfaceZ) return slotZ;
		return Math.max(maxBaseZ + this.stepZIndex, maxSurfaceZ + 1);
	}
	notifyCeilingIfNeeded(modalUid, kind, slot, zIndex) {
		if (this.ceilingZIndex !== null && zIndex >= this.ceilingZIndex && this.onCeilingExceeded) this.onCeilingExceeded({
			modalUid,
			kind,
			slot,
			zIndex,
			ceilingZIndex: this.ceilingZIndex
		});
	}
	evaluateCloseAttempt(modalUid, reason) {
		const record = this.recordsByUid.get(modalUid);
		if (!record || record.phase === "closing" || this.pendingGuardUids.has(modalUid)) return false;
		if (!isReasonAllowedByDismissMode(record.dismissMode, reason)) {
			this.emitLifecycleEvent("close-prevented", this.cachedEntriesByUid.get(modalUid) ?? null, reason);
			return false;
		}
		if (!record.canClose) {
			this.beginClosingPhase(record, reason);
			return true;
		}
		const entrySnapshot = this.cachedEntriesByUid.get(modalUid);
		const guardResult = record.canClose({
			entry: entrySnapshot,
			reason
		});
		if (!isPromiseLikeBoolean(guardResult)) return this.applyGuardVerdict(modalUid, reason, guardResult);
		this.pendingGuardUids.add(modalUid);
		return guardResult.then((allowed) => this.applyGuardVerdict(modalUid, reason, allowed)).catch(() => this.applyGuardVerdict(modalUid, reason, false)).finally(() => {
			this.pendingGuardUids.delete(modalUid);
		});
	}
	applyGuardVerdict(modalUid, reason, allowed) {
		const record = this.recordsByUid.get(modalUid);
		if (!record || record.phase === "closing") return false;
		if (!allowed) {
			this.emitLifecycleEvent("close-prevented", this.cachedEntriesByUid.get(modalUid) ?? null, reason);
			return false;
		}
		this.beginClosingPhase(record, reason);
		return true;
	}
	beginClosingPhase(record, reason) {
		this.clearOpenTimer(record);
		record.phase = "closing";
		record.closingReason = reason;
		this.commitSnapshot();
		const closingEntry = this.cachedEntriesByUid.get(record.modalUid);
		const allowAsyncExit = record.animatedClose && !this.shouldShortCircuitMotion();
		let deferred = allowAsyncExit && record.holdClosingUntilFinalized;
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			this.finalizeClose(record.modalUid);
		};
		const claimDefer = () => {
			if (!allowAsyncExit) return noopDeferDone;
			deferred = true;
			return done;
		};
		if (allowAsyncExit && record.onCloseAnimation) {
			deferred = true;
			record.onCloseAnimation(closingEntry, done);
		}
		this.emitLifecycleEvent("close-start", closingEntry, reason, claimDefer);
		if (!deferred || settled || !this.recordsByUid.has(record.modalUid)) {
			if (!settled && this.recordsByUid.has(record.modalUid)) this.finalizeClose(record.modalUid);
			return;
		}
		if (record.closeTimeoutMs > 0) record.closeTimer = globalThis.setTimeout(() => {
			record.closeTimer = null;
			done();
		}, record.closeTimeoutMs);
	}
	shouldShortCircuitMotion() {
		return Boolean(this.instantOnReducedMotion && this.isReducedMotionFn?.());
	}
	registerRecord(record) {
		this.orderedUids.push(record.modalUid);
		this.recordsByUid.set(record.modalUid, record);
		addToSetMap(this.uidsByKind, record.kind, record.modalUid);
	}
	unregisterRecord(record) {
		this.clearOpenTimer(record);
		this.clearCloseTimer(record);
		this.recordsByUid.delete(record.modalUid);
		this.pendingGuardUids.delete(record.modalUid);
		const index = this.orderedUids.indexOf(record.modalUid);
		if (index !== INACTIVE_ORDER_SENTINEL) this.orderedUids.splice(index, 1);
		const kindBucket = this.uidsByKind.get(record.kind);
		if (kindBucket) {
			kindBucket.delete(record.modalUid);
			if (kindBucket.size === 0) this.uidsByKind.delete(record.kind);
		}
	}
	collectActiveUidsByKind(kind) {
		const bucket = this.uidsByKind.get(kind);
		if (!bucket || bucket.size === 0) return [];
		const active = [];
		for (const uid of this.orderedUids) {
			if (!bucket.has(uid)) continue;
			const rec = this.recordsByUid.get(uid);
			if (rec && rec.phase !== "closing") active.push(uid);
		}
		return active;
	}
	clearOpenTimer(record) {
		if (record.openTimer !== null) {
			globalThis.clearTimeout(record.openTimer);
			record.openTimer = null;
		}
	}
	clearCloseTimer(record) {
		if (record.closeTimer !== null) {
			globalThis.clearTimeout(record.closeTimer);
			record.closeTimer = null;
		}
	}
	resolveCloseWaiters(modalUid, result) {
		const waiters = this.closeWaitersByUid.get(modalUid);
		if (!waiters) return;
		this.closeWaitersByUid.delete(modalUid);
		for (const resolve of waiters) resolve(result);
	}
	commitSnapshot() {
		this.cachedSnapshot = this.computeSnapshot();
		for (const listener of this.snapshotListeners) listener(this.cachedSnapshot);
	}
	computeSnapshot() {
		let activeTopUid = null;
		let highestZIndex = this.baseZIndex;
		const reducedMotion = this.shouldShortCircuitMotion();
		for (const uid of this.orderedUids) {
			const rec = this.recordsByUid.get(uid);
			if (rec.zIndex > highestZIndex) highestZIndex = rec.zIndex;
			if (rec.phase !== "closing") activeTopUid = uid;
		}
		const entries = [];
		const activeEntries = [];
		const nextEntryMap = /* @__PURE__ */ new Map();
		let obscuresBackground = false;
		for (const uid of this.orderedUids) {
			const rec = this.recordsByUid.get(uid);
			const isClosing = rec.phase === "closing";
			const isActiveTop = !isClosing && uid === activeTopUid;
			const isSimplified = this.simplifyNonTop && !isClosing && !isActiveTop;
			const activeOrder = isClosing ? INACTIVE_ORDER_SENTINEL : activeEntries.length;
			const motion = resolveModalMotionPreset(rec.motionInput, {
				defaultPreset: this.defaultMotionPreset,
				reducedMotion
			});
			const entry = Object.freeze({
				modalUid: rec.modalUid,
				kind: rec.kind,
				phase: rec.phase,
				slot: rec.slot,
				zIndex: rec.zIndex,
				backdropZIndex: rec.backdropZIndex,
				contentZIndex: rec.contentZIndex,
				dismissMode: rec.dismissMode,
				obscuresBackground: rec.obscuresBackground,
				isActiveTop,
				isSimplified,
				activeOrder,
				motion,
				meta: rec.meta
			});
			entries.push(entry);
			nextEntryMap.set(uid, entry);
			if (!isClosing) {
				activeEntries.push(entry);
				if (rec.obscuresBackground) obscuresBackground = true;
			}
		}
		this.cachedEntriesByUid = nextEntryMap;
		const activeTop = activeTopUid ? nextEntryMap.get(activeTopUid) ?? null : null;
		return Object.freeze({
			entries: Object.freeze(entries),
			activeEntries: Object.freeze(activeEntries),
			activeTop,
			totalCount: entries.length,
			activeCount: activeEntries.length,
			hasOpenModals: activeEntries.length > 0,
			obscuresBackground,
			highestZIndex
		});
	}
	emitLifecycleEvent(type, entry, reason, deferCloseFactory) {
		const listeners = this.lifecycleListeners.get(type);
		if (!listeners || listeners.size === 0) return;
		const event = {
			type,
			entry,
			reason,
			snapshot: this.cachedSnapshot,
			deferClose: deferCloseFactory ?? (() => noopDeferDone)
		};
		for (const listener of listeners) listener(event);
	}
};
function createModalStack(config = {}) {
	return new ModalStackManager(config);
}
export { ModalStackManager, createModalStack };
