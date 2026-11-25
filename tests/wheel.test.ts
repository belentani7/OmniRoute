import { describe, expect, it } from 'vitest';
import type { Segment } from '../src/core/types.js';
import {
  MAX_SEGMENTS,
  angleFromPoint,
  colorToSeed,
  indexAtAngle,
  layoutSegments,
  normalizeAngle,
  rotationForIndex,
  shortestDelta,
  validateSegments,
} from '../src/core/wheel.js';

const segment = (id: string, weight = 1, color = '#e0113f'): Segment => ({
  id,
  label: `Opción ${id}`,
  weight,
  color,
});

const trio: Segment[] = [segment('a'), segment('b'), segment('c')];

describe('normalizeAngle', () => {
  it('normaliza a [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(361)).toBeCloseTo(1);
    expect(normalizeAngle(-1)).toBeCloseTo(359);
    expect(normalizeAngle(-720)).toBe(0);
    expect(normalizeAngle(1080 + 45)).toBeCloseTo(45);
  });
});

describe('shortestDelta', () => {
  it('elige siempre el camino corto', () => {
    expect(shortestDelta(0, 10)).toBeCloseTo(10);
    expect(shortestDelta(10, 0)).toBeCloseTo(-10);
    expect(shortestDelta(350, 10)).toBeCloseTo(20);
    expect(shortestDelta(10, 350)).toBeCloseTo(-20);
    expect(shortestDelta(0, 180)).toBeCloseTo(180);
  });

  it('nunca produce un salto mayor que 180°', () => {
    for (let from = 0; from < 360; from += 7) {
      for (let to = 0; to < 360; to += 11) {
        const delta = shortestDelta(from, to);
        expect(Math.abs(delta)).toBeLessThanOrEqual(180);
        expect(normalizeAngle(from + delta)).toBeCloseTo(normalizeAngle(to), 6);
      }
    }
  });
});

describe('colorToSeed', () => {
  it('convierte 6 y 3 dígitos', () => {
    expect(colorToSeed('#ffffff')).toBe(0xffffff);
    expect(colorToSeed('#000')).toBe(0);
    expect(colorToSeed('#f00')).toBe(0xff0000);
  });
});

describe('validateSegments', () => {
  it('acepta configuraciones válidas', () => {
    expect(validateSegments(trio)).toHaveLength(3);
  });

  it('rechaza menos de 2 opciones', () => {
    expect(() => validateSegments([segment('solo')])).toThrow(/al menos 2/);
    expect(() => validateSegments([])).toThrow(RangeError);
  });

  it('rechaza más del máximo soportado', () => {
    const many = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => segment(`s${i}`));
    expect(() => validateSegments(many)).toThrow(/máximo/);
  });

  it('rechaza ids duplicados, vacíos y etiquetas vacías', () => {
    expect(() => validateSegments([segment('x'), segment('x')])).toThrow(/duplicado/);
    expect(() => validateSegments([{ ...segment('a'), id: ' ' }, segment('b')])).toThrow(/sin id/);
    expect(() => validateSegments([{ ...segment('a'), label: '  ' }, segment('b')])).toThrow(
      /sin etiqueta/,
    );
  });

  it('rechaza pesos y colores inválidos', () => {
    expect(() => validateSegments([{ ...segment('a'), weight: 0 }, segment('b')])).toThrow(/Peso/);
    expect(() => validateSegments([{ ...segment('a'), weight: Number.NaN }, segment('b')])).toThrow(
      /Peso/,
    );
    expect(() => validateSegments([{ ...segment('a'), color: 'rojo' }, segment('b')])).toThrow(
      /Color/,
    );
  });
});

describe('layoutSegments', () => {
  it('reparte 360° proporcionalmente al peso', () => {
    const layout = layoutSegments([segment('a', 1), segment('b', 2), segment('c', 1)]);
    expect(layout).toHaveLength(3);
    expect(layout[0]?.size).toBeCloseTo(90);
    expect(layout[1]?.size).toBeCloseTo(180);
    expect(layout[2]?.size).toBeCloseTo(90);
  });

  it('la suma de tamaños es exactamente 360 y no hay huecos', () => {
    const layout = layoutSegments(trio);
    const total = layout.reduce((sum, placed) => sum + placed.size, 0);
    expect(total).toBeCloseTo(360, 9);
    expect(layout[0]?.start).toBe(0);
    expect(layout[1]?.start).toBeCloseTo(layout[0]?.end ?? 0);
    expect(layout[2]?.end).toBeCloseTo(360);
  });

  it('calcula el centro de cada sector', () => {
    const layout = layoutSegments([segment('a', 1), segment('b', 1)]);
    expect(layout[0]?.mid).toBeCloseTo(90);
    expect(layout[1]?.mid).toBeCloseTo(270);
  });

  it('las fracciones suman 1', () => {
    const layout = layoutSegments([segment('a', 0.4), segment('b', 1.6)]);
    expect(layout.reduce((sum, placed) => sum + placed.fraction, 0)).toBeCloseTo(1, 12);
    expect(layout[0]?.fraction).toBeCloseTo(0.2);
  });
});

describe('indexAtAngle', () => {
  const layout = layoutSegments(trio); // 0–120, 120–240, 240–360

  it('sin rotación resuelve por rango', () => {
    // rotation = 0 ⇒ el ángulo local del puntero es 0: cae en el sector 0.
    expect(indexAtAngle(layout, 0)).toBe(0);
    // rotation = 359.9 ⇒ local = 0.1: sigue en el primer sector.
    expect(indexAtAngle(layout, 359.9)).toBe(0);
    // rotation = 240 ⇒ local = 120: primer grado del segundo sector.
    expect(indexAtAngle(layout, 240)).toBe(1);
    // rotation = 120.1 ⇒ local = 239.9: último tramo del segundo sector.
    expect(indexAtAngle(layout, 120.1)).toBe(1);
    // rotation = 120 ⇒ local = 240: arranca el tercer sector.
    expect(indexAtAngle(layout, 120)).toBe(2);
  });

  it('cubre los tres sectores sin huecos al recorrer la rotación', () => {
    const seen = new Set<number>();
    for (let rotation = 0; rotation < 360; rotation += 0.25) {
      seen.add(indexAtAngle(layout, rotation));
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('girar la rueda desplaza el sector bajo el puntero', () => {
    expect(indexAtAngle(layout, 120)).toBe(2);
    expect(indexAtAngle(layout, -120)).toBe(1);
    expect(indexAtAngle(layout, 720)).toBe(0);
  });

  it('es coherente con rotationForIndex', () => {
    for (let i = 0; i < layout.length; i += 1) {
      expect(indexAtAngle(layout, rotationForIndex(layout, i))).toBe(i);
    }
  });

  it('lanza con layout vacío y con índice fuera de rango', () => {
    expect(() => indexAtAngle([], 0)).toThrow(RangeError);
    expect(() => rotationForIndex(layout, 99)).toThrow(RangeError);
  });
});

describe('angleFromPoint', () => {
  it('0 arriba, 90 derecha, 180 abajo, 270 izquierda', () => {
    expect(angleFromPoint(0, -10)).toBeCloseTo(0);
    expect(angleFromPoint(10, 0)).toBeCloseTo(90);
    expect(angleFromPoint(0, 10)).toBeCloseTo(180);
    expect(angleFromPoint(-10, 0)).toBeCloseTo(270);
  });

  it('devuelve 0 en el centro exacto', () => {
    expect(angleFromPoint(0, 0)).toBe(0);
  });
});
