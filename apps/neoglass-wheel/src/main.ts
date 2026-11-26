import { createRng } from './core/random.js';
import { getPreset, presetToSegments, presets } from './core/presets.js';
import { WheelStore } from './core/store.js';
import { generateRedPalette, readableInk } from './core/theme.js';
import type { Segment } from './core/types.js';
import { MAX_SEGMENTS, normalizeAngle, shortestDelta } from './core/wheel.js';
import { el, formatClock, formatPercent, mustGet, prefersReducedMotion } from './ui/dom.js';
import { installNeoGlass, pulseOnce } from './ui/neoglass.js';
import { WheelController } from './ui/wheel-controller.js';

const STORAGE_KEY = 'neoglassrojo:wheel:v1';
const MAX_HISTORY = 12;

interface HistoryEntry {
  readonly label: string;
  readonly at: string;
  readonly seed: string;
}

interface PersistedState {
  readonly presetId: string;
  readonly segments: readonly Segment[];
}

/* ------------------------------------------------------------------ DOM */
const dom = {
  canvas: mustGet('#wheel', HTMLCanvasElement),
  spin: mustGet('#spin', HTMLButtonElement),
  spinLabel: mustGet('#spin-label', HTMLElement),
  legend: mustGet('#legend', HTMLUListElement),
  options: mustGet('#options', HTMLOListElement),
  presets: mustGet('.presets', HTMLDivElement),
  adder: mustGet('#adder', HTMLFormElement),
  newLabel: mustGet('#new-label', HTMLInputElement),
  formError: mustGet('#form-error', HTMLParagraphElement),
  history: mustGet('#history', HTMLOListElement),
  historyEmpty: mustGet('#history-empty', HTMLParagraphElement),
  clearHistory: mustGet('#clear-history', HTMLButtonElement),
  shuffle: mustGet('#shuffle', HTMLButtonElement),
  reset: mustGet('#reset', HTMLButtonElement),
  resultCard: mustGet('#result-card', HTMLElement),
  resultValue: mustGet('#result-value', HTMLElement),
  resultMeta: mustGet('#result-meta', HTMLElement),
  presetHint: mustGet('#preset-hint', HTMLElement),
  weightSum: mustGet('#weight-sum', HTMLElement),
  rendererPill: mustGet('#renderer-pill', HTMLElement),
  fpsPill: mustGet('#fps-pill', HTMLElement),
  factRenderer: mustGet('#fact-renderer', HTMLElement),
  factCount: mustGet('#fact-count', HTMLElement),
  factAngle: mustGet('#fact-angle', HTMLElement),
  factSeed: mustGet('#fact-seed', HTMLElement),
  wheelA11y: mustGet('#wheel-a11y', HTMLElement),
} as const;

/* --------------------------------------------------------------- Estado */
let presetId: string = presets[0].id;
let seedInput = readSeedFromUrl();
let history: HistoryEntry[] = [];
let highlighted = -1;

function readSeedFromUrl(): string {
  const params = new URLSearchParams(globalThis.location.hash.replace(/^#/, ''));
  return params.get('seed') ?? 'belentani-wheel';
}

function writeSeedToUrl(seed: string): void {
  const params = new URLSearchParams({ seed, preset: presetId });
  globalThis.history.replaceState(null, '', `#${params.toString()}`);
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'segments' in parsed &&
      'presetId' in parsed &&
      Array.isArray((parsed as PersistedState).segments)
    ) {
      const candidate = parsed as PersistedState;
      const valid = candidate.segments.every(
        (segment) =>
          typeof segment?.id === 'string' &&
          typeof segment.label === 'string' &&
          typeof segment.weight === 'number' &&
          segment.weight > 0 &&
          typeof segment.color === 'string',
      );
      if (valid && candidate.segments.length >= 2) return candidate;
    }
  } catch {
    // localStorage puede estar bloqueado (modo privado, iframe): seguimos sin persistencia.
  }
  return null;
}

function persist(): void {
  try {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ presetId, segments: store.getSnapshot().segments }),
    );
  } catch {
    // Sin persistencia disponible: la app funciona igual.
  }
}

