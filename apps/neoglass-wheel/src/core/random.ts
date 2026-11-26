import type { Rng } from './types.js';

/** Hash de cadena a uint32 (xmur3). Determinista y estable entre plataformas. */
export function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** PRNG mulberry32: rápido, 2^32 de periodo, suficiente para UI y tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crea un Rng determinista a partir de una semilla numérica o de texto.
 * Misma semilla ⇒ misma secuencia, lo que hace los tests reproducibles
 * y permite compartir un resultado concreto por URL.
 */
export function createRng(seed: number | string = Date.now()): Rng {
  const numericSeed = typeof seed === 'number' ? Math.trunc(seed) : hashString(seed);
  const next = mulberry32(numericSeed);

  return {
    next,
    int(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError(`int(): maxExclusive debe ser > 0, recibido ${maxExclusive}`);
      }
      return Math.min(Math.floor(next() * maxExclusive), Math.ceil(maxExclusive) - 1);
    },
    weighted(weights: readonly number[]): number {
      return pickWeighted(weights, next());
    },
  };
}

/**
 * Elige un índice con probabilidad proporcional a su peso usando un `r` en [0, 1].
 * Es una función pura: separar el sorteo del Rng la hace directamente testeable.
 */
export function pickWeighted(weights: readonly number[], r: number): number {
  if (weights.length === 0) throw new RangeError('pickWeighted(): no hay pesos');
  if (!Number.isFinite(r) || r < 0 || r >= 1) {
    throw new RangeError(`pickWeighted(): r debe estar en [0, 1), recibido ${r}`);
  }

  let total = 0;
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`pickWeighted(): peso inválido ${weight}`);
    }
    total += weight;
  }

  const target = r * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i] as number;
    if (target < acc) return i;
  }
  // Sólo alcanzable por error de redondeo en el último tramo.
  return weights.length - 1;
}

/** Baraja Fisher–Yates sin mutar la entrada. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const a = copy[i] as T;
    const b = copy[j] as T;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}
