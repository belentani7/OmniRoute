import { generateRedPalette } from './theme.js';
import type { Segment } from './types.js';

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly labels: readonly string[];
  readonly weights?: readonly number[];
}

const PALETTE = generateRedPalette({ count: 24 });

/** Ancho mínimo garantizado del catálogo: `presets[0]` no es opcional. */
export type PresetTuple = readonly [Preset, ...Preset[]];

export const presets = Object.freeze([
  {
    id: 'comer',
    name: '¿Qué comemos?',
    hint: 'Seis antojos, una decisión. Sin empates.',
    labels: ['Ramen', 'Sushi', 'Tacos', 'Pizza', 'Poke', 'Ceviche'],
    weights: [1, 1, 1.4, 1.2, 1, 0.8],
  },
  {
    id: 'dev',
    name: 'Siguiente tarea',
    hint: 'Prioriza el sprint sin discutir.',
    labels: ['Bug crítico', 'Tests E2E', 'Refactor', 'Docs', 'Deuda técnica', 'Revisar PRs'],
    weights: [2, 1.5, 1, 0.8, 0.7, 1],
  },
  {
    id: 'fuera',
    name: 'Plan de domingo',
    hint: 'Ciudad, montaña o sofá.',
    labels: ['Montaña', 'Playa', 'Cine', 'Sofá + serie', 'Museo', 'Bici'],
  },
  {
    id: 'si-no',
    name: 'Sí · No · Quizá',
    hint: 'La duda también tiene peso.',
    labels: ['Sí', 'No', 'Quizá'],
    weights: [1, 1, 0.55],
  },
] as const satisfies PresetTuple);

export function getPreset(id: string): Preset | undefined {
  return presets.find((preset) => preset.id === id);
}

/** Convierte un preset en segmentos con la paleta NeoGlassRojo. */
export function presetToSegments(preset: Preset): Segment[] {
  return preset.labels.map((label, index) => ({
    id: `${preset.id}-${index}`,
    label,
    weight: preset.weights?.[index] ?? 1,
    color: PALETTE[index % PALETTE.length] as string,
  }));
}

export { generateRedPalette };
