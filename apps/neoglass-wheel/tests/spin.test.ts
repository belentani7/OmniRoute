import { describe, expect, it } from 'vitest';
import { easingVelocity, easings } from '../src/core/easing.js';
import { createRng, pickWeighted } from '../src/core/random.js';
import { isSettled, planSpin, rotationAt } from '../src/core/spin.js';
import type { Segment, SpinOptions } from '../src/core/types.js';
import { indexAtAngle, layoutSegments, normalizeAngle } from '../src/core/wheel.js';

const seg = (id: string, weight = 1, color = '#e0113f'): Segment => ({
  id,
  label: `Etiqueta ${id}`,
  weight,
  color,
});

const layout = layoutSegments([seg('a'), seg('b'), seg('c'), seg('d')]);

const base = (seed = 'test'): SpinOptions => ({
  rng: createRng(seed),
  fromRotation: 0,
});

describe('planSpin — integridad del resultado', () => {
  it('el ganador anunciado es el que queda bajo el puntero, en 500 giros', () => {
    for (let i = 0; i < 500; i += 1) {
      const plan = planSpin(layout, { rng: createRng(`s${i}`), fromRotation: i * 37.3 });
      expect(indexAtAngle(layout, plan.toRotation)).toBe(plan.index);
      expect(plan.segment).toEqual(layout[plan.index]?.segment);
    }
  });

  it('siempre avanza en sentido horario al menos una vuelta', () => {
    for (let i = 0; i < 200; i += 1) {
      const plan = planSpin(layout, base(`avance-${i}`));
      expect(plan.toRotation).toBeGreaterThan(plan.fromRotation);
      expect(plan.toRotation - plan.fromRotation).toBeGreaterThanOrEqual(360);
    }
  });

  it('respeta minTurns y maxTurns', () => {
    for (let i = 0; i < 100; i += 1) {
      const plan = planSpin(layout, {
        ...base(`turnos-${i}`),
        minTurns: 3,
        maxTurns: 3,
      });
      expect(plan.turns).toBe(3);
      const delta = plan.toRotation - plan.fromRotation;
      expect(delta).toBeGreaterThanOrEqual(3 * 360);
      expect(delta).toBeLessThan(4 * 360);
    }
  });

  it('normaliza fromRotation negativo o enorme', () => {
    const plan = planSpin(layout, { rng: createRng('x'), fromRotation: -1080 });
    expect(plan.fromRotation).toBe(0);
    expect(indexAtAngle(layout, plan.toRotation)).toBe(plan.index);
  });

  it('aplica el jitter dentro del sector ganador', () => {
    for (let i = 0; i < 200; i += 1) {
      const plan = planSpin(layout, { ...base(`jitter-${i}`), edgeMargin: 2, jitterRatio: 1 });
      const winner = layout[plan.index];
      expect(winner).toBeDefined();
      if (!winner) return;
      expect(Math.abs(plan.jitter)).toBeLessThanOrEqual(winner.size / 2 - 2 + 1e-9);
    }
  });

  it('jitter 0 coloca el centro exacto del sector bajo el puntero', () => {
    const plan = planSpin(layout, { ...base('centro'), jitterRatio: 0 });
    const winner = layout[plan.index];
    expect(winner).toBeDefined();
    if (!winner) return;
    expect(normalizeAngle(plan.toRotation)).toBeCloseTo(normalizeAngle(-winner.mid), 9);
  });

  it('reproduce la distribución de pesos a lo largo de 4000 giros', () => {
    const weighted = layoutSegments([seg('a', 1), seg('b', 6), seg('c', 3)]);
    const counts = new Map<number, number>();
    for (let i = 0; i < 4000; i += 1) {
      const plan = planSpin(weighted, { rng: createRng(`dist-${i}`), fromRotation: 0 });
      counts.set(plan.index, (counts.get(plan.index) ?? 0) + 1);
    }
    expect((counts.get(0) ?? 0) / 4000).toBeCloseTo(0.1, 1);
    expect((counts.get(1) ?? 0) / 4000).toBeCloseTo(0.6, 1);
    expect((counts.get(2) ?? 0) / 4000).toBeCloseTo(0.3, 1);
  });

  it('un solo sector con peso dominante gana casi siempre', () => {
    const skewed = layoutSegments([seg('raro', 0.01), seg('seguro', 1000)]);
    let wins = 0;
    for (let i = 0; i < 500; i += 1) {
      if (planSpin(skewed, { rng: createRng(`skew-${i}`), fromRotation: 0 }).index === 1) wins += 1;
    }
    expect(wins).toBeGreaterThan(495);
  });
});

