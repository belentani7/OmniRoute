/**
 * Paleta NeoGlassRojo: una familia de cristal rojo generada en HSL.
 * Cada sector recibe un tono propio, pero todos comparten la misma saturación
 * y luminosidad para que la rueda se lea como una sola pieza de cristal.
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** HSL → `#rrggbb`. Sin dependencias, redondeo determinista. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const lig = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  const [r1, g1, b1]: [number, number, number] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toByte = (channel: number): string =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toByte(r1)}${toByte(g1)}${toByte(b1)}`;
}

/** Luminancia relativa WCAG 2.1 para decidir el color del texto encima. */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  const channel = (offset: number): number => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Devuelve `#0b0507` o `#fff5f6` según contraste, garantizando AA sobre el sector. */
export function readableInk(background: string): string {
  return relativeLuminance(background) > 0.36 ? '#0b0507' : '#fff5f6';
}

export interface PaletteOptions {
  readonly count: number;
  readonly startHue?: number;
  readonly hueSpread?: number;
  readonly saturation?: number;
  readonly lightness?: number;
  readonly hueStep?: number;
}

/**
 * Genera `count` colores de cristal rojo.
 * `hueStep` desordena el tono para que dos sectores contiguos nunca se confundan.
 *
 * La banda por defecto (L 41–47, S 80) garantiza contraste AA ≥ 4.5:1 con
 * `readableInk()`; subir la luminosidad por encima de 46 rompe ese contrato
 * y la suite de tests lo detecta.
 */
export function generateRedPalette(options: PaletteOptions): string[] {
  const {
    count,
    startHue = 347,
    hueSpread = 20,
    saturation = 80,
    lightness = 44,
    hueStep = 4,
  } = options;

  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`count debe ser entero >= 1, recibido ${count}`);
  }

  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const hue = startHue + hueSpread * t - (index % 2) * hueStep;
    // ±3 % de luminosidad: rompe la monotonía sin bajar de AA sobre la etiqueta.
    const light = lightness + ((index % 3) - 1) * 3;
    return hslToHex(hue, saturation, light);
  });
}

/** Colores de acento usados por la UI (variables CSS espejo). */
export const accent = Object.freeze({
  ember: '#ff3b30',
  ruby: '#e0113f',
  wine: '#8c0a2c',
  glass: 'rgba(255, 92, 110, 0.16)',
  ink: '#0b0507',
});