function initialSegments(): readonly Segment[] {
  const fromUrl = new URLSearchParams(globalThis.location.hash.replace(/^#/, '')).get('preset');
  const persisted = loadPersisted();
  if (fromUrl && getPreset(fromUrl)) {
    presetId = fromUrl;
    const fromUrlPreset = getPreset(fromUrl);
    if (fromUrlPreset) return presetToSegments(fromUrlPreset);
  }
  if (persisted && getPreset(persisted.presetId)) {
    presetId = persisted.presetId;
    return persisted.segments;
  }
  // `presets` es una tupla no vacía (PresetTuple): presets[0] siempre existe.
  const preset = getPreset(presetId) ?? presets[0];
  return presetToSegments(preset);
}

/* ------------------------------------------------- NeoGlass (capa óptica) */
// Los controles que reciben la microinteracción se marcan en el HTML con
// data-ng-glass; aquí solo se instala el motor y se guarda la limpieza.
const disposeNeoGlass = installNeoGlass(document);

const store = new WheelStore(initialSegments());

const controller = new WheelController(dom.canvas, store, {
  reducedMotion: prefersReducedMotion(),
  onFrame: () => {
    dom.factAngle.textContent = `${Math.round(normalizeAngle(store.getSnapshot().rotation))}°`;
  },
  onSettle: (snapshot, plan) => {
    const entry: HistoryEntry = {
      label: plan.segment.label,
      at: new Date().toISOString(),
      seed: seedInput,
    };
    history = [entry, ...history].slice(0, MAX_HISTORY);
    renderHistory();
    announceWinner(snapshot.segments[plan.index] ?? plan.segment, plan.index, true);
    dom.spin.disabled = false;
    dom.spin.classList.remove('is-spinning');
    dom.spinLabel.textContent = 'Girar de nuevo';
    dom.resultCard.dataset.state = 'won';
    persist();
  },
});

/* ------------------------------------------------------------- Render UI */
function segmentFraction(segment: Segment, segments: readonly Segment[]): number {
  const total = segments.reduce((sum, item) => sum + item.weight, 0);
  return segment.weight / total;
}

function renderLegend(): void {
  const { segments, lastIndex } = store.getSnapshot();
  dom.legend.replaceChildren(
    ...segments.map((segment, index) => {
      const item = el('li');
      if (lastIndex === index) item.dataset.active = 'true';
      const dot = el('span', 'legend__dot');
      dot.style.background = segment.color;
      dot.style.boxShadow = `0 0 10px ${segment.color}`;
      const pct = el('span', 'legend__pct', formatPercent(segmentFraction(segment, segments), 1));
      item.append(dot, el('span', undefined, segment.label), pct);
      return item;
    }),
  );
}

function renderOptions(): void {
  const { segments } = store.getSnapshot();
  dom.options.replaceChildren(
    ...segments.map((segment, index) => {
      const row = el('li', 'option');
      row.dataset.segmentId = segment.id;

      const swatch = el('span', 'option__swatch');
      swatch.style.background = `linear-gradient(150deg, ${segment.color}, ${readableInk(segment.color) === '#0b0507' ? '#5c061d' : '#2a0209'})`;

      const label = el('span', 'option__label', segment.label);
      label.title = segment.label;

      const weightWrap = el('div', 'option__weight');
      const sliderId = `weight-${segment.id}`;
      const slider = el('input');
      slider.type = 'range';
      slider.min = '0.2';
      slider.max = '3';
      slider.step = '0.1';
      slider.value = String(segment.weight);
      slider.id = sliderId;
      slider.setAttribute('aria-label', `Peso de ${segment.label}`);

      const pct = el('span', 'option__pct', formatPercent(segmentFraction(segment, segments), 0));

      slider.addEventListener('input', () => {
        const next = segments.map((item, i) =>
          i === index ? { ...item, weight: Number(slider.value) } : item,
        );
        applySegments(next, { keepHighlight: true, keepResult: true });
        const fresh = store.getSnapshot().segments;
        pct.textContent = formatPercent(segmentFraction(fresh[index] ?? segment, fresh), 0);
        dom.weightSum.textContent = `Σ ${fresh.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}`;
      });

      weightWrap.append(slider, pct);

      const remove = el('button', 'option__remove', '×');
      remove.type = 'button';
      remove.title = `Quitar ${segment.label}`;
      remove.setAttribute('aria-label', `Quitar ${segment.label}`);
      remove.disabled = segments.length <= 2;
      remove.addEventListener('click', () => {
        if (store.getSnapshot().segments.length <= 2) return;
        applySegments(segments.filter((_, i) => i !== index));
        remove.focus();
      });

      row.append(swatch, label, weightWrap, remove);
      return row;
    }),
  );
  dom.weightSum.textContent = `Σ ${segments.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}`;
}

function renderHistory(): void {
  dom.history.replaceChildren(
    ...history.map((entry) => {
      const item = el('li');
      item.append(
        el('span', 'history__label', entry.label),
        el('span', 'history__time', formatClock(new Date(entry.at))),
      );
      return item;
    }),
  );
  dom.historyEmpty.hidden = history.length > 0;
}

function renderPresets(): void {
  dom.presets.replaceChildren(
    ...presets.map((preset) => {
      const chip = el('button', 'chip', preset.name);
      chip.type = 'button';
      chip.dataset.presetId = preset.id;
      chip.setAttribute('aria-pressed', String(preset.id === presetId));
      chip.addEventListener('click', () => {
        if (store.getSnapshot().spinning) return;
        presetId = preset.id;
        dom.presetHint.textContent = preset.hint;
        applySegments(presetToSegments(preset));
        renderPresets();
        persist();
        writeSeedToUrl(seedInput);
      });
      return chip;
    }),
  );
}

function renderA11yDescription(): void {
  const { segments } = store.getSnapshot();
  dom.wheelA11y.textContent = `Rueda de decisiones con ${segments.length} opciones: ${segments
    .map((segment) => `${segment.label} (${formatPercent(segmentFraction(segment, segments), 0)})`)
    .join(', ')}.`;
}

function renderFacts(): void {
  const snapshot = store.getSnapshot();
  const kind = controller.rendererKind === 'webgl' ? 'WebGL2' : 'Canvas 2D';
  dom.rendererPill.textContent = kind;
  dom.factRenderer.textContent = kind;
  dom.factCount.textContent = String(snapshot.segments.length);
  dom.factAngle.textContent = `${Math.round(normalizeAngle(snapshot.rotation))}°`;
  dom.factSeed.textContent = seedInput;
}

function renderAll(): void {
  renderLegend();
  renderOptions();
  renderA11yDescription();
  renderFacts();
}

/* ----------------------------------------------------------- Operaciones */
/**
 * Invalida el resultado visible: si la rueda cambia, el ganador anterior
 * deja de ser cierto y mostrarlo sería mentir al usuario.
 */
function resetResult(message = 'La rueda aún no ha hablado.'): void {
  dom.resultCard.dataset.state = 'idle';
  dom.resultValue.textContent = '—';
  dom.resultMeta.textContent = message;
}

function applySegments(
  segments: readonly Segment[],
  options: { keepHighlight?: boolean; keepResult?: boolean } = {},
): void {
  store.setSegments(segments);
  controller.setSegments(segments);
  if (!options.keepHighlight) highlighted = -1;
  if (!options.keepResult) resetResult();
  renderAll();
}

function announceWinner(segment: Segment, index: number, live: boolean): void {
  // Confirmación óptica del resultado; pulseOnce no hace nada si el sistema
  // pide menos movimiento, así que no hay que preguntarlo aquí.
  pulseOnce(dom.resultCard);
  const segments = store.getSnapshot().segments;
  dom.resultValue.textContent = segment.label;
  dom.resultMeta.textContent = `Opción ${index + 1} de ${segments.length} · ${formatPercent(
    segmentFraction(segment, segments),
    1,
  )} de probabilidad · semilla ${seedInput}`;
  if (live) dom.resultCard.dataset.state = 'won';
  renderLegend();
  renderOptions();
}

function spin(): void {
  const snapshot = store.getSnapshot();
  if (snapshot.spinning || snapshot.segments.length < 2) return;

  // Semilla nueva por giro: el resultado es reproducible si se comparte la URL.
  seedInput = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  writeSeedToUrl(seedInput);
  const rng = createRng(seedInput);

  dom.spin.disabled = true;
  dom.spin.classList.add('is-spinning');
  dom.spinLabel.textContent = 'Girando';
  dom.resultCard.dataset.state = 'spinning';
  dom.resultValue.textContent = '…';
  dom.resultMeta.textContent = 'La física está trabajando.';
  dom.factSeed.textContent = seedInput;
  highlighted = -1;

  const plan = controller.spin(rng);
  if (!plan) {
    dom.spin.disabled = false;
    dom.spin.classList.remove('is-spinning');
  }
}

/* --------------------------------------------------------------- Eventos */
dom.spin.addEventListener('click', spin);
dom.adder.addEventListener('submit', (event) => {
  event.preventDefault();
  const label = dom.newLabel.value.trim();
  dom.formError.hidden = true;

  if (label === '') return;
  const segments = store.getSnapshot().segments;
  if (segments.length >= MAX_SEGMENTS) {
    dom.formError.textContent = `Máximo ${MAX_SEGMENTS} opciones para que la rueda siga siendo legible.`;
    dom.formError.hidden = false;
    return;
  }
  if (segments.some((segment) => segment.label.toLowerCase() === label.toLowerCase())) {
    dom.formError.textContent = `«${label}» ya está en la rueda.`;
    dom.formError.hidden = false;
    return;
  }

  const palette = generateRedPalette({ count: segments.length + 1 });
  const color = palette[segments.length % palette.length] as string;
  const next = [...segments, { id: `custom-${Date.now().toString(36)}`, label, weight: 1, color }];
  applySegments(next);
  persist();
  dom.newLabel.value = '';
  dom.newLabel.focus();
});

dom.shuffle.addEventListener('click', () => {
  const segments = store.getSnapshot().segments;
  if (segments.length < 2 || store.getSnapshot().spinning) return;
  const rng = createRng(`${seedInput}-shuffle`);
  const copy = [...segments];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const a = copy[i] as Segment;
    const b = copy[j] as Segment;
    copy[i] = b;
    copy[j] = a;
  }
  applySegments(copy);
  persist();
});

dom.reset.addEventListener('click', () => {
  const preset = getPreset(presetId) ?? presets[0];
  applySegments(presetToSegments(preset));
  dom.presetHint.textContent = getPreset(presetId)?.hint ?? 'Rueda personalizada';
  persist();
});

// Al escribir de nuevo, el error de validación deja de ser relevante.
dom.newLabel.addEventListener('input', () => {
  if (!dom.formError.hidden) dom.formError.hidden = true;
});

dom.clearHistory.addEventListener('click', () => {
  history = [];
  renderHistory();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  if (event.code === 'Space' && !isTyping) {
    event.preventDefault();
    spin();
    return;
  }
  if (isTyping) return;

  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const { segments } = store.getSnapshot();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    highlighted = (highlighted + step + segments.length) % segments.length;
    controller.setHover(highlighted);
    const segment = segments[highlighted];
    if (segment) {
      dom.resultValue.textContent = segment.label;
      dom.resultMeta.textContent = `Navegando · ${formatPercent(
        segmentFraction(segment, segments),
        1,
      )} · pulsa Espacio para girar`;
      dom.resultCard.dataset.state = 'idle';
    }
  }
});

