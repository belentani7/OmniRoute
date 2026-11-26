import { describe, expect, it, vi } from 'vitest';
import { WheelStore } from '../src/core/store.js';
import type { Segment, WheelSnapshot } from '../src/core/types.js';

const segments: Segment[] = [
  { id: 'a', label: 'A', weight: 1, color: '#e0113f' },
  { id: 'b', label: 'B', weight: 1, color: '#8c0a2c' },
];

describe('WheelStore', () => {
  it('inicia con el estado esperado', () => {
    const store = new WheelStore(segments, 42);
    const snapshot = store.getSnapshot();
    expect(snapshot.segments).toEqual(segments);
    expect(snapshot.rotation).toBe(42);
    expect(snapshot.lastIndex).toBeNull();
    expect(snapshot.spinning).toBe(false);
  });

  it('entrega snapshots congelados e inmutables', () => {
    const store = new WheelStore(segments);
    const snapshot = store.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.segments)).toBe(true);
  });

  it('no comparte el array de entrada (copia defensiva)', () => {
    const source = [...segments];
    const store = new WheelStore(source);
    source.push({ id: 'c', label: 'C', weight: 1, color: '#ff0000' });
    expect(store.getSnapshot().segments).toHaveLength(2);
  });

  it('notifica inmediatamente al suscribirse y en cada cambio', () => {
    const store = new WheelStore(segments);
    const listener = vi.fn<(snapshot: WheelSnapshot) => void>();
    const unsubscribe = store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setRotation(90);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0].rotation).toBe(90);

    unsubscribe();
    store.setRotation(180);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('soporta múltiples suscriptores y desuscripción selectiva', () => {
    const store = new WheelStore(segments);
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    store.subscribe(b);
    store.setSpinning(true);
    offA();
    store.setSpinning(false);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
  });

  it('valida rotaciones e índices', () => {
    const store = new WheelStore(segments);
    expect(() => store.setRotation(Number.NaN)).toThrow(RangeError);
    expect(() => store.setLastIndex(5)).toThrow(RangeError);
    expect(() => store.setLastIndex(-1)).toThrow(RangeError);
    expect(() => store.setLastIndex(1.5)).toThrow(RangeError);
    expect(() => store.setLastIndex(null)).not.toThrow();
  });

  it('settle aplica rotación + índice y emite una sola vez', () => {
    const store = new WheelStore(segments);
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();

    store.settle(1234.5, 1);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = store.getSnapshot();
    expect(snapshot.rotation).toBe(1234.5);
    expect(snapshot.lastIndex).toBe(1);
    expect(snapshot.spinning).toBe(false);
  });

  it('setSegments reinicia el resultado anterior', () => {
    const store = new WheelStore(segments);
    store.setLastIndex(1);
    store.setSegments([{ id: 'z', label: 'Z', weight: 2, color: '#ff0' }]);
    const snapshot = store.getSnapshot();
    expect(snapshot.lastIndex).toBeNull();
    expect(snapshot.segments).toHaveLength(1);
  });
});
