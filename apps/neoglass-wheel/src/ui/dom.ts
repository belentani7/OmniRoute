/** Helpers de DOM tipados y sin `any`: evitan casts dispersos por la app. */

export function mustGet<T extends Element>(
  selector: string,
  ctor: abstract new (...args: never[]) => T,
  root: ParentNode = document,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof ctor)) {
    throw new Error(`Elemento no encontrado o de tipo inesperado: ${selector}`);
  }
  return element;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Formatea una fracción [0,1] como porcentaje legible en español. */
export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
