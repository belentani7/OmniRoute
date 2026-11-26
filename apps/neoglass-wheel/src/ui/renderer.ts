import type { PlacedSegment } from '../core/types.js';
import { accent } from '../core/theme.js';
import { drawLabels } from './labels.js';
import { MAX_SHADER_SEGMENTS, wheelFragmentShader, wheelVertexShader } from './shaders.js';

export type RendererKind = 'webgl' | 'canvas2d';

export interface RenderState {
  readonly rotation: number;
  readonly spinning: number;
  readonly winner: number;
  readonly hover: number;
  /** Tiempo acumulado en segundos (pausado si la pestaña está oculta). */
  readonly time: number;
}

export interface WheelRenderer {
  readonly kind: RendererKind;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setLayout(layout: readonly PlacedSegment[]): void;
  render(state: RenderState): void;
  destroy(): void;
}

/** Convierte `#rrggbb` en componentes [0,1] para uniformes vec3. */
export function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('No se pudo crear el shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'sin log';
    gl.deleteShader(shader);
    throw new Error(
      `Error compilando ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}: ${log}`,
    );
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error('No se pudo crear el programa WebGL');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'sin log';
    gl.deleteProgram(program);
    throw new Error(`Error enlazando programa: ${log}`);
  }
  return program;
}

type UniformName =
  | 'uResolution'
  | 'uRotation'
  | 'uTime'
  | 'uCount'
  | 'uStarts'
  | 'uSizes'
  | 'uColors'
  | 'uSpinning'
  | 'uWinner'
  | 'uHover';

export class WebglWheelRenderer implements WheelRenderer {
  readonly kind = 'webgl' as const;
  readonly #gl: WebGL2RenderingContext;
  readonly #program: WebGLProgram;
  /**
   * Capa 2D hermana, superpuesta por CSS, sólo para el texto: la GPU pinta el
   * cristal y el navegador rasteriza las etiquetas con nitidez subpíxel.
   */
  readonly #labelCanvas: HTMLCanvasElement;
  readonly #labelCtx: CanvasRenderingContext2D;
  #layout: readonly PlacedSegment[] = [];
  #cssWidth = 1;
  #cssHeight = 1;
  readonly #uniforms = new Map<UniformName, WebGLUniformLocation | null>();
  readonly #starts = new Float32Array(MAX_SHADER_SEGMENTS);
  readonly #sizes = new Float32Array(MAX_SHADER_SEGMENTS);
  readonly #colors = new Float32Array(MAX_SHADER_SEGMENTS * 3);
  #count = 0;
  #dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) throw new Error('WebGL2 no disponible');

    const labelCanvas = canvas.ownerDocument.createElement('canvas');
    const labelCtx = labelCanvas.getContext('2d');
    if (!labelCtx) throw new Error('Canvas 2D no disponible para etiquetas');
    labelCanvas.className = 'wheel-labels';
    labelCanvas.setAttribute('aria-hidden', 'true');
    canvas.after(labelCanvas);

    this.#gl = gl;
    this.#program = link(gl, wheelVertexShader, wheelFragmentShader);
    this.#labelCanvas = labelCanvas;
    this.#labelCtx = labelCtx;

    // Quad a pantalla completa sin buffers: gl_VertexID genera los vértices.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.useProgram(this.#program);

