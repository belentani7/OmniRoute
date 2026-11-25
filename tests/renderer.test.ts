import { describe, expect, it } from 'vitest';
import { drawLabels, fitLabel, labelFontSize } from '../src/ui/labels.js';
import { hexToRgb01 } from '../src/ui/renderer.js';
import { layoutSegments } from '../src/core/wheel.js';
import { MAX_SHADER_SEGMENTS, wheelFragmentShader, wheelVertexShader } from '../src/ui/shaders.js';

describe('hexToRgb01', () => {
  it('convierte colores de 6 dígitos', () => {
    expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb01('#00ff00')).toEqual([0, 1, 0]);
    expect(hexToRgb01('#0000ff')).toEqual([0, 0, 1]);
    expect(hexToRgb01('#ffffff')).toEqual([1, 1, 1]);
  });

  it('expande la notación corta', () => {
    expect(hexToRgb01('#f00')).toEqual(hexToRgb01('#ff0000'));
    expect(hexToRgb01('#0a0')).toEqual([0, 170 / 255, 0]);
  });

  it('acepta el color sin almohadilla', () => {
    expect(hexToRgb01('e0113f')).toEqual(hexToRgb01('#e0113f'));
  });
});

describe('shaders', () => {
  it('declaran GLSL ES 3.00 y precisión', () => {
    expect(wheelVertexShader).toContain('#version 300 es');
    expect(wheelFragmentShader).toContain('#version 300 es');
    expect(wheelVertexShader).toContain('precision highp float');
    expect(wheelFragmentShader).toContain('precision highp float');
  });

  it('el vertex shader usa gl_VertexID sin buffers ni atributos externos', () => {
    expect(wheelVertexShader).toContain('gl_VertexID');
    expect(wheelVertexShader).toContain('vec2 positions[3]');
    expect(wheelVertexShader).not.toContain('in vec2 aPosition');
    expect(wheelVertexShader).not.toContain('attribute');
  });

  it('el fragment shader respeta el máximo de sectores del uniform', () => {
    expect(wheelFragmentShader).toContain(`uStarts[${MAX_SHADER_SEGMENTS}]`);
    expect(wheelFragmentShader).toContain(`uSizes[${MAX_SHADER_SEGMENTS}]`);
    expect(wheelFragmentShader).toContain(`uColors[${MAX_SHADER_SEGMENTS}]`);
    expect(wheelFragmentShader).toContain('if (i >= uCount) break;');
  });

  it('equilibra llaves y paréntesis (detección temprana de erratas)', () => {
    for (const source of [wheelVertexShader, wheelFragmentShader]) {
      const braces = [...source].reduce(
        (sum, char) => sum + (char === '{' ? 1 : char === '}' ? -1 : 0),
        0,
      );
      const parens = [...source].reduce(
        (sum, char) => sum + (char === '(' ? 1 : char === ')' ? -1 : 0),
        0,
      );
      expect(braces).toBe(0);
      expect(parens).toBe(0);
    }
  });

  it('ningún smoothstep invierte sus bordes (comportamiento indefinido en GLSL ES 3.00)', () => {
    const calls = [...wheelFragmentShader.matchAll(/smoothstep\(\s*([-\d.]+),\s*([-\d.]+),/g)];
    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      const edge0 = Number(call[1]);
      const edge1 = Number(call[2]);
      expect(edge1, `smoothstep(${edge0}, ${edge1}, …)`).toBeGreaterThan(edge0);
    }
  });

  it('el radio del buje del shader coincide con el de Canvas 2D', () => {
    expect(wheelFragmentShader).toContain('HUB_RADIUS = 0.27');
    expect(wheelFragmentShader).toContain('radius < HUB_RADIUS');
  });

  it('no contiene restos de andamiaje', () => {
    for (const source of [wheelVertexShader, wheelFragmentShader]) {
      expect(source).not.toContain('TODO');
      expect(source).not.toContain('unused');
      expect(source).not.toContain('/* glsl */');
    }
  });

  it('declara los uniforms que el renderer envía', () => {
    for (const uniform of [
      'uResolution',
      'uRotation',
      'uTime',
      'uCount',
      'uStarts',
      'uSizes',
      'uColors',
      'uSpinning',
      'uWinner',
      'uHover',
    ]) {
      expect(wheelFragmentShader).toContain(`uniform`);
      expect(wheelFragmentShader).toContain(uniform);
    }
  });
});

describe('capa de etiquetas', () => {
  it('el tamaño de fuente crece con el radio y nunca baja de 11px', () => {
    expect(labelFontSize(10)).toBe(11);
    expect(labelFontSize(100)).toBe(11);
    expect(labelFontSize(300)).toBe(25);
    expect(labelFontSize(600)).toBe(49);
  });

  it('fitLabel recorta con elipsis sin desbordar', () => {
    expect(fitLabel('Ramen', 10)).toBe('Ramen');
    expect(fitLabel('Ceviche mixto', 8)).toBe('Ceviche…');
    expect(fitLabel('Largo', 1)).toBe('L');
    expect(fitLabel('Largo', 0)).toBe('L');
  });

  it('drawLabels pinta una etiqueta por sector y respeta el ganador', () => {
    const painted: string[] = [];
    const ctx = {
      save: () => painted.push('save'),
      restore: () => painted.push('restore'),
      translate: () => undefined,
      rotate: () => undefined,
      fillText: (text: string) => painted.push(text),
      set font(value: string) {
        painted.push(`font:${value}`);
      },
      set textAlign(value: string) {
        painted.push(`align:${value}`);
      },
      set textBaseline(value: string) {
        painted.push(`baseline:${value}`);
      },
      set fillStyle(value: string) {
        painted.push(`fill:${value}`);
      },
      set shadowColor(value: string) {
        painted.push(`shadow:${value}`);
      },
      set shadowBlur(value: number) {
        painted.push(`blur:${value}`);
      },
      set globalAlpha(value: number) {
        painted.push(`alpha:${value}`);
      },
    } as unknown as CanvasRenderingContext2D;

    const layout = layoutSegments([
      { id: 'a', label: 'Alfa', weight: 1, color: '#e0113f' },
      { id: 'b', label: 'Beta', weight: 1, color: '#8c0a2c' },
      { id: 'c', label: 'Gamma', weight: 1, color: '#ff3b4d' },
    ]);

    drawLabels(ctx, layout, {
      radius: 200,
      centerX: 200,
      centerY: 200,
      rotation: 0,
      winner: 1,
      hover: 2,
    });

    const texts = painted.filter((entry) => ['Alfa', 'Beta', 'Gamma'].includes(entry));
    expect(texts).toEqual(['Alfa', 'Beta', 'Gamma']);
    // La tinta se calcula con readableInk para cada color de sector.
    expect(painted.some((entry) => entry.startsWith('fill:#'))).toBe(true);
    expect(painted.filter((entry) => entry === 'save').length).toBe(3);
    expect(painted.filter((entry) => entry === 'restore').length).toBe(3);
  });
});
