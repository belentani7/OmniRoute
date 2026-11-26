import { applyEasing } from './easing.js';
import type { PlacedSegment, SpinOptions, SpinPlan } from './types.js';
import { indexAtAngle, normalizeAngle } from './wheel.js';

const DEFAULTS = {
  minTurns: 4,
  maxTurns: 7,
  durationMs: 5200,
  easing: 'easeOutQuint',
  jitterRatio: 0.55,
  edgeMargin: 1.5,
} as const satisfies Required<Omit<SpinOptions, 'rng' | 'fromRotation'>>;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} debe ser finito, recibido ${value}`);
}

/**
 * Planifica un giro completo: elige ganador según pesos, calcula la rotación
 * final y **verifica** que `indexAtAngle` devuelve ese mismo ganador antes de
 * entregar el plan. Si la verificación falla, cae al centro exacto del sector,
 * de modo que nunca se anuncia un resultado distinto del que se ve.
 */
export function planSpin(layout: readonly PlacedSegment[], options: SpinOptions): SpinPlan {
  if (layout.length === 0) throw new RangeError('planSpin(): layout vacío');
  assertFinite(options.fromRotation, 'fromRotation');

  const minTurns = options.minTurns ?? DEFAULTS.minTurns;
  const maxTurns = options.maxTurns ?? DEFAULTS.maxTurns;
  const durationMs = options.durationMs ?? DEFAULTS.durationMs;
  const easing = options.easing ?? DEFAULTS.easing;
  const jitterRatio = options.jitterRatio ?? DEFAULTS.jitterRatio;
  const edgeMargin = options.edgeMargin ?? DEFAULTS.edgeMargin;

  if (!Number.isInteger(minTurns) || minTurns < 1) {
    throw new RangeError(`minTurns debe ser entero >= 1, recibido ${minTurns}`);
  }
  if (!Number.isInteger(maxTurns) || maxTurns < minTurns) {
    throw new RangeError(`maxTurns debe ser entero >= minTurns, recibido ${maxTurns}`);
  }
  if (durationMs < 600) throw new RangeError(`durationMs demasiado corto: ${durationMs}`);
  if (jitterRatio < 0 || jitterRatio > 1) {
    throw new RangeError(`jitterRatio debe estar en [0, 1], recibido ${jitterRatio}`);
  }
  if (edgeMargin < 0) throw new RangeError(`edgeMargin no puede ser negativo: ${edgeMargin}`);

  const weights = layout.map((placed) => placed.segment.weight);
  const index = options.rng.weighted(weights);
  const winner = layout[index] as PlacedSegment;

  const turns = options.rng.int(maxTurns - minTurns + 1) + minTurns;
  const from = normalizeAngle(options.fromRotation);

  // Margen real: no puede comerse más de la mitad del sector.
  const usableHalf = Math.max(0, winner.size / 2 - edgeMargin);
  const jitterRange = usableHalf * jitterRatio;
  const rawJitter = jitterRange === 0 ? 0 : (options.rng.next() * 2 - 1) * jitterRange;

  const buildPlan = (jitter: number): SpinPlan => {
    const desired = normalizeAngle(-winner.mid + jitter);
    const delta = normalizeAngle(desired - from);
    const toRotation = from + turns * 360 + delta;
    return {
      index,
      segment: winner.segment,
      fromRotation: from,
      toRotation,
      durationMs,
      easing,
      jitter,
      turns,
    };
  };

  let plan = buildPlan(rawJitter);
  if (indexAtAngle(layout, plan.toRotation) !== index) {
    // Salvaguarda: el borde del sector es ambiguo, vamos al centro exacto.
    plan = buildPlan(0);
  }
  if (indexAtAngle(layout, plan.toRotation) !== index) {
    throw new Error(
      `planSpin(): verificación imposible (índice ${index}, rotación ${plan.toRotation})`,
    );
  }
  if (plan.toRotation <= plan.fromRotation) {
    throw new Error('planSpin(): la rotación debe avanzar en sentido horario');
  }
  return plan;
}

/** Rotación interpolada para un instante normalizado `t` en [0, 1]. */
export function rotationAt(plan: SpinPlan, t: number): number {
  const eased = applyEasing(plan.easing, t);
  return plan.fromRotation + (plan.toRotation - plan.fromRotation) * eased;
}

/**
 * Integra el reposo final: en `t = 1` la rueda está exactamente en `toRotation`,
 * sin temblor residual, y el índice coincide con el ganador del plan.
 */
export function isSettled(plan: SpinPlan, layout: readonly PlacedSegment[], t: number): boolean {
  return t >= 1 && indexAtAngle(layout, rotationAt(plan, 1)) === plan.index;
}
