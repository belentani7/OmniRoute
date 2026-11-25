/**
 * E2E del camino feliz.
 *
 * Se compila `src/main.ts` con esbuild (el mismo bundler que usa Vite) y el
 * bundle resultante se ejecuta dentro de JSDOM sobre el `index.html` real.
 * Así la prueba recorre exactamente el código de producción: degradación de
 * WebGL2 a Canvas 2D, listeners, render de listas, giro y anuncio del ganador.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

let bundle = '';

beforeAll(() => {
  const result = buildSync({
    entryPoints: [resolve(root, 'src/main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild no generó el bundle');
  bundle = output.text;
});

interface Harness {
  dom: JSDOM;
  frames: FrameRequestCallback[];
  flush(maxMs?: number): void;
}

/** Contexto 2D mínimo pero fiel: registra las llamadas de pintado. */
function createContext2d() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context: Record<string, unknown> = {
    calls,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  const methods = [
    'save',
    'restore',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'arc',
    'fill',
    'stroke',
    'clearRect',
    'fillText',
    'strokeText',
    'translate',
    'rotate',
    'scale',
    'setTransform',
    'clip',
    'rect',
  ];
  for (const method of methods) {
    context[method] = (...args: unknown[]) => {
      calls.push(`${method}:${args.length}`);
    };
  }
  return context;
}

function boot(): Harness {
  const dom = new JSDOM(html, {
    url: 'https://wheel.test/#seed=demo&preset=comer',
    runScripts: 'outside-only',
    pretendToBeVisual: false,
  });
  const { window } = dom;
  const frames: FrameRequestCallback[] = [];
  let rafId = 0;

  // --- APIs de navegador que jsdom no implementa --------------------------
  const contexts = new WeakMap<HTMLCanvasElement, Record<string, unknown>>();
  window.HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
  ) {
    // WebGL2 ausente a propósito: se verifica la degradación a Canvas 2D.
    if (kind === 'webgl2') return null;
    const cached = contexts.get(this);
    if (cached) return cached;
    const context = createContext2d();
    context.canvas = this;
    contexts.set(this, context);
    return context;
  } as unknown as typeof window.HTMLCanvasElement.prototype.getContext;

  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    width: 400,
    height: 400,
    top: 0,
    left: 0,
    right: 400,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  class ResizeObserverStub {
    observe(): void {
      /* geometría fija en el stub del canvas */
    }
    disconnect(): void {
      /* nada que liberar */
    }
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia;

  (window as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (
    callback: FrameRequestCallback,
  ) => {
    frames.push(callback);
    rafId += 1;
    return rafId;
  };
  (window as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = (id: number) => {
    frames[id - 1] = () => undefined;
  };
  (window as unknown as { devicePixelRatio: number }).devicePixelRatio = 1;

  // El bundle se ejecuta en el ámbito de la ventana de JSDOM.
  (window as unknown as { console: Console }).console = console;
  window.eval(bundle);

  const flush = (maxMs = 20_000): void => {
    let now = 0;
    while (frames.length > 0 && now < maxMs) {
      const batch = frames.splice(0, frames.length);
      now += 16;
      for (const callback of batch) callback(now);
    }
  };

  return { dom, frames, flush };
}

let harness: Harness | null = null;

/** Selector tipado por cast explícito en el punto de uso (una sola frontera). */
function q<T extends Element>(selector: string): T {
  const element = harness?.dom.window.document.querySelector(selector);
  if (!element) throw new Error(`No existe ${selector}`);
  return element as unknown as T;
}

const fire = (target: EventTarget, type: string, init: Record<string, unknown> = {}): void => {
  if (!harness) throw new Error('sin harness');
  const { window } = harness.dom;
  target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true, ...init }));
};

afterEach(() => {
  harness?.dom.window.close();
  harness = null;
  vi.unstubAllGlobals();
});

