#!/usr/bin/env node
/**
 * preview · Genera una imagen estática de la rueda usando EXACTAMENTE la misma
 * geometría que la app (paleta, layout, posición y rotación de etiquetas).
 *
 * Sirve para revisar el diseño en CI o en una PR sin abrir un navegador, y
 * para detectar etiquetas invertidas o desbordadas en cualquier preset.
 *
 * Uso:
 *   node --import tsx scripts/preview.mjs                 # docs/wheel-preview.png
 *   node --import tsx scripts/preview.mjs --preset dev --rotation 20 --out /tmp/x.png
 *   node --import tsx scripts/preview.mjs --help
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getPreset, presetToSegments, presets } from '../src/core/presets.ts';
import { accent, readableInk } from '../src/core/theme.ts';
import { layoutSegments } from '../src/core/wheel.ts';
import { labelFontSize } from '../src/ui/labels.ts';

const HELP = `
preview — imagen estática de la rueda

Opciones:
  -p, --preset <id>       ${presets.map((preset) => preset.id).join(' | ')}   (def: comer)
  -r, --rotation <deg>    Rotación en grados                          (def: -35)
  -s, --size <px>         Lado de la imagen                           (def: 720)
  -o, --out <ruta>        PNG de salida                               (def: docs/wheel-preview.png)
  -h, --help              Esta ayuda
`;

const { values } = parseArgs({
  options: {
    preset: { type: 'string', short: 'p', default: 'comer' },
    rotation: { type: 'string', short: 'r', default: '-35' },
    size: { type: 'string', short: 's', default: '720' },
    out: { type: 'string', short: 'o', default: 'docs/wheel-preview.png' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const preset = getPreset(values.preset ?? 'comer') ?? presets[0];
const segments = presetToSegments(preset);
const layout = layoutSegments(segments);
const size = Number.parseInt(values.size ?? '720', 10);
const rotationDeg = Number.parseFloat(values.rotation ?? '-35');
const center = size / 2;
const radius = size / 2 - size * 0.033;
const hubRadius = radius * 0.27;
const rotationRad = (rotationDeg * Math.PI) / 180;
const toRad = (deg) => (deg * Math.PI) / 180;

const points = (angleRad, r = radius) => [
  (center + Math.cos(angleRad) * r).toFixed(2),
  (center + Math.sin(angleRad) * r).toFixed(2),
];

let body = '';

// --- Sectores -------------------------------------------------------------
for (const placed of layout) {
  const start = toRad(placed.start) + rotationRad - Math.PI / 2;
  const end = toRad(placed.end) + rotationRad - Math.PI / 2;
  const [x0, y0] = points(start);
  const [x1, y1] = points(end);
  const large = placed.size > 180 ? 1 : 0;
  body += `<path d="M${center} ${center} L${x0} ${y0} A${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${large} 1 ${x1} ${y1} Z" fill="${placed.segment.color}" stroke="rgba(255,225,228,0.40)" stroke-width="1.2"/>`;
}

// --- Volumen de cristal (espejo del bisel del shader) ---------------------
body += `<circle cx="${center}" cy="${center}" r="${radius.toFixed(2)}" fill="url(#glass)"/>`;
body += `<circle cx="${center}" cy="${center}" r="${radius.toFixed(2)}" fill="none" stroke="rgba(255,190,195,0.55)" stroke-width="2"/>`;

// --- Etiquetas: MISMA trigonometría que src/ui/labels.ts ------------------
const fontSize = labelFontSize(radius);
const labelRadius = radius * 0.7;
for (const placed of layout) {
  const midRad = toRad(placed.mid) + rotationRad - Math.PI / 2;
  const x = center + Math.cos(midRad) * labelRadius;
  const y = center + Math.sin(midRad) * labelRadius;
  // Se voltea en el hemisferio izquierdo para que nunca quede boca abajo.
  const textRad = Math.cos(midRad) < 0 ? midRad + Math.PI : midRad;
  const textDeg = (textRad * 180) / Math.PI;
  body += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${readableInk(placed.segment.color)}" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="rgba(0,0,0,0.35)" stroke-width="2.5" transform="rotate(${textDeg.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})">${placed.segment.label}</text>`;
}

// --- Buje y puntero -------------------------------------------------------
body += `<circle cx="${center}" cy="${center}" r="${hubRadius.toFixed(2)}" fill="url(#hub)" stroke="rgba(255,200,205,0.5)" stroke-width="2"/>`;
const tipY = size * 0.012;
body += `<path d="M${center} ${tipY.toFixed(1)} L${(center - size * 0.021).toFixed(1)} ${(tipY + size * 0.05).toFixed(1)} A${(size * 0.022).toFixed(1)} ${(size * 0.022).toFixed(1)} 0 1 1 ${(center + size * 0.021).toFixed(1)} ${(tipY + size * 0.05).toFixed(1)} Z" fill="${accent.ember}" stroke="#0b0507" stroke-width="1.5" filter="url(#glow)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
  <radialGradient id="glass" cx="34%" cy="26%" r="80%">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
    <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.03"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.36"/>
  </radialGradient>
  <radialGradient id="hub" cx="38%" cy="30%" r="72%">
    <stop offset="0" stop-color="#ff9aa2"/><stop offset="0.55" stop-color="#8c0a2c"/><stop offset="1" stop-color="#2a0209"/>
  </radialGradient>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect width="${size}" height="${size}" fill="#0b0507"/>
${body}
</svg>`;

const out = values.out ?? 'docs/wheel-preview.png';
if (out.endsWith('.svg')) {
  writeFileSync(out, svg);
  process.stdout.write(`✓ ${out} (SVG)\n`);
} else {
  const { Resvg } = await import('@resvg/resvg-js');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  process.stdout.write(`✓ ${out} (${Math.round(png.length / 1024)} KB)\n`);
}
