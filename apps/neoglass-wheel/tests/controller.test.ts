import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/core/random.js';
import { WheelStore } from '../src/core/store.js';
import type { Segment } from '../src/core/types.js';
import type { RendererKind, RenderState, WheelRenderer } from '../src/ui/renderer.js';
import { formatClock, formatPercent, prefersReducedMotion } from '../src/ui/dom.js';
import { WheelController } from '../src/ui/wheel-controller.js';

const segments: Segment[] = [
  { id: 'a', label: 'A', weight: 1, color: '#e0113f' },
  { id: 'b', label: 'B', weight: 1, color: '#8c0a2c' },
  { id: 'c', label: 'C', weight: 1, color: '#ff3b4d' },
  { id: 'd', label: 'D', weight: 1, color: '#5c061d' },
];

/** Doble del renderer: registra estados y evita cualquier dependencia de GPU. */
class FakeRenderer implements WheelRenderer {
  readonly kind: RendererKind = 'canvas2d';
  readonly frames: RenderState[] = [];
  readonly layouts: number[] = [];
  resized: [number, number, number][] = [];
  destroyed = false;

  resize(width: number, height: number, dpr: number): void {
    this.resized.push([width, height, dpr]);
  }
  setLayout(layout: readonly { size: number }[]): void {
    this.layouts.push(layout.length);
  }
  render(state: RenderState): void {
    this.frames.push(state);
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Reloj manual: dispara los callbacks de rAF con el timestamp que pidamos. */
function fakeRaf() {
  const queue = new Map<number, FrameRequestCallback>();
  let handle = 1;
  return {
    tick(timestamp: number) {
      const current = [...queue.values()];
      queue.clear();
      for (const callback of current) callback(timestamp);
    },
    get pending() {
      return queue.size;
    },
    request: (callback: FrameRequestCallback) => {
      const id = handle;
      handle += 1;
      queue.set(id, callback);
      return id;
    },
    cancel: (id: number) => {
      queue.delete(id);
    },
  };
}

const canvasStub = (): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () => ({ width: 400, height: 400, top: 0, left: 0 }),
  }) as HTMLCanvasElement;

