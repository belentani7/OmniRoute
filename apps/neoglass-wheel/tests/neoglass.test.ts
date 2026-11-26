import { describe, expect, it } from 'vitest';
import { clampPercent, installNeoGlass, trackPointerLight } from '../src/ui/neoglass.js';

/**
 * La suite corre en entorno `node`, sin DOM global. Se construye un DOM mínimo
 * a mano (no JSDOM) porque lo único que se mide es aritmética de caja y
 * gestión de listeners: montar un motor de layout entero sería desproporcionado
 * y más frágil, no más riguroso.
 */

interface FakeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** `DOMTokenList` mínimo: la API real expone add/remove/contains/toggle. */
class FakeClassList {
  readonly tokens = new Set<string>();

  add(...names: string[]): void {
    for (const name of names) this.tokens.add(name);
  }

  remove(...names: string[]): void {
    for (const name of names) this.tokens.delete(name);
  }

  contains(name: string): boolean {
    return this.tokens.has(name);
  }

  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.tokens.has(name);
    if (next) this.tokens.add(name);
    else this.tokens.delete(name);
    return next;
  }
}

/** `CSSStyleDeclaration` mínimo, con la misma superficie que usa el módulo. */
class FakeStyle {
  readonly props = new Map<string, string>();
  left = '';
  top = '';

  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.props.get(name) ?? '';
  }

  removeProperty(name: string): void {
    this.props.delete(name);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly style = new FakeStyle();
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly appended: FakeElement[] = [];
  rect: FakeRect;
  offsetWidth = 200;
  className = '';
  removedChildren = 0;
  readonly attributes = new Map<string, string>();

  constructor(rect: FakeRect = { left: 0, top: 0, width: 200, height: 100 }) {
    this.rect = rect;
  }

  get ownerDocument(): { createElement: (tag: string) => FakeElement } {
    return { createElement: () => new FakeElement() };
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(handler);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  getBoundingClientRect(): FakeRect {
    return this.rect;
  }

  append(child: FakeElement): void {
    this.appended.push(child);
  }

  remove(): void {
    this.removedChildren += 1;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
  }

  listenerCount(): number {
    let total = 0;
    for (const bucket of this.listeners.values()) total += bucket.size;
    return total;
  }
}

/** Vitest no necesita DOM: se declara lo justo en globalThis. */
function withMatchMedia(reduced: boolean, run: () => void): void {
  const host = globalThis as unknown as {
    window?: { matchMedia?: unknown } | undefined;
  };
  const hadWindow = 'window' in host;
  const previousWindow = host.window;
  host.window = { matchMedia: () => ({ matches: reduced }) as MediaQueryList };
  try {
    run();
  } finally {
    if (hadWindow) host.window = previousWindow;
    else delete host.window;
  }
}

describe('clampPercent', () => {
  it('deja intactos los valores dentro de rango', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(100)).toBe(100);
  });

  it('recorta fuera de rango y cae al centro con NaN o infinito', () => {
    expect(clampPercent(-30)).toBe(0);
    expect(clampPercent(180)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(50);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(50);
  });
});

describe('trackPointerLight', () => {
  it('traduce la posición del puntero a porcentaje de la caja', () => {
    const element = new FakeElement({
      left: 100,
      top: 50,
      width: 200,
      height: 100,
    }) as unknown as HTMLElement;
    expect(trackPointerLight(element, 200, 100)).toBe(true);
    const style = element.style;
    expect(style.getPropertyValue('--ng-mx')).toBe('50.00%');
    expect(style.getPropertyValue('--ng-my')).toBe('50.00%');
  });

  it('recorta el puntero que se sale de la caja', () => {
    const element = new FakeElement({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    }) as unknown as HTMLElement;
    trackPointerLight(element, -400, 900);
    expect(element.style.getPropertyValue('--ng-mx')).toBe('0.00%');
    expect(element.style.getPropertyValue('--ng-my')).toBe('100.00%');
  });

  it('devuelve false y no escribe nada si el elemento no tiene caja', () => {
    const element = new FakeElement({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    }) as unknown as HTMLElement;
    expect(trackPointerLight(element, 10, 10)).toBe(false);
    expect(element.style.getPropertyValue('--ng-mx')).toBe('');
  });
});

describe('installNeoGlass', () => {
  function makeRoot(elements: FakeElement[]): ParentNode {
    return {
      querySelectorAll: () => elements as unknown as NodeListOf<Element>,
    } as unknown as ParentNode;
  }

  it('marca cada objetivo como cristal y escribe el radio de halo', () => {
    const a = new FakeElement();
    const b = new FakeElement();
    withMatchMedia(false, () => {
      installNeoGlass(makeRoot([a, b]), { haloRadius: 200 });
    });
    expect(a.classList.contains('ng-glass')).toBe(true);
    expect(b.classList.contains('ng-glass')).toBe(true);
    expect(a.style.props.get('--ng-halo')).toBe('200px');
  });

  it('el halo sigue al puntero y se retira al salir', () => {
    const a = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    withMatchMedia(false, () => {
      installNeoGlass(makeRoot([a]));
    });
    a.dispatch('pointermove', { clientX: 25, clientY: 75 });
    expect(a.classList.contains('is-hovering')).toBe(true);
    expect(a.style.props.get('--ng-mx')).toBe('25.00%');

    a.dispatch('pointerleave', {});
    expect(a.classList.contains('is-hovering')).toBe(false);
    expect(a.style.props.get('--ng-mx')).toBe('50%');
  });

  it('crea una onda en pointerdown y la retira con animationend', () => {
    const a = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    withMatchMedia(false, () => {
      installNeoGlass(makeRoot([a]));
      a.dispatch('pointerdown', { clientX: 10, clientY: 10 });
    });
    expect(a.appended).toHaveLength(1);
    const ripple = a.appended[0] as FakeElement;
    expect(ripple.className).toBe('ng-ripple');
    expect(ripple.style.left).toBe('10px');
    expect(ripple.style.top).toBe('10px');
    ripple.dispatch('animationend', {});
    expect(ripple.removedChildren).toBe(1);
  });

  it('con prefers-reduced-motion no genera onda ni pulso, pero sí escucha el puntero', () => {
    const a = new FakeElement({ left: 0, top: 0, width: 100, height: 100 });
    withMatchMedia(true, () => {
      installNeoGlass(makeRoot([a]));
      a.dispatch('pointerdown', { clientX: 10, clientY: 10 });
    });
    expect(a.appended).toHaveLength(0);
    expect(a.listenerCount()).toBe(3);
  });

  it('la limpieza retira listeners, clases y variables', () => {
    const a = new FakeElement();
    let dispose = () => {};
    withMatchMedia(false, () => {
      dispose = installNeoGlass(makeRoot([a]));
    });
    expect(a.listenerCount()).toBe(3);
    dispose();
    expect(a.listenerCount()).toBe(0);
    expect(a.classList.contains('ng-glass')).toBe(false);
    expect(a.style.props.has('--ng-mx')).toBe(false);
    expect(a.style.props.has('--ng-halo')).toBe(false);
  });

  it('un contenedor vacío produce una limpieza inofensiva', () => {
    const dispose = installNeoGlass(makeRoot([]));
    expect(() => {
      dispose();
    }).not.toThrow();
  });
});
