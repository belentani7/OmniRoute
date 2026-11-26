/**
 * NeoGlass — motor de microinteracciones ópticas.
 *
 * Reimplementa en TypeScript estricto el comportamiento del motor reactivo
 * NeoGlass de BELENTANI//OS (2026-09-03, Google Drive), del que se toma la
 * IDEA y no el código: aquel material es AGPLv3 y este repositorio es MIT.
 * Ver docs/PROCEDENCIA.md. Tres correcciones deliberadas frente a él:
 *
 * 1. Sin bucle permanente: el original escribía `--plasma-time` en cada frame
 *    de por vida. Aquí no hay `requestAnimationFrame` continuo; solo se anima
 *    lo que responde a un gesto.
 * 2. Sin tilt 3D sobre controles: inclinar un botón que recibe foco o clic
 *    desalinea el puntero y marea. La luz sigue al puntero; el plano no gira.
 * 3. Accesible por defecto: `prefers-reduced-motion` desactiva la onda y el
 *    pulso, y no se toca ningún atributo ARIA que ya gestione la app.
 *
 * Las clases viven en `styles/neoglass-core.css`; esto solo calcula y aplica
 * variables CSS, sin crear nodos fuera del propio elemento.
 */

export interface NeonGlassOptions {
  /** Selector de los elementos que reciben la capa óptica. */
  readonly selector?: string;
  /** Radio del halo que sigue al puntero, en px. Se usa como `radial-gradient`. */
  readonly haloRadius?: number;
}

const DEFAULT_SELECTOR = '[data-ng-glass]';
/** Un halo mayor que el propio control se ve sucio; 160px es el valor del original. */
const DEFAULT_HALO = 160;

/**
 * ¿El sistema pide menos movimiento? Se evalúa en cada gesto en lugar de
 * cachearse: el usuario puede cambiar la preferencia con la página abierta.
 * Tolera entornos sin `window` (Node, pruebas) devolviendo `false`, que es la
 * respuesta correcta: sin API de preferencias no hay nada que respetar.
 */
export function prefersReducedMotion(): boolean {
  const query = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)');
  return query?.matches ?? false;
}

/**
 * Aplica la luz de puntero a un elemento: escribe `--ng-mx` y `--ng-my` con la
 * posición relativa en porcentaje. Devuelve `false` si el elemento no tiene
 * caja (0×0), caso típico de un nodo aún no montado o `display:none`.
 */
export function trackPointerLight(element: Element, clientX: number, clientY: number): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  const style = (element as HTMLElement).style;
  style.setProperty('--ng-mx', `${clampPercent(x).toFixed(2)}%`);
  style.setProperty('--ng-my', `${clampPercent(y).toFixed(2)}%`);
  return true;
}

/** Limita a 0–100 para que un puntero fuera de la caja no desborde el degradado. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Lanza una onda desde el punto del clic. La elimina al terminar la animación,
 * con `animationend`, y además con un temporizador de respaldo: si la pestaña
 * está en segundo plano el evento puede no llegar nunca.
 */
export function spawnRipple(
  element: Element,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const host = element as HTMLElement;
  if (prefersReducedMotion()) return null;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const ripple = host.ownerDocument.createElement('span');
  ripple.className = 'ng-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.left = `${clientX - rect.left}px`;
  ripple.style.top = `${clientY - rect.top}px`;
  // El barrido especular y la onda comparten pseudo-elemento: se aísla la onda
  // en una capa propia para que el `::after` del barrido siga intacto.
  host.append(ripple);

  const remove = (): void => {
    ripple.remove();
  };
  ripple.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, 900);
  return ripple;
}

/** Pulso único de confirmación (el ganador del giro). Nunca en bucle. */
export function pulseOnce(element: Element, durationMs = 900): void {
  if (prefersReducedMotion()) return;
  const host = element as HTMLElement;
  host.classList.remove('is-pulsing');
  // Lectura de layout deliberada: sin ella, dos pulsos seguidos no reinician la
  // animación porque el navegador agrupa ambas mutaciones de clase.
  const reflow = host.offsetWidth;
  host.classList.add('is-pulsing');
  setTimeout(() => {
    host.classList.remove('is-pulsing');
  }, durationMs);
  // Se usa el valor leído para que el bundler no elimine la lectura.
  if (reflow < 0) host.classList.remove('is-pulsing');
}

/**
 * Instala la capa óptica sobre los elementos que casan con el selector.
 * Devuelve una función de limpieza que retira todos los listeners: la app no
 * filtra nada, así que esto es lo único que evita fugas en pruebas y en HMR.
 */
export function installNeoGlass(
  root: ParentNode = document,
  options: NeonGlassOptions = {},
): () => void {
  const selector = options.selector ?? DEFAULT_SELECTOR;
  const halo = options.haloRadius ?? DEFAULT_HALO;
  const targets = [...root.querySelectorAll(selector)];
  const teardown: (() => void)[] = [];

  for (const target of targets) {
    const host = target as HTMLElement;
    host.classList.add('ng-glass');
    host.style.setProperty('--ng-halo', `${halo}px`);

    const onMove = (event: PointerEvent): void => {
      if (!trackPointerLight(host, event.clientX, event.clientY)) return;
      host.classList.add('is-hovering');
    };
    const onLeave = (): void => {
      host.classList.remove('is-hovering');
      host.style.setProperty('--ng-mx', '50%');
      host.style.setProperty('--ng-my', '50%');
    };
    const onDown = (event: PointerEvent): void => {
      spawnRipple(host, event.clientX, event.clientY);
    };

    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });
    host.addEventListener('pointerdown', onDown, { passive: true });

    teardown.push(() => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      host.classList.remove('ng-glass', 'is-hovering', 'is-pulsing');
      host.style.removeProperty('--ng-mx');
      host.style.removeProperty('--ng-my');
      host.style.removeProperty('--ng-halo');
    });
  }

  return () => {
    for (const dispose of teardown) dispose();
  };
}