describe('WheelController', () => {
  let raf: ReturnType<typeof fakeRaf>;
  let renderer: FakeRenderer;
  let documentListeners: Map<string, () => void>;

  beforeEach(() => {
    raf = fakeRaf();
    renderer = new FakeRenderer();
    vi.stubGlobal('requestAnimationFrame', raf.request);
    vi.stubGlobal('cancelAnimationFrame', raf.cancel);
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          // La geometría se simula con canvasStub: no hace falta observar.
        }
        disconnect(): void {}
      },
    );
    documentListeners = new Map();
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: (type: string, handler: () => void) => {
        documentListeners.set(type, handler);
      },
      removeEventListener: (type: string) => {
        documentListeners.delete(type);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const build = (reducedMotion = false) => {
    const store = new WheelStore(segments);
    const onSettle = vi.fn();
    const onFrame = vi.fn();
    const controller = new WheelController(canvasStub(), store, {
      reducedMotion,
      onSettle,
      onFrame,
      rendererFactory: () => renderer,
    });
    return { controller, store, onSettle, onFrame };
  };

  it('inicializa layout, tamaño con DPR y un primer frame', () => {
    const { controller } = build();
    expect(controller.rendererKind).toBe('canvas2d');
    expect(controller.layout).toHaveLength(4);
    expect(renderer.layouts).toEqual([4]);
    expect(renderer.resized[0]).toEqual([400, 400, 2]);
    expect(renderer.frames.length).toBeGreaterThanOrEqual(1);
    controller.destroy();
  });

  it('anima hasta asentarse, con un solo giro por vez', () => {
    const { controller, store, onSettle, onFrame } = build();
    const plan = controller.spin(createRng('giro'));
    expect(plan).not.toBeNull();
    expect(store.getSnapshot().spinning).toBe(true);
    // Segundo giro durante la animación: ignorado.
    expect(controller.spin(createRng('otro'))).toBeNull();

    let timestamp = 0;
    const duration = plan?.durationMs ?? 0;
    while (raf.pending > 0 && timestamp < duration + 5000) {
      timestamp += 16;
      raf.tick(timestamp);
    }

    expect(onFrame).toHaveBeenCalled();
    expect(onSettle).toHaveBeenCalledTimes(1);
    const snapshot = store.getSnapshot();
    expect(snapshot.spinning).toBe(false);
    expect(snapshot.lastIndex).toBe(plan?.index);
    expect(snapshot.rotation).toBeCloseTo(plan?.toRotation ?? 0, 6);
    expect(raf.pending).toBe(0); // el bucle se detiene solo
    controller.destroy();
  });

  it('respeta prefers-reduced-motion: giro corto y sin jitter', () => {
    const { controller } = build(true);
    const plan = controller.spin(createRng('reduce'));
    expect(plan?.durationMs).toBe(700);
    expect(plan?.turns).toBe(1);
    expect(plan?.jitter).toBe(0);
    controller.destroy();
  });

  it('no anima tras destroy()', () => {
    const { controller, store } = build();
    controller.destroy();
    expect(renderer.destroyed).toBe(true);
    expect(controller.spin(createRng('x'))).toBeNull();
    expect(store.getSnapshot().spinning).toBe(false);
  });

  it('setSegments reemplaza el layout y reinicia el estado', () => {
    const { controller, store } = build();
    controller.setSegments([
      { id: 'x', label: 'X', weight: 1, color: '#e0113f' },
      { id: 'y', label: 'Y', weight: 1, color: '#8c0a2c' },
    ]);
    expect(controller.layout).toHaveLength(2);
    expect(renderer.layouts.at(-1)).toBe(2);
    expect(store.getSnapshot().segments).toHaveLength(2);
    controller.destroy();
  });

  it('setHover sólo repinta cuando cambia y no durante el giro', () => {
    const { controller } = build();
    const before = renderer.frames.length;
    controller.setHover(2);
    expect(renderer.frames.length).toBe(before + 1);
    controller.setHover(2);
    expect(renderer.frames.length).toBe(before + 1);

    controller.spin(createRng('hover'));
    const duringSpin = renderer.frames.length;
    controller.setHover(1);
    expect(renderer.frames.length).toBe(duringSpin);
    controller.destroy();
  });

  it('indexUnderPointer coincide con el primer frame renderizado', () => {
    const { controller } = build();
    const first = renderer.frames[0];
    expect(first).toBeDefined();
    expect(controller.indexUnderPointer()).toBe(0);
    controller.destroy();
  });

  it('pausa el bucle al ocultar la pestaña y lo reanuda al volver', () => {
    const { controller, store } = build();
    controller.spin(createRng('visibilidad'));
    raf.tick(16);
    expect(raf.pending).toBe(1);

    // Pestaña oculta: se cancela el frame pendiente y no se consume CPU.
    const doc = globalThis.document as unknown as { hidden: boolean };
    doc.hidden = true;
    documentListeners.get('visibilitychange')?.();
    expect(raf.pending).toBe(0);

    // Vuelve a estar visible con un giro en curso: el bucle se reanuda.
    doc.hidden = false;
    documentListeners.get('visibilitychange')?.();
    expect(raf.pending).toBe(1);
    expect(store.getSnapshot().spinning).toBe(true);
    controller.destroy();
  });

  it('repinta una sola vez con redraw() y al volver visible sin giro', () => {
    const { controller } = build();
    const before = renderer.frames.length;
    controller.redraw();
    expect(renderer.frames.length).toBe(before + 1);

    const doc = globalThis.document as unknown as { hidden: boolean };
    doc.hidden = true;
    documentListeners.get('visibilitychange')?.();
    doc.hidden = false;
    documentListeners.get('visibilitychange')?.();
    expect(renderer.frames.length).toBe(before + 2);
    controller.destroy();
  });

  it('funciona sin ResizeObserver (navegadores antiguos)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const addEventListener = vi.fn();
    vi.stubGlobal('addEventListener', addEventListener);
    const { controller } = build();
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function), {
      passive: true,
    });
    controller.destroy();
  });
});

describe('helpers de UI', () => {
  it('formatPercent usa la convención española', () => {
    expect(formatPercent(0.5)).toBe('50 %');
    expect(formatPercent(0.3333, 1)).toBe('33,3 %');
    expect(formatPercent(1)).toBe('100 %');
  });

  it('formatClock produce hh:mm:ss', () => {
    const text = formatClock(new Date('2026-11-25T10:04:05'));
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('prefersReducedMotion consulta la media query', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
    vi.unstubAllGlobals();
  });
});
