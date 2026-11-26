#!/usr/bin/env node
/**
 * wheel-cli · Gira la rueda desde la terminal con las mismas funciones puras
 * que usa la interfaz. Sirve para auditar resultados, depurar semillas y
 * reproducir exactamente lo que verá un usuario con una URL concreta.
 *
 * Uso:
 *   node scripts/wheel-cli.mjs --help
 *   node scripts/wheel-cli.mjs --labels "Sí,No,Quizá" --spins 5 --seed demo
 */
import { parseArgs } from 'node:util';
import { createRng } from '../src/core/random.ts';
import { generateRedPalette } from '../src/core/theme.ts';
import { indexAtAngle, layoutSegments } from '../src/core/wheel.ts';
import { planSpin, rotationAt } from '../src/core/spin.ts';

const HELP = `
NeoGlassRojo · Belentani Wheel — CLI

Uso:
  node scripts/wheel-cli.mjs [opciones]

Opciones:
  -l, --labels <csv>    Opciones separadas por comas          (def: Ramen,Sushi,Tacos,Pizza,Poke,Ceviche)
  -w, --weights <csv>   Pesos separados por comas             (def: 1 para todas)
  -n, --spins <n>       Número de giros a simular             (def: 1)
  -s, --seed <texto>    Semilla determinista                  (def: "belentani-wheel")
  -j, --json            Salida JSON en lugar de texto
  -h, --help            Muestra esta ayuda

Ejemplos:
  node scripts/wheel-cli.mjs --spins 5
  node scripts/wheel-cli.mjs -l "Sí,No,Quizá" -w "1,1,0.55" -s demo --json
`;

function parseList(value, fallback) {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function main() {
  const { values } = parseArgs({
    options: {
      labels: { type: 'string', short: 'l' },
      weights: { type: 'string', short: 'w' },
      spins: { type: 'string', short: 'n' },
      seed: { type: 'string', short: 's' },
      json: { type: 'boolean', short: 'j', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const labels = parseList(values.labels, ['Ramen', 'Sushi', 'Tacos', 'Pizza', 'Poke', 'Ceviche']);
  const rawWeights = parseList(values.weights, []);
  const spins = Number.parseInt(values.spins ?? '1', 10);
  const seed = values.seed ?? 'belentani-wheel';

  if (!Number.isInteger(spins) || spins < 1 || spins > 10_000) {
    process.stderr.write('Error: --spins debe ser un entero entre 1 y 10000\n');
    return 2;
  }

  const palette = generateRedPalette({ count: Math.max(labels.length, 2) });
  const segments = labels.map((label, index) => ({
    id: `cli-${index}`,
    label,
    weight: rawWeights[index] ? Number.parseFloat(rawWeights[index]) : 1,
    color: palette[index % palette.length],
  }));

  let layout;
  try {
    layout = layoutSegments(segments);
  } catch (error) {
    process.stderr.write(`Error de validación: ${error.message}\n`);
    return 2;
  }

  const results = [];
  let rotation = 0;

  for (let i = 0; i < spins; i += 1) {
    const rng = createRng(`${seed}#${i}`);
    const plan = planSpin(layout, { rng, fromRotation: rotation });
    // Verificación de integridad: el índice debe coincidir con el ángulo final.
    const verified = indexAtAngle(layout, rotationAt(plan, 1));
    if (verified !== plan.index) {
      process.stderr.write(`Integridad rota en el giro ${i + 1}: ${verified} != ${plan.index}\n`);
      return 3;
    }
    results.push({
      spin: i + 1,
      winner: plan.segment.label,
      index: plan.index,
      probability: Number(
        (plan.segment.weight / segments.reduce((a, s) => a + s.weight, 0)).toFixed(4),
      ),
      turns: plan.turns,
      jitter: Number(plan.jitter.toFixed(3)),
      rotation: Number(plan.toRotation.toFixed(2)),
      verified,
    });
    rotation = plan.toRotation;
  }

  if (values.json) {
    process.stdout.write(`${JSON.stringify({ seed, spins, results }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(
    `\n  NeoGlassRojo · Belentani Wheel — ${spins} giro(s) · semilla "${seed}"\n\n`,
  );
  for (const result of results) {
    process.stdout.write(
      `  ${String(result.spin).padStart(3)}. ${result.winner.padEnd(18)} ` +
        `p=${(result.probability * 100).toFixed(1).padStart(5)}%  ` +
        `vueltas=${result.turns}  jitter=${String(result.jitter).padStart(7)}°  ✓\n`,
    );
  }

  const tally = new Map();
  for (const result of results) tally.set(result.winner, (tally.get(result.winner) ?? 0) + 1);
  process.stdout.write('\n  Distribución observada:\n');
  for (const segment of segments) {
    const count = tally.get(segment.label) ?? 0;
    const share = ((count / spins) * 100).toFixed(1);
    const expected = ((segment.weight / segments.reduce((a, s) => a + s.weight, 0)) * 100).toFixed(
      1,
    );
    process.stdout.write(
      `    ${segment.label.padEnd(18)} ${String(count).padStart(5)}  ${share.padStart(5)}%  (esperado ${expected}%)\n`,
    );
  }
  process.stdout.write('\n');
  return 0;
}

process.exitCode = main();