    for (const name of [
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
    ] as const) {
      this.#uniforms.set(name, gl.getUniformLocation(this.#program, name));
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const gl = this.#gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    this.#dpr = Math.min(dpr, 2);
    this.#cssWidth = cssWidth;
    this.#cssHeight = cssHeight;
    canvas.width = Math.max(1, Math.round(cssWidth * this.#dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * this.#dpr));
    this.#labelCanvas.width = canvas.width;
    this.#labelCanvas.height = canvas.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  setLayout(layout: readonly PlacedSegment[]): void {
    this.#layout = layout;
    const count = Math.min(layout.length, MAX_SHADER_SEGMENTS);
    this.#count = count;
    for (let i = 0; i < count; i += 1) {
      const placed = layout[i] as PlacedSegment;
      this.#starts[i] = placed.start;
      this.#sizes[i] = placed.size;
      const [r, g, b] = hexToRgb01(placed.segment.color);
      this.#colors[i * 3] = r;
      this.#colors[i * 3 + 1] = g;
      this.#colors[i * 3 + 2] = b;
    }
  }

  #uniform(name: UniformName): WebGLUniformLocation | null {
    return this.#uniforms.get(name) ?? null;
  }

  render(state: RenderState): void {
    const gl = this.#gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.useProgram(this.#program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(this.#uniform('uResolution'), canvas.width, canvas.height);
    gl.uniform1f(this.#uniform('uRotation'), state.rotation % 360);
    gl.uniform1f(this.#uniform('uTime'), state.time);
    gl.uniform1i(this.#uniform('uCount'), this.#count);
    gl.uniform1fv(this.#uniform('uStarts'), this.#starts);
    gl.uniform1fv(this.#uniform('uSizes'), this.#sizes);
    gl.uniform3fv(this.#uniform('uColors'), this.#colors);
    gl.uniform1f(this.#uniform('uSpinning'), state.spinning);
    gl.uniform1f(this.#uniform('uWinner'), state.winner);
    gl.uniform1f(this.#uniform('uHover'), state.hover);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const ctx = this.#labelCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#labelCanvas.width, this.#labelCanvas.height);
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    const radius = Math.min(this.#cssWidth, this.#cssHeight) / 2;
    drawLabels(ctx, this.#layout, {
      radius,
      centerX: this.#cssWidth / 2,
      centerY: this.#cssHeight / 2,
      rotation: state.rotation,
      winner: state.winner,
      hover: state.hover,
    });
  }

  destroy(): void {
    const gl = this.#gl;
    gl.deleteProgram(this.#program);
    gl.bindVertexArray(null);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.#labelCanvas.remove();
  }
}

/** Relleno radial de respaldo cuando sólo hay Canvas 2D. */
function radialGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r0: number,
  r1: number,
  stops: ReadonlyArray<readonly [number, string]>,
): CanvasGradient {
  const gradient = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

export class Canvas2dWheelRenderer implements WheelRenderer {
  readonly kind = 'canvas2d' as const;
  readonly #ctx: CanvasRenderingContext2D;
  #layout: readonly PlacedSegment[] = [];
  #width = 1;
  #height = 1;
  #dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.#ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const canvas = this.#ctx.canvas;
    this.#dpr = Math.min(dpr, 2);
    this.#width = Math.max(1, cssWidth);
    this.#height = Math.max(1, cssHeight);
    canvas.width = Math.round(this.#width * this.#dpr);
    canvas.height = Math.round(this.#height * this.#dpr);
  }

  setLayout(layout: readonly PlacedSegment[]): void {
    this.#layout = layout;
  }

  render(state: RenderState): void {
    const ctx = this.#ctx;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    ctx.clearRect(0, 0, this.#width, this.#height);

    const cx = this.#width / 2;
    const cy = this.#height / 2;
    const radius = Math.min(this.#width, this.#height) / 2 - 6;
    const hub = radius * 0.27;

    const rotationRad = ((state.rotation % 360) * Math.PI) / 180;

    for (const placed of this.#layout) {
      const start = (placed.start * Math.PI) / 180 + rotationRad - Math.PI / 2;
      const end = (placed.end * Math.PI) / 180 + rotationRad - Math.PI / 2;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = placed.segment.color;
      ctx.fill();

      // Bisel barato: brillo especular en la mitad superior del sector.
      ctx.fillStyle = radialGradient(ctx, cx, cy, radius * 0.2, radius, [
        [0, 'rgba(0,0,0,0.30)'],
        [0.55, 'rgba(255,255,255,0.045)'],
        [1, 'rgba(255,255,255,0.16)'],
      ]);
      ctx.fill();

      if (placed.index === state.winner) {
        ctx.fillStyle = 'rgba(255,120,130,0.20)';
        ctx.fill();
      } else if (placed.index === state.hover) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(255,225,228,0.42)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    // Etiquetas: la misma rutina que usa la ruta WebGL (una sola fuente de verdad).
    drawLabels(ctx, this.#layout, {
      radius,
      centerX: cx,
      centerY: cy,
      rotation: state.rotation,
      winner: state.winner,
      hover: state.hover,
    });

    // Buje central de cristal.
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, Math.PI * 2);
    ctx.fillStyle = radialGradient(ctx, cx, cy - hub * 0.3, hub * 0.1, hub, [
      [0, 'rgba(255,150,160,0.95)'],
      [0.6, accent.wine],
      [1, '#2a0209'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,220,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Aro exterior.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,190,195,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  destroy(): void {
    this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height);
  }
}

/**
 * Crea el mejor renderer disponible. Si WebGL2 falla en cualquier punto
 * (contexto ausente, shader roto, driver antiguo) se degrada a Canvas 2D
 * en lugar de mostrar una rueda vacía.
 */
export function createRenderer(canvas: HTMLCanvasElement): WheelRenderer {
  try {
    return new WebglWheelRenderer(canvas);
  } catch (error) {
    console.warn('[neoglassrojo] WebGL2 no disponible, usando Canvas 2D:', error);
    return new Canvas2dWheelRenderer(canvas);
  }
}
