import type { Segment, Unsubscribe, WheelSnapshot } from './types.js';

export type Listener = (snapshot: WheelSnapshot) => void;

/**
 * Estado observable mínimo (patrón store + subscribe) sin dependencias.
 * Inmutable por fuera: cada notificación entrega un snapshot congelado.
 */
export class WheelStore {
  #segments: readonly Segment[];
  #rotation: number;
  #lastIndex: number | null = null;
  #spinning = false;
  #listeners = new Set<Listener>();

  constructor(segments: readonly Segment[], rotation = 0) {
    this.#segments = Object.freeze([...segments]);
    this.#rotation = rotation;
  }

  getSnapshot(): WheelSnapshot {
    return Object.freeze({
      segments: this.#segments,
      rotation: this.#rotation,
      lastIndex: this.#lastIndex,
      spinning: this.#spinning,
    });
  }

  subscribe(listener: Listener): Unsubscribe {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.#listeners.delete(listener);
    };
  }

  setSegments(segments: readonly Segment[]): void {
    this.#segments = Object.freeze([...segments]);
    this.#lastIndex = null;
    this.#emit();
  }

  setRotation(rotation: number): void {
    if (!Number.isFinite(rotation)) throw new RangeError(`Rotación inválida: ${rotation}`);
    this.#rotation = rotation;
    this.#emit();
  }

  setSpinning(spinning: boolean): void {
    this.#spinning = spinning;
    this.#emit();
  }

  setLastIndex(index: number | null): void {
    if (
      index !== null &&
      (!Number.isInteger(index) || index < 0 || index >= this.#segments.length)
    ) {
      throw new RangeError(`Índice fuera de rango: ${index}`);
    }
    this.#lastIndex = index;
    this.#emit();
  }

  /** Aplica el resultado de un giro de forma atómica (una sola notificación). */
  settle(rotation: number, index: number): void {
    this.#rotation = rotation;
    this.#lastIndex = index;
    this.#spinning = false;
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
