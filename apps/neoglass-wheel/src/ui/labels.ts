import { readableInk } from '../core/theme.js';
import type { PlacedSegment } from '../core/types.js';

export interface LabelOptions {
  /** Radio exterior disponible en píxeles CSS. */
  readonly radius: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly rotation: number;
  readonly winner: number;
  readonly hover: number;
  readonly fontWeight?: number;
}

/** Tamaño de fuente proporcional al radio, con suelo legible. */
export function labelFontSize(radius: number): number {
  return Math.max(11, Math.round(radius * 0.082));
}

/**
 * Ajusta una etiqueta larga: primero reduce el cuerpo y, si aún no cabe,
 * recorta con elipsis. Nunca deja texto desbordando el sector.
 */
export function fitLabel(text: string, maxChars: number): string {
  if (maxChars <= 1) return text.slice(0, 1);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * Pinta las etiquetas de la rueda sobre un contexto 2D.
 *
 * El cuerpo de cristal se puede calcular en GPU, pero el texto siempre se
 * rasteriza en 2D: es la única forma de mantener nitidez subpíxel a cualquier
 * DPR sin generar atlas de textura ni perder selección/copia de texto.
 */
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  layout: readonly PlacedSegment[],
  options: LabelOptions,
): void {
  const { radius, centerX, centerY, rotation, winner, hover } = options;
  const fontWeight = options.fontWeight ?? 600;
  const fontSize = labelFontSize(radius);
  const labelRadius = radius * 0.7;
  const rotationRad = (rotation * Math.PI) / 180;
  // Longitud de arco disponible en el radio de la etiqueta.
  const arcBudget = (2 * Math.PI * labelRadius) / Math.max(layout.length, 1);

  for (const placed of layout) {
    const midRad = (placed.mid * Math.PI) / 180 + rotationRad - Math.PI / 2;
    const x = centerX + Math.cos(midRad) * labelRadius;
    const y = centerY + Math.sin(midRad) * labelRadius;

    // El texto siempre se lee "hacia fuera": se voltea en el hemisferio izquierdo.
    let textAngle = midRad;
    if (Math.cos(textAngle) < 0) textAngle += Math.PI;

    const maxChars = Math.max(4, Math.floor(arcBudget / (fontSize * 0.58)));
    const label = fitLabel(placed.segment.label, maxChars);
    const isWinner = placed.index === winner;
    const isHover = placed.index === hover;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(textAngle);
    ctx.font = `${isWinner ? fontWeight + 200 : fontWeight} ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = readableInk(placed.segment.color);
    ctx.globalAlpha = isWinner || isHover || winner < 0 ? 1 : 0.92;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = isWinner ? 8 : 3;
    ctx.fillText(label, 0, 0, radius * 0.46);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
