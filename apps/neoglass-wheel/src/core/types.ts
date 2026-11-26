/**
 * Tipos del dominio de NeoGlassRojo · Belentani Wheel.
 * Todo el núcleo es puro: sin DOM, sin WebGL, sin `window`.
 */

/** Generador pseudoaleatorio determinista e inyectable (facilita tests reproducibles). */
export interface Rng {
  /** Float en [0, 1). */
  next(): number;
  /** Entero en [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Elige un índice con probabilidad proporcional a `weights`. */
  weighted(weights: readonly number[]): number;
}

/** Una opción de la rueda. `weight` es su probabilidad relativa (adimensional, > 0). */
export interface Segment {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  /** Color de relleno del sector en formato `#rrggbb`. */
  readonly color: string;
}

/** Sector ya resuelto en ángulos (grados, 0 = 12 en punto, sentido horario). */
export interface PlacedSegment {
  readonly segment: Segment;
  readonly index: number;
  /** Ángulo donde empieza el sector (borde de entrada). */
  readonly start: number;
  /** Ángulo donde termina (borde de salida). */
  readonly end: number;
  /** Amplitud angular en grados, siempre > 0. */
  readonly size: number;
  /** Ángulo central del sector. */
  readonly mid: number;
  /** Fracción del círculo [0, 1]. */
  readonly fraction: number;
}

export type EasingName = 'linear' | 'easeOutQuint' | 'easeOutCubic' | 'easeOutExpo';

/** Resultado completo e inmutable de planificar un giro. */
export interface SpinPlan {
  /** Índice del sector ganador dentro del layout. */
  readonly index: number;
  readonly segment: Segment;
  /** Rotación inicial de la rueda, en grados. */
  readonly fromRotation: number;
  /** Rotación final de la rueda, en grados (siempre mayor que la inicial). */
  readonly toRotation: number;
  /** Duración total en milisegundos. */
  readonly durationMs: number;
  readonly easing: EasingName;
  /** Desplazamiento aplicado alrededor del centro del sector ganador. */
  readonly jitter: number;
  /** Vueltas completas dadas. */
  readonly turns: number;
}

export interface SpinOptions {
  readonly rng: Rng;
  /** Rotación actual de la rueda. */
  readonly fromRotation: number;
  /** Vueltas completas mínimas (>= 1). */
  readonly minTurns?: number;
  readonly maxTurns?: number;
  readonly durationMs?: number;
  readonly easing?: EasingName;
  /**
   * Fracción de la mitad del sector que puede usarse como desvío,
   * para que el resultado no caiga siempre en el centro exacto.
   */
  readonly jitterRatio?: number;
  /** Margen de seguridad en grados entre el puntero y el borde del sector. */
  readonly edgeMargin?: number;
}

export interface WheelSnapshot {
  readonly segments: readonly Segment[];
  readonly rotation: number;
  readonly lastIndex: number | null;
  readonly spinning: boolean;
}

export type Unsubscribe = () => void;