// Hover en el lienzo: resalta el sector bajo el cursor.
dom.canvas.addEventListener('pointermove', (event) => {
  if (store.getSnapshot().spinning) return;
  const rect = dom.canvas.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) > rect.width / 2) {
    controller.setHover(-1);
    return;
  }
  // Convertimos a ángulo de rueda y le restamos la rotación actual implícita.
  const angle = normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
  const layout = controller.layout;
  const local = normalizeAngle(angle - store.getSnapshot().rotation);
  const placed = layout.find((item) => local >= item.start && local < item.end);
  controller.setHover(placed?.index ?? -1);
});

dom.canvas.addEventListener('pointerleave', () => {
  if (!store.getSnapshot().spinning) controller.setHover(-1);
});

const motionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
motionQuery.addEventListener('change', () => {
  globalThis.location.reload();
});

/* ------------------------------------------------------------- FPS meter */
let frames = 0;
let fpsWindowStart = performance.now();
function fpsTick(now: number): void {
  frames += 1;
  if (now - fpsWindowStart >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsWindowStart));
    dom.fpsPill.textContent = `${fps} fps`;
    frames = 0;
    fpsWindowStart = now;
  }
  globalThis.requestAnimationFrame(fpsTick);
}
if (!prefersReducedMotion()) globalThis.requestAnimationFrame(fpsTick);

/* ------------------------------------------------------------- Arranque */
renderPresets();
renderAll();
renderHistory();
dom.presetHint.textContent = getPreset(presetId)?.hint ?? 'Rueda personalizada';
dom.spinLabel.textContent = 'Girar';
writeSeedToUrl(seedInput);
persist();

// Expuesto para la suite E2E y para depurar desde la consola.
Object.defineProperty(globalThis, '__wheel', {
  value: {
    store,
    controller,
    spin,
    getState: () => store.getSnapshot(),
    spinWithSeed(seed: string) {
      seedInput = seed;
      writeSeedToUrl(seed);
      dom.spin.disabled = true;
      const plan = controller.spin(createRng(seed));
      return plan;
    },
    shortestDelta,
    disposeNeoGlass,
  },
  writable: false,
});

renderFacts();