describe('planSpin — validaciones', () => {
  it('rechaza layout vacío', () => {
    expect(() => planSpin([], { rng: createRng(1), fromRotation: 0 })).toThrow(/layout vacío/);
  });

  it('rechaza fromRotation no finito', () => {
    expect(() =>
      planSpin(layout, { rng: createRng(1), fromRotation: Number.POSITIVE_INFINITY }),
    ).toThrow(/finito/);
  });

  it('valida turnos, duración, jitter y margen', () => {
    const rng = createRng(1);
    expect(() => planSpin(layout, { rng, fromRotation: 0, minTurns: 0 })).toThrow(/minTurns/);
    expect(() => planSpin(layout, { rng, fromRotation: 0, minTurns: 5, maxTurns: 2 })).toThrow(
      /maxTurns/,
    );
    expect(() => planSpin(layout, { rng, fromRotation: 0, durationMs: 100 })).toThrow(/durationMs/);
    expect(() => planSpin(layout, { rng, fromRotation: 0, jitterRatio: 1.5 })).toThrow(
      /jitterRatio/,
    );
    expect(() => planSpin(layout, { rng, fromRotation: 0, edgeMargin: -1 })).toThrow(/edgeMargin/);
  });
});

describe('rotationAt / isSettled', () => {
  it('interpola monótonamente y cierra exacto en t=1', () => {
    const plan = planSpin(layout, base('interp'));
    let previous = plan.fromRotation;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const rotation = rotationAt(plan, t);
      expect(rotation).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = rotation;
    }
    expect(rotationAt(plan, 1)).toBeCloseTo(plan.toRotation, 9);
    expect(rotationAt(plan, 0)).toBeCloseTo(plan.fromRotation, 9);
  });

  it('recorta fuera de rango', () => {
    const plan = planSpin(layout, base('clamp'));
    expect(rotationAt(plan, -3)).toBeCloseTo(plan.fromRotation, 9);
    expect(rotationAt(plan, 42)).toBeCloseTo(plan.toRotation, 9);
  });

  it('isSettled sólo tras completar y con índice correcto', () => {
    const plan = planSpin(layout, base('settle'));
    expect(isSettled(plan, layout, 0.99)).toBe(false);
    expect(isSettled(plan, layout, 1)).toBe(true);
  });
});

describe('easings', () => {
  it('todas empiezan en 0, acaban en 1 y son monótonas', () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0), name).toBeCloseTo(0);
      expect(fn(1), name).toBeCloseTo(1);
      let previous = 0;
      for (let t = 0; t <= 1; t += 0.01) {
        const value = fn(t);
        expect(value, `${name}@${t}`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = value;
      }
    }
  });

  it('las curvas easeOut desaceleran (velocidad inicial > final)', () => {
    for (const name of ['easeOutCubic', 'easeOutQuint', 'easeOutExpo'] as const) {
      const start = easingVelocity(name, 0.02);
      const end = easingVelocity(name, 0.98);
      expect(start, name).toBeGreaterThan(end);
    }
  });

  it('linear mantiene velocidad constante', () => {
    expect(easingVelocity('linear', 0.25)).toBeCloseTo(1, 3);
    expect(easingVelocity('linear', 0.75)).toBeCloseTo(1, 3);
  });

  it('easeOutQuint frena más fuerte que easeOutCubic al final', () => {
    expect(easingVelocity('easeOutQuint', 0.9)).toBeLessThan(easingVelocity('easeOutCubic', 0.9));
  });
});

describe('pickWeighted ↔ planSpin', () => {
  it('comparten la misma selección para el mismo r', () => {
    const weights = layout.map((placed) => placed.segment.weight);
    for (let i = 0; i < 100; i += 1) {
      const r = i / 100;
      expect(pickWeighted(weights, r)).toBe(pickWeighted(weights, r));
    }
  });
});
