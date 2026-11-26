import { describe, expect, it } from 'vitest';
import { presetToSegments, presets, getPreset } from '../src/core/presets.js';
import {
  accent,
  generateRedPalette,
  hslToHex,
  readableInk,
  relativeLuminance,
} from '../src/core/theme.js';
import { validateSegments } from '../src/core/wheel.js';

describe('hslToHex', () => {
  it('convierte los primarios puros', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('produce grises con saturación 0', () => {
    expect(hslToHex(210, 0, 0)).toBe('#000000');
    expect(hslToHex(210, 0, 100)).toBe('#ffffff');
    expect(hslToHex(210, 0, 50)).toBe('#808080');
  });

  it('siempre devuelve #rrggbb válido y normaliza el tono', () => {
    for (let hue = -720; hue <= 720; hue += 17) {
      expect(hslToHex(hue, 78, 46)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(hslToHex(370, 100, 50)).toBe(hslToHex(10, 100, 50));
    expect(hslToHex(-10, 100, 50)).toBe(hslToHex(350, 100, 50));
  });
});

describe('relativeLuminance / readableInk', () => {
  it('conoce blanco y negro', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBeCloseTo(0);
    expect(relativeLuminance('#fff')).toBeCloseTo(1);
  });

  it('elige tinta oscura sobre fondos claros y clara sobre oscuros', () => {
    expect(readableInk('#ffffff')).toBe('#0b0507');
    expect(readableInk('#000000')).toBe('#fff5f6');
    expect(readableInk('#5c061d')).toBe('#fff5f6');
  });

  it('cumple contraste AA (4.5:1) para toda la paleta generada', () => {
    const palette = generateRedPalette({ count: 24 });
    for (const color of palette) {
      const ink = readableInk(color);
      const l1 = relativeLuminance(color);
      const l2 = relativeLuminance(ink);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      expect(ratio, `${color} vs ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('generateRedPalette', () => {
  it('genera la cantidad pedida de colores únicos y válidos', () => {
    const palette = generateRedPalette({ count: 24 });
    expect(palette).toHaveLength(24);
    expect(new Set(palette).size).toBe(24);
    for (const color of palette) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('es determinista', () => {
    expect(generateRedPalette({ count: 6 })).toEqual(generateRedPalette({ count: 6 }));
  });

  it('acepta count=1 y valida el resto', () => {
    expect(generateRedPalette({ count: 1 })).toHaveLength(1);
    expect(() => generateRedPalette({ count: 0 })).toThrow(RangeError);
    expect(() => generateRedPalette({ count: 2.5 })).toThrow(RangeError);
  });

  it('respeta la familia roja (tono en 340–30)', () => {
    const palette = generateRedPalette({ count: 12 });
    for (const color of palette) {
      const r = Number.parseInt(color.slice(1, 3), 16);
      const g = Number.parseInt(color.slice(3, 5), 16);
      expect(r).toBeGreaterThan(g);
    }
  });
});

describe('accent', () => {
  it('está congelado y expone la paleta base', () => {
    expect(Object.isFrozen(accent)).toBe(true);
    expect(accent.ember).toBe('#ff3b30');
  });
});

describe('presets', () => {
  it('todos generan ruedas válidas', () => {
    for (const preset of presets) {
      const segments = presetToSegments(preset);
      expect(() => validateSegments(segments)).not.toThrow();
      expect(segments).toHaveLength(preset.labels.length);
      expect(new Set(segments.map((segment) => segment.id)).size).toBe(segments.length);
    }
  });

  it('getPreset encuentra por id y devuelve undefined si no existe', () => {
    expect(getPreset('comer')?.name).toBe('¿Qué comemos?');
    expect(getPreset('nope')).toBeUndefined();
  });

  it('aplica los pesos declarados', () => {
    const segments = presetToSegments(
      getPreset('si-no') as NonNullable<ReturnType<typeof getPreset>>,
    );
    expect(segments.map((segment) => segment.weight)).toEqual([1, 1, 0.55]);
  });
});
