import type { PlacedSegment, Segment } from './types.js';

/** El puntero siempre está en 12 en punto; la rueda gira por debajo. */
export const POINTER_ANGLE = 0;

/** Máximo de sectores legibles que admite la rueda a la vez. */
export const MAX_SEGMENTS = 24;

/** Trunca un ángulo a [0, 360). Tolera negativos y múltiplos enormes. */
export function normalizeAngle(deg: number): number {
  const mod = deg % 360;
  const normalized = mod < 0 ? mod + 360 : mod;
  // Evita el -0 que rompe comparaciones estrictas y serializaciones.
  return normalized === 0 ? 0 : normalized;
}

/** Interpolación angular más corta entre dos ángulos, en (-180, 180]. */
export function shortestDelta(from: number, to: number): number {
  const diff = normalizeAngle(to - from);
  return diff > 180 ? diff - 360 : diff;
}

/** fmix32 aplicado a un color: hash estable `#rrggbb` → uint32. */
export function colorToSeed(color: string): number {
  const hex = color.replace('#', '');
  return Number.parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16) >>> 0;
}

/**
 * Valida los segmentos de entrada y devuelve una lista normalizada.
 * Lanza errores explícitos en lugar de pintar una rueda silenciosamente rota.
 */
export function validateSegments(segments: readonly Segment[]): readonly Segment[] {
  if (segments.length < 2) {
    throw new RangeError('La rueda necesita al menos 2 opciones');
  }
  if (segments.length > MAX_SEGMENTS) {
    throw new RangeError(`La rueda admite como máximo ${MAX_SEGMENTS} opciones`);
  }

  const seen = new Set<string>();
  for (const segment of segments) {
    if (segment.id.trim() === '') throw new RangeError('Segmento sin id');
    if (seen.has(segment.id)) throw new RangeError(`Id duplicado: ${segment.id}`);
    seen.add(segment.id);
    if (segment.label.trim() === '') throw new RangeError(`Segmento sin etiqueta: ${segment.id}`);
    if (!Number.isFinite(segment.weight) || segment.weight <= 0) {
      throw new RangeError(`Peso inválido en "${segment.label}": ${segment.weight}`);
    }
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(segment.color)) {
      throw new RangeError(`Color inválido en "${segment.label}": ${segment.color}`);
    }
  }
  return segments;
}

/**
 * Reparte los 360° en sectores proporcionales al peso, empezando en 12 en punto
 * y avanzando en sentido horario. La suma de `size` es exactamente 360
 * (los errores de coma flotante se absorben en el último sector).
 */
export function layoutSegments(segments: readonly Segment[]): readonly PlacedSegment[] {
  validateSegments(segments);
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);

  const placed: PlacedSegment[] = [];
  let cursor = 0;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const size = isLast ? 360 - cursor : (segment.weight / total) * 360;
    const start = cursor;
    const end = start + size;
    placed.push({
      segment,
      index,
      start,
      end,
      size,
      mid: normalizeAngle(start + size / 2),
      fraction: segment.weight / total,
    });
    cursor = end;
  });

  return placed;
}

/**
 * Devuelve el índice del sector que queda bajo el puntero (12 en punto)
 * cuando la rueda está rotada `rotation` grados en sentido horario.
 *
 * Los sectores se dibujan en coordenadas locales; rotar la rueda `r` grados
 * desplaza el ángulo local del puntero a `-r`.
 */
export function indexAtAngle(
  layout: readonly PlacedSegment[],
  rotation: number,
  pointer: number = POINTER_ANGLE,
): number {
  if (layout.length === 0) throw new RangeError('indexAtAngle(): layout vacío');
  const local = normalizeAngle(pointer - rotation);
  for (const placed of layout) {
    if (local >= placed.start && local < placed.end) return placed.index;
  }
  // Borde exacto de 360° por redondeo: pertenece al último sector.
  return (layout[layout.length - 1] as PlacedSegment).index;
}

/** Rotación necesaria para dejar el centro del sector `index` bajo el puntero. */
export function rotationForIndex(layout: readonly PlacedSegment[], index: number): number {
  const placed = layout[index];
  if (!placed) throw new RangeError(`rotationForIndex(): índice fuera de rango ${index}`);
  return normalizeAngle(POINTER_ANGLE - placed.mid);
}

/**
 * Dado un desplazamiento en píxeles desde el centro, calcula el ángulo en grados
 * medido como la rueda: 0 en 12 en punto, positivo en sentido horario.
 */
export function angleFromPoint(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  // atan2(x, -y) => 0 arriba, 90 a la derecha.
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}
