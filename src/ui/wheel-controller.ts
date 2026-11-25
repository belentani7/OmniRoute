import { planSpin, rotationAt } from '../core/spin.js';
import type { WheelStore } from '../core/store.js';
import type { PlacedSegment, Rng, SpinPlan, SpinOptions, WheelSnapshot } from '../core/types.js';
import { indexAtAngle, layoutSegments } from '../core/wheel.js';
import { createRenderer } from './renderer.js';
import type { RenderState, WheelRenderer } from './renderer.js';

export interface ControllerOptions {
  readonly reducedMotion: boolean;
  readonly onSettle?: (snapshot: WheelSnapshot, plan: SpinPlan) => void;
  readonly onFrame?: (snapshot: WheelSnapshot) => void;
  /** Inyección para tests: permite sustituir el renderer real por un doble. */
  readonly rendererFactory?: (canvas: HTMLCanvasElement) => WheelRenderer;
}

const MAX_DELTA_MS = 50;

/**
 * Orquesta estado, render y bucle de animación.
 * - Un único requestAnimationFrame; se cancela al ocultar la pestaña,
 *   al destruir y al terminar la animación (no deja CPU encendida).
 * - Con `prefers-reduced-motion` el giro es un fundido corto, no una odisea.
 */
export class WheelController {
  readonly #canvas: HTMLCanvasElement;
  readonly #store: WheelStore;
  readonly #renderer: WheelRenderer;
  readonly #options: ControllerOptions;
  #layout: readonly PlacedSegment[];
  #plan: SpinPlan | null = null;
  #startedAt = 0;
  #frame = 0;
  #time = 0;
  #lastFrameAt = 0;
  #spinning = false;
  #destroyed = false;
  #resizeObserver: ResizeObserver | null = null;
  #cleanupVisibility: (() => void) | null = null;
  #hover = -1;

  constructor(canvas: HTMLCanvasElement, store: WheelStore, options: ControllerOptions) {
    this.#canvas = canvas;
    this.#store = store;
    this.#options = options;
    this.#renderer = options.rendererFactory?.(canvas) ?? createRenderer(canvas);
    this.#layout = layoutSegments(store.getSnapshot().segments);
    this.#renderer.setLayout(this.#layout);
    this.#observeSize();
    this.#listenVisibility();
    this.draw();
  }

  get rendererKind(): WheelRenderer['kind'] {
    return this.#renderer.kind;
  }

  get layout(): readonly PlacedSegment[] {
    return this.#layout;
  }

  #observeSize(): void {
    const resize = (): void => {
      const rect = this.#canvas.getBoundingClientRect();
      const dpr = globalThis.devicePixelRatio ?? 1;
      this.#renderer.resize(
        Math.max(1, rect.width),
        Math.max(1, rect.height || rect.width),
        Number.isFinite(dpr) ? dpr : 1,
      );
      this.draw();
    };
    resize();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(resize);
      observer.observe(this.#canvas);
      this.#resizeObserver = observer;
    } else {
      globalThis.addEventListener('resize', resize, { passive: true });
    }
  }

  #listenVisibility(): void {
    const onVisibility = (): void => {
      if (document.hidden) {
        this.#stopLoop();
      } else if (this.#spinning) {
        this.#lastFrameAt = 0;
        this.#startLoop();
      } else {
        this.draw();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.#cleanupVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /**
   * Cambia las opciones. También actualiza el store para que no puedan quedar
   * desincronizados (segunda fuente de verdad ⇒ rueda que no coincide con la UI).
   */
  setSegments(segments: WheelSnapshot['segments']): void {
    if (this.#store.getSnapshot().segments !== segments) {
      this.#store.setSegments(segments);
    }
    this.#layout = layoutSegments(segments);
    this.#renderer.setLayout(this.#layout);
    this.#plan = null;
    this.#spinning = false;
    this.#hover = -1;
    this.draw();
  }

  setHover(index: number): void {
    if (this.#hover === index) return;
    this.#hover = index;
    if (!this.#spinning) this.draw();
  }

  /** Índice bajo el puntero para el estado actual (sin animar). */
  indexUnderPointer(): number {
    return indexAtAngle(this.#layout, this.#store.getSnapshot().rotation);
  }

  /**
   * Lanza un giro. Devuelve el plan para que la UI pueda anunciarlo al terminar.
   * Si ya hay un giro en curso, lo ignora (evita dobles resultados).
   */
  spin(rng: Rng, overrides: Partial<SpinOptions> = {}): SpinPlan | null {
    if (this.#destroyed || this.#spinning) return null;

    const snapshot = this.#store.getSnapshot();
    const plan = planSpin(this.#layout, {
      rng,
      fromRotation: snapshot.rotation,
      ...(this.#options.reducedMotion
        ? { durationMs: 700, minTurns: 1, maxTurns: 1, jitterRatio: 0 }
        : {}),
      ...overrides,
    });

    this.#plan = plan;
    this.#spinning = true;
    this.#store.setSpinning(true);
    this.#store.setLastIndex(null);
    this.#startedAt = 0;
    this.#lastFrameAt = 0;
    this.#startLoop();
    return plan;
  }

  #startLoop(): void {
    if (this.#frame !== 0 || this.#destroyed) return;
    const tick = (timestamp: number): void => {
      this.#frame = 0;
      this.#step(timestamp);
      if (this.#spinning) {
        this.#frame = globalThis.requestAnimationFrame(tick);
      }
    };
    this.#frame = globalThis.requestAnimationFrame(tick);
  }

  #stopLoop(): void {
    if (this.#frame !== 0) {
      globalThis.cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  #step(timestamp: number): void {
    const plan = this.#plan;
    if (!plan) {
      this.#spinning = false;
      return;
    }
    if (this.#startedAt === 0) this.#startedAt = timestamp;
    const delta =
      this.#lastFrameAt === 0 ? 0 : Math.min(timestamp - this.#lastFrameAt, MAX_DELTA_MS);
    this.#lastFrameAt = timestamp;
    this.#time += delta / 1000;

    const elapsed = timestamp - this.#startedAt;
    const t = Math.min(1, elapsed / plan.durationMs);
    const rotation = rotationAt(plan, t);
    this.#store.setRotation(rotation);
    this.#options.onFrame?.(this.#store.getSnapshot());
    this.draw(t, plan);

    if (t >= 1) {
      this.#spinning = false;
      this.#plan = null;
      this.#store.settle(plan.toRotation, plan.index);
      this.#options.onSettle?.(this.#store.getSnapshot(), plan);
      this.draw(1, plan);
    }
  }

  private draw(t = 0, plan: SpinPlan | null = this.#plan): void {
    const snapshot = this.#store.getSnapshot();
    const state: RenderState = {
      rotation: snapshot.rotation,
      spinning: this.#spinning ? 1 : 0,
      winner: snapshot.lastIndex ?? (plan && t >= 1 ? plan.index : -1),
      hover: this.#hover,
      time: this.#time,
    };
    this.#renderer.render(state);
  }

  /** Repinta una vez con el tiempo actual (usado tras resize o cambios de tema). */
  redraw(): void {
    this.draw();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#stopLoop();
    this.#resizeObserver?.disconnect();
    this.#cleanupVisibility?.();
    this.#renderer.destroy();
  }
}
