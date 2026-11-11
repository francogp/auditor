import fs from 'node:fs';
import path from 'node:path';

import { JSDOM } from 'jsdom';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vite-plus/test';

import {
  DEFAULT_MODAL_MOTION_PRESETS,
  ModalAnimationController,
  ModalDomController,
  createBackdropPointerGuard,
  createGsapModalDriver,
  createModalSequenceQueue,
  createModalStack,
  createWaapiModalDriver,
  isEditableEventTarget,
  resolveModalCssVars,
  resolveModalDomIds,
  resolveModalMotionPreset,
  resolveModalPlacementMotionPreset,
  resolveModalStructuralStyles,
  type GsapEngineLike,
  type GsapTweenVars,
  type ModalWaapiKeyframe
} from '../src/modals/index.ts';

type UiModalKind = 'ModalA' | 'ModalB' | 'ModalC' | 'Settings' | 'Drawer' | 'BattleReplay';

interface MockWaapiAnimation {
  readonly keyframes: readonly ModalWaapiKeyframe[];
  readonly duration: number;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  cancelled: boolean;
  cancel(): void;
  finish(): void;
}

function createMockWaapiElement(): {
  readonly element: {
    animate(
      keyframes: readonly ModalWaapiKeyframe[],
      options: {
        readonly duration: number;
        readonly easing: string;
        readonly fill: 'forwards' | 'none';
      }
    ): MockWaapiAnimation;
  };
  readonly animations: MockWaapiAnimation[];
} {
  const animations: MockWaapiAnimation[] = [];
  return {
    animations,
    element: {
      animate(keyframes, options): MockWaapiAnimation {
        const anim: MockWaapiAnimation = {
          keyframes,
          duration: options.duration,
          onfinish: null,
          oncancel: null,
          cancelled: false,
          cancel(): void {
            this.cancelled = true;
          },
          finish(): void {
            this.onfinish?.();
          }
        };
        animations.push(anim);
        return anim;
      }
    }
  };
}