describe('E2E · arranque y pintado', () => {
  it('renderiza marca, leyenda, opciones y facts del preset', () => {
    harness = boot();

    expect(q('.brand__text strong').textContent).toBe('NeoGlassRojo');
    expect(q('.brand__text em').textContent).toBe('Belentani Wheel');
    expect(q('#renderer-pill').textContent).toBe('Canvas 2D');
    expect(q('#fact-renderer').textContent).toBe('Canvas 2D');
    expect(q('#fact-count').textContent).toBe('6');
    expect(q('#fact-seed').textContent).toBe('demo');
    expect(q('#legend').children).toHaveLength(6);
    expect(q('#options').children).toHaveLength(6);
    expect(q('#wheel-a11y').textContent).toContain('6 opciones');
    expect(q('#preset-hint').textContent).toContain('Seis antojos');
  });

  it('el canvas recibe un contexto y se pinta al menos un frame', () => {
    harness = boot();
    const canvas = q<HTMLCanvasElement>('#wheel');
    const context = canvas.getContext('2d') as unknown as { calls: string[] };
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    // Un frame completo dibuja 6 sectores (arc + fill) y etiquetas.
    expect(context.calls.filter((call) => call.startsWith('arc:')).length).toBeGreaterThanOrEqual(
      6,
    );
    expect(context.calls.some((call) => call.startsWith('fillText:'))).toBe(true);
  });
});

describe('E2E · camino feliz del giro', () => {
  it('gira, anuncia un ganador válido y lo registra en historial y leyenda', () => {
    harness = boot();
    const spinButton = q<HTMLButtonElement>('#spin');

    spinButton.click();
    expect(spinButton.disabled).toBe(true);
    expect(spinButton.classList.contains('is-spinning')).toBe(true);
    expect(q('#result-card').getAttribute('data-state')).toBe('spinning');
    expect(q('#spin-label').textContent).toBe('Girando');

    harness.flush();

    const value = q('#result-value').textContent ?? '';
    expect(['Ramen', 'Sushi', 'Tacos', 'Pizza', 'Poke', 'Ceviche']).toContain(value);
    expect(q('#result-card').getAttribute('data-state')).toBe('won');
    expect(q('#result-meta').textContent).toContain('de probabilidad');
    expect(q('#result-meta').textContent).toContain('semilla');
    expect(spinButton.disabled).toBe(false);
    expect(q('#spin-label').textContent).toBe('Girar de nuevo');

    const history = q('#history');
    expect(history.children).toHaveLength(1);
    expect(history.textContent).toContain(value);

    const active = q('#legend li[data-active="true"]');
    expect(active.textContent).toContain(value);
    expect(q<HTMLParagraphElement>('#history-empty').hidden).toBe(true);
  });

  it('dos giros consecutivos se acumulan en el historial', () => {
    harness = boot();
    q<HTMLButtonElement>('#spin').click();
    harness.flush();
    q<HTMLButtonElement>('#spin').click();
    harness.flush();
    expect(q('#history').children).toHaveLength(2);
  });

  it('la semilla cambia en cada giro y queda en la URL', () => {
    harness = boot();
    q<HTMLButtonElement>('#spin').click();
    harness.flush();
    const seed = q('#fact-seed').textContent ?? '';
    expect(seed).not.toBe('demo');
    expect(harness.dom.window.location.hash).toContain(encodeURIComponent(seed).slice(0, 6));
  });
});

