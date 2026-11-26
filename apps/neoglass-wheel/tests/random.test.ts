import { describe, expect, it } from 'vitest';
import { createRng, hashString, pickWeighted, shuffled } from '../src/core/random.js';

describe('hashString', () => {
  it('es determinista y estable', () => {
    expect(hashString('belentani')).toBe(hashString('belentani'));
    expect(hashString('belentani')).not.toBe(hashString('belentani '));
  });

  it('devuelve siempre uint32', () => {
    for (const seed of ['', 'a', '🎡', 'x'.repeat(500)]) {
      const value = hashString(seed);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('createRng', () => {
  it('es reproducible con la misma semilla', () => {
    const a = createRng('semilla');
    const b = createRng('semilla');
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produce secuencias distintas con semillas distintas', () => {
    const a = createRng('uno').next();
    const b = createRng('dos').next();
    expect(a).not.toBe(b);
  });

  it('acepta semilla numérica', () => {
    expect(createRng(42).next()).toBe(createRng(42).next());
  });

  it('next() se mantiene en [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('int() respeta el rango y lo valida', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(Number.NaN)).toThrow(RangeError);
  });

  it('int(1) siempre devuelve 0', () => {
    const rng = createRng(11);
    for (let i = 0; i < 20; i += 1) expect(rng.int(1)).toBe(0);
  });
});

describe('pickWeighted', () => {
  it('reparte proporcionalmente a los pesos', () => {
    const weights = [1, 3, 6];
    const counts = [0, 0, 0];
    const rng = createRng('reparto');
    for (let i = 0; i < 30_000; i += 1) {
      const index = pickWeighted(weights, rng.next());
      counts[index] = (counts[index] ?? 0) + 1;
    }
    // Esperado: 10% / 30% / 60% con margen de ±1.5 puntos absolutos.
    expect((counts[0] ?? 0) / 30_000).toBeCloseTo(0.1, 1);
    expect((counts[1] ?? 0) / 30_000).toBeGreaterThan(0.28);
    expect((counts[1] ?? 0) / 30_000).toBeLessThan(0.32);
    expect((counts[2] ?? 0) / 30_000).toBeGreaterThan(0.58);
    expect((counts[2] ?? 0) / 30_000).toBeLessThan(0.62);
  });

  it('respeta los bordes exactos', () => {
    expect(pickWeighted([1, 1], 0)).toBe(0);
    expect(pickWeighted([1, 1], 0.499_999)).toBe(0);
    expect(pickWeighted([1, 1], 0.5)).toBe(1);
    expect(pickWeighted([1, 1], 0.999_999)).toBe(1);
  });

  it('nunca devuelve un sector con peso cero', () => {
    const rng = createRng('cero');
    for (let i = 0; i < 5_000; i += 1) {
      expect(pickWeighted([0.0001, 5, 0.0001], rng.next())).not.toBe(Number.NaN);
    }
  });

  it('valida entradas', () => {
    expect(() => pickWeighted([], 0.5)).toThrow(RangeError);
    expect(() => pickWeighted([1, 1], 1)).toThrow(RangeError);
    expect(() => pickWeighted([1, 1], -0.1)).toThrow(RangeError);
    expect(() => pickWeighted([1, Number.NaN], 0.3)).toThrow(RangeError);
    expect(() => pickWeighted([1, 0], 0.3)).toThrow(RangeError);
    expect(() => pickWeighted([1, -2], 0.3)).toThrow(RangeError);
  });
});

describe('shuffled', () => {
  it('no muta la entrada y conserva los elementos', () => {
    const source = Object.freeze([1, 2, 3, 4, 5]);
    const result = shuffled(source, createRng(9));
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('es determinista y efectivamente desordena', () => {
    const rngA = createRng('baraja');
    const rngB = createRng('baraja');
    const base = Array.from({ length: 12 }, (_, i) => i);
    expect(shuffled(base, rngA)).toEqual(shuffled(base, rngB));
    expect(shuffled(base, createRng('otra'))).not.toEqual(base);
  });
});
