import type { EasingName } from './types.js';

export type EasingFn = (t: number) => number;

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const easings: Readonly<Record<EasingName, EasingFn>> = {
  linear: (t) => clamp01(t),
  easeOutCubic: (t) => {
    const x = clamp01(t);
    return 1 - (1 - x) ** 3;
  },
  easeOutQuint: (t) => {
    const x = clamp01(t);
    return 1 - (1 - x) ** 5;
  },
  easeOutExpo: (t) => {
    const x = clamp01(t);
    return x === 1 ? 1 : 1 - 2 ** (-10 * x);
  },
};

export function applyEasing(name: EasingName, t: number): number {
  return easings[name](t);
}

/** Utilidad de test/perf: derivada numérica de una curva de easing. */
export function easingVelocity(name: EasingName, t: number, h = 1e-4): number {
  const a = applyEasing(name, Math.max(0, t - h));
  const b = applyEasing(name, Math.min(1, t + h));
  return (b - a) / (Math.min(1, t + h) - Math.max(0, t - h));
}