describe('ModalDomController, Light-Dismiss Pointer Guard, Motion Presets & Isomorphic Purity', () => {
  describe('Single Global Escape Routing & Reduced Motion Media Query', () => {
    it('closes only activeTop on Escape, ignores defaultPrevented/IME composition, and detaches cleanly on dispose', () => {
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://app.example.test/dashboard'
      });
      let mediaReduced = false;
      Object.defineProperty(dom.window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ matches: mediaReduced }))
      });

      const stack = createModalStack<UiModalKind>({ animatedClose: false });
      const controller = new ModalDomController({
        stack,
        target: dom.window
      });

      stack.open({ kind: 'ModalA', modalUid: 'a' });
      stack.open({ kind: 'ModalB', modalUid: 'b' });
      stack.open({ kind: 'ModalC', modalUid: 'c' });

      // Composing Escape (IME) is ignored
      const imeEsc = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
        isComposing: true
      });
      dom.window.dispatchEvent(imeEsc);
      expect(stack.getSnapshot().activeCount).toBe(3);

      // Already defaultPrevented Escape is ignored
      const preHandledEsc = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true
      });
      preHandledEsc.preventDefault();
      dom.window.dispatchEvent(preHandledEsc);
      expect(stack.getSnapshot().activeCount).toBe(3);

      // Genuine Escape closes ONLY top modal C and calls preventDefault()
      const validEsc = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true
      });
      dom.window.dispatchEvent(validEsc);
      expect(validEsc.defaultPrevented).toBe(true);
      expect(stack.hasUid('c')).toBe(false);
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('b');

      // Reduced motion synchronization from matchMedia
      mediaReduced = true;
      const reducedEntry = stack.open({ kind: 'ModalC', modalUid: 'c-rm', openTimeoutMs: 400 });
      expect(reducedEntry.phase).toBe('open');
      expect(reducedEntry.motion.name).toBe('none');

      // After dispose(), Escape no longer mutates stack
      controller.dispose();
      controller.dispose();
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      );
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('c-rm');
      dom.window.close();
    });
  });

  describe('Two-Step Backdrop Pointer Guard (modern-web-guidance Light-Dismiss)', () => {
    it('prevents text-selection drag releases, secondary clicks, and non-top clicks while allowing genuine backdrop light-dismiss', () => {
      const stack = createModalStack<UiModalKind>({ animatedClose: false });
      stack.open({ kind: 'ModalA', modalUid: 'bottom' });
      stack.open({ kind: 'ModalB', modalUid: 'top' });

      const backdropNode = { nodeType: 'backdrop' };
      const cardNode = { nodeType: 'card' };

      const bottomGuard = createBackdropPointerGuard({
        stack,
        getModalUid: () => 'bottom'
      });
      const topGuard = createBackdropPointerGuard({
        stack,
        getModalUid: () => 'top'
      });

      // 1. Drag from inside card to outside backdrop -> MUST NOT close
      topGuard.onPointerDown({ button: 0, target: cardNode, currentTarget: backdropNode });
      expect(
        topGuard.onPointerUp({ button: 0, target: backdropNode, currentTarget: backdropNode })
      ).toBe(false);
      expect(stack.hasUid('top')).toBe(true);

      // 2. Drag from backdrop into card -> MUST NOT close
      topGuard.onPointerDown({ button: 0, target: backdropNode, currentTarget: backdropNode });
      expect(
        topGuard.onPointerUp({ button: 0, target: cardNode, currentTarget: backdropNode })
      ).toBe(false);
      expect(stack.hasUid('top')).toBe(true);

      // 3. Right click (button: 2) on backdrop -> MUST NOT close
      topGuard.onPointerDown({ button: 2, target: backdropNode, currentTarget: backdropNode });
      expect(
        topGuard.onPointerUp({ button: 2, target: backdropNode, currentTarget: backdropNode })
      ).toBe(false);

      // 4. pointercancel / reset disarms pending click
      topGuard.onPointerDown({ button: 0, target: backdropNode, currentTarget: backdropNode });
      topGuard.onPointerCancel();
      expect(
        topGuard.onPointerUp({ button: 0, target: backdropNode, currentTarget: backdropNode })
      ).toBe(false);

      topGuard.onPointerDown({ button: 0, target: backdropNode, currentTarget: backdropNode });
      topGuard.reset();
      expect(
        topGuard.onPointerUp({ button: 0, target: backdropNode, currentTarget: backdropNode })
      ).toBe(false);

      // 5. Clicking bottom modal's backdrop while top modal is active -> MUST NOT close bottom
      bottomGuard.onPointerDown({ button: 0, target: backdropNode, currentTarget: backdropNode });
      expect(
        bottomGuard.onPointerUp({ button: 0, target: backdropNode, currentTarget: backdropNode })
      ).toBe(false);
      expect(stack.hasUid('bottom')).toBe(true);

      // 6. Genuine primary pointerdown + pointerup on activeTop backdrop -> CLOSES top modal
      topGuard.onPointerDown({ button: 0, target: backdropNode, currentTarget: backdropNode });
      expect(
        topGuard.onPointerUp({ button: 0, target: backdropNode, currentTarget: backdropNode })
      ).toBe(true);
      expect(stack.hasUid('top')).toBe(false);
      expect(stack.getSnapshot().activeTop?.modalUid).toBe('bottom');
    });
  });

  describe('Ported PokeBorrador Suite: useBackNavigation (History Trap, Mouse Side Buttons & Editable Guard)', () => {
    it('injects history trap, blocks mouse buttons 3/4 and browser history keys, preserves editable Backspace, and handles popstate priority', () => {
      const dom = new JSDOM(
        '<!doctype html><html><body>' +
          '<div id="surface"></div>' +
          '<input id="text-input" type="text" />' +
          '<textarea id="notes"></textarea>' +
          '<div id="rich-editor" contenteditable="true"></div>' +
          '</body></html>',
        { url: 'https://game.example.test/play' }
      );
      const pushStateSpy = vi.spyOn(dom.window.history, 'pushState');
      let isChatDrawerOpen = true;

      const stack = createModalStack<UiModalKind>({ animatedClose: false });
      const controller = new ModalDomController({
        stack,
        target: dom.window,
        backNavigation: {
          enabled: true,
          guardStateKey: 'pokeBackGuard',
          onBeforePopStateDismiss: () => {
            if (isChatDrawerOpen) {
              isChatDrawerOpen = false;
              return true;
            }
            return false;
          }
        }
      });

      // 1. Initial history guard trap pushed on initialization
      expect(pushStateSpy).toHaveBeenCalledTimes(1);
      expect(pushStateSpy).toHaveBeenLastCalledWith(
        { pokeBackGuard: true },
        '',
        'https://game.example.test/play'
      );

      // 2. Mouse buttons 3 & 4 blocked on mouseup and auxclick; primary button 0 untouched
      const mouseBackButton = 3;
      const mouseForwardButton = 4;
      const sideUp = new dom.window.MouseEvent('mouseup', {
        button: mouseBackButton,
        cancelable: true
      });
      const sideAux = new dom.window.MouseEvent('auxclick', {
        button: mouseForwardButton,
        cancelable: true
      });
      const leftClick = new dom.window.MouseEvent('mouseup', { button: 0, cancelable: true });

      dom.window.dispatchEvent(sideUp);
      dom.window.dispatchEvent(sideAux);
      dom.window.dispatchEvent(leftClick);
      expect(sideUp.defaultPrevented).toBe(true);
      expect(sideAux.defaultPrevented).toBe(true);
      expect(leftClick.defaultPrevented).toBe(false);

      // 3. Alt+ArrowLeft, BrowserBack, and Backspace on <div> are blocked; Backspace inside inputs is allowed
      const surfaceDiv = dom.window.document.getElementById('surface')!;
      const textInput = dom.window.document.getElementById('text-input')!;
      const notesArea = dom.window.document.getElementById('notes')!;
      const richEditor = dom.window.document.getElementById('rich-editor')!;

      expect(isEditableEventTarget(null)).toBe(false);
      expect(isEditableEventTarget(surfaceDiv)).toBe(false);
      expect(isEditableEventTarget(textInput)).toBe(true);
      expect(isEditableEventTarget(notesArea)).toBe(true);
      expect(isEditableEventTarget(richEditor)).toBe(true);

      const altLeft = new dom.window.KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        altKey: true,
        bubbles: true,
        cancelable: true
      });
      surfaceDiv.dispatchEvent(altLeft);
      expect(altLeft.defaultPrevented).toBe(true);

      const browserBack = new dom.window.KeyboardEvent('keydown', {
        key: 'BrowserBack',
        bubbles: true,
        cancelable: true
      });
      surfaceDiv.dispatchEvent(browserBack);
      expect(browserBack.defaultPrevented).toBe(true);

      const divBackspace = new dom.window.KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true
      });
      surfaceDiv.dispatchEvent(divBackspace);
      expect(divBackspace.defaultPrevented).toBe(true);

      for (const editable of [textInput, notesArea, richEditor]) {
        const inputBackspace = new dom.window.KeyboardEvent('keydown', {
          key: 'Backspace',
          bubbles: true,
          cancelable: true
        });
        editable.dispatchEvent(inputBackspace);
        expect(inputBackspace.defaultPrevented).toBe(false);
      }

      // 4. popstate re-injects trap, dismisses secondary chat drawer first, then closes Settings modal
      stack.open({ kind: 'Settings', modalUid: 'settings-1' });
      let lastCloseReason = '';
      stack.on('close-end', (ev) => {
        lastCloseReason = ev.reason ?? '';
      });

      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      expect(pushStateSpy).toHaveBeenCalledTimes(2);
      expect(isChatDrawerOpen).toBe(false);
      expect(stack.hasKind('Settings')).toBe(true);

      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      expect(pushStateSpy).toHaveBeenCalledTimes(3);
      expect(stack.hasKind('Settings')).toBe(false);
      expect(lastCloseReason).toBe('back-navigation');

      controller.dispose();
      dom.window.close();
    });

    it('preserves existing Vue Router history.state keys, tolerates restricted pushState errors, runs onUnhandledPopState AFTER activeTop modal closes, and intercepts mousedown/pointerdown side buttons in capture phase', () => {
      const dom = new JSDOM(
        '<!doctype html><html><body><button id="inner-btn"></button></body></html>',
        {
          url: 'https://game.example.test/adventure'
        }
      );
      // Simulate pre-existing vue-router history.state metadata
      dom.window.history.replaceState(
        { current: '/adventure', position: 4, scroll: { left: 0, top: 0 } },
        '',
        'https://game.example.test/adventure'
      );

      let isSecondaryChatOpen = true;
      const stack = createModalStack<UiModalKind>({ animatedClose: false });
      const controller = new ModalDomController({
        stack,
        target: dom.window,
        backNavigation: {
          enabled: true,
          guardStateKey: 'pokevicioGuard',
          onUnhandledPopState: () => {
            if (isSecondaryChatOpen) {
              isSecondaryChatOpen = false;
              return true;
            }
            return false;
          }
        }
      });

      // 1. Existing vue-router state keys MUST be preserved alongside pokevicioGuard
      expect(dom.window.history.state).toEqual({
        current: '/adventure',
        position: 4,
        scroll: { left: 0, top: 0 },
        pokevicioGuard: true
      });

      // 2. Mousedown / pointerdown with mouse button 3 on inner child is intercepted in capture phase BEFORE child bubble listeners fire
      const innerBtn = dom.window.document.getElementById('inner-btn')!;
      let bubbleReached = false;
      const onInnerMouseDown = (): void => {
        bubbleReached = true;
      };
      innerBtn.addEventListener('mousedown', onInnerMouseDown);
      const sideMouseDown = new dom.window.MouseEvent('mousedown', {
        button: 3,
        bubbles: true,
        cancelable: true
      });
      innerBtn.dispatchEvent(sideMouseDown);
      innerBtn.removeEventListener('mousedown', onInnerMouseDown);
      expect(sideMouseDown.defaultPrevented).toBe(true);
      expect(bubbleReached).toBe(false);

      // 3. When a modal is open ABOVE secondary chat panel, popstate closes the modal FIRST, and only closes secondary chat on the NEXT popstate
      stack.open({ kind: 'Settings', modalUid: 'settings-top' });
      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      expect(stack.hasKind('Settings')).toBe(false);
      expect(isSecondaryChatOpen).toBe(true);

      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      expect(isSecondaryChatOpen).toBe(false);

      // 4. Restricted pushState throwing SecurityError does not crash controller
      vi.spyOn(dom.window.history, 'pushState').mockImplementation(() => {
        throw new Error('SecurityError: pushState throttled');
      });
      expect(() =>
        dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'))
      ).not.toThrow();

      controller.dispose();
      dom.window.close();
    });
  });

  describe('Ported PokeBorrador Suite: DOM IDs, Surface Placement Motion, Custom Styles & Animation Drivers', () => {
    it('generates deterministic ARIA + close-btn DOM IDs, maps directional placements, and customizes motion/structural styles without hardcoding', () => {
      const ids = resolveModalDomIds('  battle-replay-modal  ');
      expect(ids).toEqual({
        modalId: 'battle-replay-modal',
        titleId: 'battle-replay-modal-title',
        bodyId: 'battle-replay-modal-body',
        closeButtonId: 'battle-replay-modal-close-btn'
      });
      expect(() => resolveModalDomIds('   ')).toThrow(/non-empty baseId/);

      // Ported getModalTweenPosition directional expectations
      expect(resolveModalPlacementMotionPreset('down')).toBe('slide-up');
      expect(DEFAULT_MODAL_MOTION_PRESETS['slide-up'].panelFrom.y).toBe('100%');
      expect(resolveModalPlacementMotionPreset('top')).toBe('slide-down');
      expect(DEFAULT_MODAL_MOTION_PRESETS['slide-down'].panelFrom.y).toBe('-100%');
      expect(resolveModalPlacementMotionPreset('left')).toBe('slide-left');
      expect(DEFAULT_MODAL_MOTION_PRESETS['slide-left'].panelFrom.x).toBe('-100%');
      expect(resolveModalPlacementMotionPreset('side-right')).toBe('slide-right');
      expect(DEFAULT_MODAL_MOTION_PRESETS['slide-right'].panelFrom.x).toBe('100%');
      expect(resolveModalPlacementMotionPreset('center')).toBe('scale-fade');
      expect(DEFAULT_MODAL_MOTION_PRESETS['scale-fade'].panelFrom).toMatchObject({
        scale: 0.96,
        y: 10
      });
      expect(resolveModalPlacementMotionPreset('fullscreen')).toBe('fade');

      // Stack-level custom defaultMotion cascading into per-modal partial overrides
      const customEnterSec = 0.42;
      const customShakePx = 14;
      const stack = createModalStack<UiModalKind>({
        zLayers: { MODAL: 5000, MODAL_STEP: 20 },
        defaultMotion: {
          basePreset: 'fade',
          enter: { durationSec: customEnterSec, ease: 'expo.out' }
        },
        holdClosingUntilFinalized: true
      });
      expect(stack.getDefaultMotionPreset().enter.durationSec).toBe(customEnterSec);

      const drawer = stack.open({
        kind: 'Drawer',
        modalUid: 'drawer-1',
        motion: {
          panelFrom: { x: '120%' },
          prevented: { offsetPx: customShakePx, cycles: 3 }
        }
      });
      expect(drawer.motion.name).toBe('custom');
      expect(drawer.motion.enter.durationSec).toBe(customEnterSec);
      expect(drawer.motion.panelFrom.x).toBe('120%');
      expect(drawer.motion.panelExitTo.x).toBe('120%');
      expect(drawer.motion.prevented.offsetPx).toBe(customShakePx);
      expect(resolveModalMotionPreset('slide-up', { reducedMotion: true }).name).toBe('none');

      // Customizable structural styles & CSS variables (default and custom prefix)
      const cssVars = resolveModalCssVars(drawer);
      expect(cssVars).toEqual({
        '--modal-z': '5000',
        '--modal-backdrop-z': '5000',
        '--modal-content-z': '5001'
      });
      expect(resolveModalCssVars(drawer, { prefix: 'app-dialog' })).toEqual({
        '--app-dialog-z': '5000',
        '--app-dialog-backdrop-z': '5000',
        '--app-dialog-content-z': '5001'
      });

      const openStyles = resolveModalStructuralStyles(drawer, {
        position: 'absolute',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        fallbackZIndexVar: 'var(--custom-modal-layer)'
      });
      expect(openStyles.backdropStyle.position).toBe('absolute');
      expect(openStyles.backdropStyle.alignItems).toBe('flex-end');
      expect(openStyles.backdropStyle.pointerEvents).toBe('auto');
      expect(openStyles.backdropStyle.zIndex).toBe(
        'var(--modal-backdrop-z, var(--custom-modal-layer))'
      );
      expect(openStyles.contentStyle.zIndex).toBe(
        'var(--modal-content-z, var(--custom-modal-layer))'
      );

      stack.requestClose('drawer-1', 'escape');
      const closingStyles = resolveModalStructuralStyles(stack.getByUid('drawer-1')!);
      expect(closingStyles.backdropStyle.pointerEvents).toBe('none');
      expect(closingStyles.contentStyle.pointerEvents).toBe('none');
      stack.dispose();
    });

    it('drives full lifecycle animations via createWaapiModalDriver and ModalAnimationController', () => {
      const stack = createModalStack<UiModalKind>({ closeTimeoutMs: 5000 });
      const animController = new ModalAnimationController({
        stack,
        driver: createWaapiModalDriver()
      });

      const backdropMock = createMockWaapiElement();
      const panelMock = createMockWaapiElement();

      const entry = stack.open({
        kind: 'BattleReplay',
        modalUid: 'replay-1',
        dismissMode: 'closerequest'
      });
      expect(entry.phase).toBe('opening');

      const unbind = animController.bindSurface('replay-1', {
        backdrop: backdropMock.element,
        panel: panelMock.element
      });

      // Entrance WAAPI animations started on both backdrop and panel
      expect(backdropMock.animations).toHaveLength(1);
      expect(panelMock.animations).toHaveLength(1);
      panelMock.animations[0]!.finish();
      expect(stack.getByUid('replay-1')?.phase).toBe('open');

      // Backdrop click vetoed by 'closerequest' triggers prevented shake animation
      expect(stack.requestClose('replay-1', 'backdrop')).toBe(false);
      expect(panelMock.animations).toHaveLength(2);

      // Escape triggers close-start, defers unmount until exit WAAPI animation finishes
      expect(stack.requestClose('replay-1', 'escape')).toBe(true);
      expect(stack.hasUid('replay-1', { includeClosing: true })).toBe(true);
      expect(panelMock.animations).toHaveLength(3);

      panelMock.animations[2]!.finish();
      expect(stack.hasUid('replay-1', { includeClosing: true })).toBe(false);

      // Graceful sync fallback when element has no .animate() (SSR / headless DOM)
      stack.open({ kind: 'ModalA', modalUid: 'headless-1' });
      animController.bindSurface('headless-1', { panel: {} });
      expect(stack.getByUid('headless-1')?.phase).toBe('open');
      expect(stack.requestClose('headless-1', 'escape')).toBe(true);
      expect(stack.hasUid('headless-1', { includeClosing: true })).toBe(false);

      // Declarative child SFC passing motion override in bindSurface() animates with child preset ('slide-left')
      stack.open({ kind: 'Drawer', modalUid: 'late-drawer' });
      const drawerPanelMock = createMockWaapiElement();
      animController.bindSurface(
        'late-drawer',
        { panel: drawerPanelMock.element },
        { motion: 'slide-left' }
      );
      expect(stack.getByUid('late-drawer')?.motion.name).toBe('slide-left');
      expect(drawerPanelMock.animations[0]?.keyframes[0]?.transform).toContain('-100%');
      drawerPanelMock.animations[0]!.finish();

      unbind();
      animController.dispose();
    });

    it('drives scoped GSAP tweens via createGsapModalDriver and reverts gsap.context() on close-end', () => {
      const revertedScopes: unknown[] = [];
      const fromToCalls: { target: unknown; fromVars: GsapTweenVars; toVars: GsapTweenVars }[] = [];
      const toCalls: { target: unknown; toVars: GsapTweenVars }[] = [];

      const mockGsap: GsapEngineLike = {
        context(setup, scope) {
          setup();
          return {
            revert(): void {
              revertedScopes.push(scope);
            }
          };
        },
        fromTo(target, fromVars, toVars) {
          fromToCalls.push({ target, fromVars, toVars });
          return {};
        },
        to(target, toVars) {
          toCalls.push({ target, toVars });
          return {};
        }
      };

      const stack = createModalStack<UiModalKind>({ closeTimeoutMs: 5000 });
      const animController = new ModalAnimationController({
        stack,
        driver: createGsapModalDriver(mockGsap)
      });

      const containerEl = { id: 'modal-host' };
      const backdropEl = { id: 'backdrop' };
      const panelEl = { id: 'panel' };

      stack.open({ kind: 'ModalA', modalUid: 'gsap-1', dismissMode: 'closerequest' });
      animController.bindSurface('gsap-1', {
        container: containerEl,
        backdrop: backdropEl,
        panel: panelEl
      });

      // Open: 2 fromTo calls (backdrop + panel); completing panel transitions to 'open'
      expect(fromToCalls).toHaveLength(2);
      fromToCalls[1]!.toVars.onComplete?.();
      expect(stack.getByUid('gsap-1')?.phase).toBe('open');

      // Prevented shake oscillates across configured cycles inside gsap.context() and settles back to x: 0
      expect(stack.requestClose('gsap-1', 'backdrop')).toBe(false);
      expect(fromToCalls).toHaveLength(3);
      expect(fromToCalls[2]!.fromVars).toEqual({ x: -6 });
      expect(fromToCalls[2]!.toVars.repeat).toBe(3);
      expect(fromToCalls[2]!.toVars.yoyo).toBe(true);
      fromToCalls[2]!.toVars.onComplete?.();
      expect(toCalls).toHaveLength(1);
      expect(toCalls[0]!.toVars.x).toBe(0);

      // Animated close: 2 additional gsap.to calls; completing panel finalizes close AND calls ctx.revert()
      expect(stack.requestClose('gsap-1', 'escape')).toBe(true);
      expect(toCalls).toHaveLength(3);
      expect(revertedScopes).toHaveLength(0);

      toCalls[2]!.toVars.onComplete?.();
      expect(stack.hasUid('gsap-1', { includeClosing: true })).toBe(false);
      expect(revertedScopes).toHaveLength(3);

      animController.dispose();
    });

    it('mounts, updates, simplifies, and unmounts stacked modal DOM nodes in a simulated reactive jsdom host', () => {
      const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
      const hostRoot = dom.window.document.getElementById('modal-root')!;
      const stack = createModalStack<UiModalKind, { readonly title: string }>({
        holdClosingUntilFinalized: true
      });
      const renderedNodes = new Map<string, HTMLElement>();

      const unsubscribe = stack.subscribe((snapshot) => {
        const presentUids = new Set(snapshot.entries.map((e) => e.modalUid));
        for (const [uid, existingNode] of Array.from(renderedNodes.entries())) {
          if (!presentUids.has(uid)) {
            existingNode.remove();
            renderedNodes.delete(uid);
          }
        }
        for (const entry of snapshot.entries) {
          const domIds = resolveModalDomIds(entry.modalUid);
          const vars = resolveModalCssVars(entry);
          let wrapper = renderedNodes.get(entry.modalUid);
          if (!wrapper) {
            wrapper = dom.window.document.createElement('div');
            wrapper.id = domIds.modalId;
            wrapper.setAttribute('role', 'dialog');
            wrapper.setAttribute('aria-labelledby', domIds.titleId);
            wrapper.setAttribute('aria-describedby', domIds.bodyId);

            const heading = dom.window.document.createElement('h2');
            heading.id = domIds.titleId;
            heading.textContent = entry.meta?.title ?? entry.kind;

            const body = dom.window.document.createElement('div');
            body.id = domIds.bodyId;

            const closeBtn = dom.window.document.createElement('button');
            closeBtn.id = domIds.closeButtonId;
            closeBtn.type = 'button';
            closeBtn.addEventListener(
              'click',
              () => {
                stack.requestClose(entry.modalUid, 'close-button');
              },
              { once: true }
            );

            wrapper.append(heading, body, closeBtn);
            hostRoot.appendChild(wrapper);
            renderedNodes.set(entry.modalUid, wrapper);
          }
          wrapper.dataset['phase'] = entry.phase;
          wrapper.dataset['simplified'] = String(entry.isSimplified);
          for (const [varName, varVal] of Object.entries(vars)) {
            wrapper.style.setProperty(varName, varVal);
          }
        }
      });

      stack.open({
        kind: 'BattleReplay',
        modalUid: 'replay-host',
        meta: { title: 'Battle Replay #42' }
      });
      stack.open({
        kind: 'Settings',
        modalUid: 'settings-host',
        meta: { title: 'Audio Settings' }
      });

      const replayEl = dom.window.document.getElementById('replay-host')!;
      const settingsEl = dom.window.document.getElementById('settings-host')!;
      expect(replayEl.getAttribute('aria-labelledby')).toBe('replay-host-title');
      expect(replayEl.dataset['simplified']).toBe('true');
      expect(replayEl.style.getPropertyValue('--modal-z')).toBe('11000');
      expect(settingsEl.dataset['simplified']).toBe('false');
      expect(settingsEl.style.getPropertyValue('--modal-z')).toBe('11010');

      const settingsCloseBtn = dom.window.document.getElementById('settings-host-close-btn')!;
      settingsCloseBtn.click();

      // During exit phase, settingsEl stays mounted with data-phase="closing", while replayEl immediately restores simplified="false"
      expect(dom.window.document.getElementById('settings-host')?.dataset['phase']).toBe('closing');
      expect(replayEl.dataset['simplified']).toBe('false');

      stack.finalizeClose('settings-host');
      expect(dom.window.document.getElementById('settings-host')).toBeNull();
      expect(hostRoot.children).toHaveLength(1);

      unsubscribe();
      stack.dispose();
      dom.window.close();
    });
  });

  describe('Canary Tests & Auto-Repair: Browser-Safe Isomorphic Purity Canary', () => {
    it('guarantees zero Node.js built-in imports and zero UI/animation runtime dependencies in browser-safe modules', () => {
      const modalsDir = path.resolve(import.meta.dirname, '../src/modals');
      const domainCollectionsFile = path.resolve(
        import.meta.dirname,
        '../src/core/domainCollections.ts'
      );
      const modalFiles = fs
        .readdirSync(modalsDir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(modalsDir, f));

      const targetFiles = [...modalFiles, domainCollectionsFile];
      expect(targetFiles.length).toBeGreaterThanOrEqual(7);

      const forbiddenNodeSpecifier = ['node', ':'].join('');
      const forbiddenRuntimePackages = ['vue', 'pinia', 'react', 'gsap'];

      for (const filePath of targetFiles) {
        const source = fs.readFileSync(filePath, 'utf-8');
        expect(source).not.toContain(`'${forbiddenNodeSpecifier}`);
        expect(source).not.toContain(`"${forbiddenNodeSpecifier}`);
        for (const pkg of forbiddenRuntimePackages) {
          const importPattern = new RegExp(`from\\s+['"]${pkg}(?:['"/])`);
          expect(importPattern.test(source)).toBe(false);
        }
      }
    });

    it('accepts strict GSAP 3 TweenTarget/context signatures directly and protects modal controllers inside Pinia setup stores (__v_skip + structural stack contract)', () => {
      interface StrictGsapCore {
        fromTo(
          targets: string | object | null,
          fromVars: GsapTweenVars,
          toVars: GsapTweenVars
        ): object;
        to(targets: string | object | null, vars: GsapTweenVars): object;
        context(func?: () => void, scope?: Element | string | object): { revert(): void };
      }

      const tweenTargets: Array<string | object | null> = [];
      const capturedFromVars: GsapTweenVars[] = [];
      const strictGsap: StrictGsapCore = {
        fromTo(targets, fromVars, toVars) {
          tweenTargets.push(targets);
          capturedFromVars.push(fromVars);
          toVars.onComplete?.();
          return {};
        },
        to(targets, vars) {
          tweenTargets.push(targets);
          vars.onComplete?.();
          return {};
        },
        context(func) {
          func?.();
          return {
            revert(): void {}
          };
        }
      };

      const driver = createGsapModalDriver(strictGsap);
      setActivePinia(createPinia());

      const rawStack = createModalStack<UiModalKind>();
      const rawAnimations = new ModalAnimationController({ stack: rawStack, driver });
      const rawDomController = new ModalDomController({ stack: rawStack });
      const rawQueue = createModalSequenceQueue<'step'>();

      for (const instance of [rawStack, rawAnimations, rawDomController, rawQueue]) {
        const publicSkipFlag: boolean | undefined = instance.__v_skip;
        expect(publicSkipFlag).toBe(true);
        expect(Object.keys(instance)).not.toContain('__v_skip');
      }

      const useHostModalsStore = defineStore('hostModals', () => ({
        stackManager: rawStack,
        animations: rawAnimations,
        domController: rawDomController,
        queue: rawQueue
      }));

      const store = useHostModalsStore();
      // Pinia reactive() must skip wrapping raw modal engine instances thanks to __v_skip
      expect(store.stackManager).toBe(rawStack);
      expect(store.animations).toBe(rawAnimations);
      expect(store.domController).toBe(rawDomController);
      expect(store.queue).toBe(rawQueue);

      // Structural ModalStackController contract must accept UnwrapRef<ModalStackManager> from Pinia without TS2740
      const guard = createBackdropPointerGuard({
        stack: store.stackManager,
        getModalUid: () => 'pinia-modal-1'
      });
      const secondaryAnim = new ModalAnimationController({
        stack: store.stackManager,
        driver
      });
      const secondaryDom = new ModalDomController({
        stack: store.stackManager
      });

      const panelNode = { id: 'pinia-panel' };
      store.stackManager.open({ kind: 'ModalA', modalUid: 'pinia-modal-1' });
      const unbind = secondaryAnim.bindSurface('pinia-modal-1', { panel: panelNode });
      expect(tweenTargets).toContain(panelNode);
      expect(capturedFromVars.length).toBeGreaterThan(0);
      expect(store.stackManager.getByUid('pinia-modal-1')?.phase).toBe('open');

      guard.reset();
      unbind();
      secondaryDom.dispose();
      secondaryAnim.dispose();
      rawDomController.dispose();
      rawAnimations.dispose();
      rawStack.dispose();
    });
  });
});