describe('E2E · edición de opciones', () => {
  it('añade una opción, rechaza duplicados y permite eliminarla', () => {
    harness = boot();
    const form = q<HTMLFormElement>('#adder');
    const input = q<HTMLInputElement>('#new-label');

    input.value = 'Focaccia';
    fire(form, 'submit');

    expect(q('#options').children).toHaveLength(7);
    expect(q('#fact-count').textContent).toBe('7');
    expect(input.value).toBe('');

    input.value = 'focaccia';
    fire(form, 'submit');
    const error = q<HTMLParagraphElement>('#form-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('ya está en la rueda');
    expect(q('#options').children).toHaveLength(7);

    // Escribir de nuevo retira el error de validación.
    input.value = 'Foca';
    fire(input, 'input');
    expect(q<HTMLParagraphElement>('#form-error').hidden).toBe(true);

    q<HTMLButtonElement>('#options li:last-child .option__remove').click();
    expect(q('#options').children).toHaveLength(6);
  });

  it('no permite bajar de 2 opciones (botones de borrado deshabilitados)', () => {
    harness = boot();
    for (let i = 0; i < 4; i += 1) {
      q<HTMLButtonElement>('#options li:last-child .option__remove').click();
    }
    expect(q('#options').children).toHaveLength(2);
    for (const button of q('#options').querySelectorAll<HTMLButtonElement>('.option__remove')) {
      expect(button.disabled).toBe(true);
    }
  });

  it('cambia de preset y reinicia el resultado visible', () => {
    harness = boot();
    q<HTMLButtonElement>('#spin').click();
    harness.flush();
    expect(q('#result-card').getAttribute('data-state')).toBe('won');

    const devChip = [
      ...harness.dom.window.document.querySelectorAll<HTMLButtonElement>('.chip'),
    ].find((chip) => chip.textContent === 'Siguiente tarea');
    expect(devChip).toBeDefined();
    devChip?.click();

    expect(q('#preset-hint').textContent).toContain('Prioriza el sprint');
    expect(q('#options').children).toHaveLength(6);
    expect(q('#result-value').textContent).toBe('—');

    // Los chips se re-renderizan: se consulta el nuevo nodo, no la referencia vieja.
    const pressed = [
      ...harness.dom.window.document.querySelectorAll<HTMLButtonElement>(
        '.chip[aria-pressed="true"]',
      ),
    ];
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent).toBe('Siguiente tarea');
  });

  it('persiste el estado en localStorage', () => {
    harness = boot();
    const raw = harness.dom.window.localStorage.getItem('neoglassrojo:wheel:v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ presetId: 'comer' });
  });
});

describe('E2E · teclado y accesibilidad', () => {
  it('espacio dispara el giro sin recargar la página', () => {
    harness = boot();
    const event = new harness.dom.window.KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    harness.dom.window.document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(q<HTMLButtonElement>('#spin').disabled).toBe(true);
    harness.flush();
    expect(q('#result-card').getAttribute('data-state')).toBe('won');
  });

  it('las flechas recorren las opciones sin girar', () => {
    harness = boot();
    const press = (key: string) => {
      harness?.dom.window.document.dispatchEvent(
        new harness.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    };
    press('ArrowRight');
    expect(q('#result-value').textContent).toBe('Ramen');
    expect(q('#result-meta').textContent).toContain('Navegando');
    press('ArrowLeft');
    expect(q('#result-value').textContent).toBe('Ceviche');
    expect(q('#result-card').getAttribute('data-state')).toBe('idle');
  });

  it('estructura semántica: un h1, landmarks y enlace de salto', () => {
    harness = boot();
    const doc = harness.dom.window.document;
    expect(doc.querySelectorAll('main')).toHaveLength(1);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('header.topbar')).not.toBeNull();
    expect(doc.querySelector('footer')).not.toBeNull();
    expect(doc.querySelector('.skip-link')?.getAttribute('href')).toBe('#rueda');
    expect(doc.documentElement.lang).toBe('es');
  });

  it('todos los controles tienen nombre accesible', () => {
    harness = boot();
    const doc = harness.dom.window.document;

    for (const button of doc.querySelectorAll('button')) {
      const name = (button.textContent ?? '').trim() || (button.getAttribute('aria-label') ?? '');
      expect(name.length, `botón sin nombre: ${button.outerHTML.slice(0, 90)}`).toBeGreaterThan(0);
    }

    for (const input of doc.querySelectorAll('input')) {
      const hasLabel = input.id !== '' && doc.querySelector(`label[for="${input.id}"]`) !== null;
      const hasAria = (input.getAttribute('aria-label') ?? '').trim() !== '';
      expect(hasLabel || hasAria, `input sin etiqueta: ${input.outerHTML.slice(0, 90)}`).toBe(true);
    }

    expect(doc.querySelector('#result-card')?.getAttribute('aria-live')).toBe('polite');
    expect(doc.querySelector('#form-error')?.getAttribute('role')).toBe('alert');
    expect(doc.querySelector('#wheel')?.getAttribute('aria-labelledby')).toBe('wheel-a11y');
  });
});
