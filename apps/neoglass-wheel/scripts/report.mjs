#!/usr/bin/env node
/**
 * report · Mide el artefacto de producción (peso y presupuesto) y la
 * distribución estadística del motor de giro. Pensado para CI y para
 * comparar ANTES/DESPUÉS de un cambio.
 *
 * Uso:
 *   node scripts/report.mjs            # informe legible
 *   node scripts/report.mjs --json     # salida para máquinas
 *   node scripts/report.mjs --help
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { createRng } from '../src/core/random.ts';
import { planSpin } from '../src/core/spin.ts';
import { layoutSegments } from '../src/core/wheel.ts';

const HELP = `
report — presupuesto de rendimiento y auditoría estadística

Opciones:
  -j, --json     Salida JSON
  -h, --help     Esta ayuda

Presupuestos (falla con código 1 si se exceden):
  · JS inicial  < 60 KB gzip
  · CSS         < 25 KB gzip
  · HTML        < 12 KB gzip
  · Total dist  < 120 KB gzip
`;

const BUDGET = {
  jsGzip: 60 * 1024,
  cssGzip: 25 * 1024,
  htmlGzip: 12 * 1024,
  totalGzip: 120 * 1024,
};

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function collectAssets() {
  const dist = 'dist';
  const files = listFiles(dist).map((path) => {
    const buffer = readFileSync(path);
    return {
      path: path.slice(dist.length + 1),
      bytes: buffer.length,
      gzip: gzipSync(buffer, { level: 9 }).length,
      ext: extname(path),
    };
  });

  const sum = (predicate) => files.filter(predicate).reduce((total, file) => total + file.gzip, 0);

  return {
    files: files.sort((a, b) => b.gzip - a.gzip),
    gzip: {
      js: sum((file) => file.ext === '.js'),
      css: sum((file) => file.ext === '.css'),
      html: sum((file) => file.ext === '.html'),
      other: sum((file) => !['.js', '.css', '.html'].includes(file.ext)),
    },
  };
}

function statisticalAudit(spins = 20_000) {
  const segments = [
    { id: 'a', label: 'A', weight: 1, color: '#e0113f' },
    { id: 'b', label: 'B', weight: 2, color: '#8c0a2c' },
    { id: 'c', label: 'C', weight: 3, color: '#ff3b4d' },
    { id: 'd', label: 'D', weight: 4, color: '#5c061d' },
  ];
  const layout = layoutSegments(segments);
  const total = segments.reduce((acc, segment) => acc + segment.weight, 0);
  const counts = new Array(segments.length).fill(0);

  for (let i = 0; i < spins; i += 1) {
    counts[planSpin(layout, { rng: createRng(`audit-${i}`), fromRotation: 0 }).index] += 1;
  }

  return segments.map((segment, index) => {
    const expected = segment.weight / total;
    const observed = counts[index] / spins;
    // Error estándar de una proporción: sigma = sqrt(p(1-p)/n).
    const sigma = Math.sqrt((expected * (1 - expected)) / spins);
    return {
      label: segment.label,
      expected: Number((expected * 100).toFixed(2)),
      observed: Number((observed * 100).toFixed(2)),
      deviationSigma: Number(Math.abs(observed - expected) / sigma).toFixed(2),
    };
  });
}

function main() {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean', short: 'j', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const assets = collectAssets();
  const stats = statisticalAudit();
  const totalGzip = assets.files.reduce((sum, file) => sum + file.gzip, 0);
  const violations = [
    ['JS', assets.gzip.js, BUDGET.jsGzip],
    ['CSS', assets.gzip.css, BUDGET.cssGzip],
    ['HTML', assets.gzip.html, BUDGET.htmlGzip],
    ['TOTAL', totalGzip, BUDGET.totalGzip],
  ].filter(([, value, limit]) => value > limit);

  const report = {
    built: assets.files.length > 0,
    assets: assets.files,
    gzip: { ...assets.gzip, total: totalGzip },
    budget: BUDGET,
    violations: violations.map(([name, value, limit]) => ({
      name,
      value,
      limit,
      excess: value - limit,
    })),
    statistics: stats,
  };

  if (values.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return violations.length === 0 ? 0 : 1;
  }

  process.stdout.write('\n  NeoGlassRojo · Belentani Wheel — informe\n');
  if (!report.built) {
    process.stdout.write('  ⚠ No hay dist/: ejecuta `npm run build` primero.\n\n');
  } else {
    process.stdout.write('\n  Artefactos (gzip):\n');
    for (const file of assets.files) {
      process.stdout.write(
        `    ${file.path.padEnd(34)} ${String(file.gzip).padStart(7)} B  (${file.bytes} B crudos)\n`,
      );
    }
    process.stdout.write(
      `\n  Presupuesto:  JS ${assets.gzip.js}/${BUDGET.jsGzip}  ·  CSS ${assets.gzip.css}/${BUDGET.cssGzip}` +
        `  ·  HTML ${assets.gzip.html}/${BUDGET.htmlGzip}  ·  Total ${totalGzip}/${BUDGET.totalGzip} B\n`,
    );
  }

  process.stdout.write('\n  Auditoría estadística (20 000 giros, pesos 1:2:3:4):\n');
  for (const row of stats) {
    const status = row.deviationSigma < 3 ? '✓' : '✗';
    process.stdout.write(
      `    ${row.label}  esperado ${String(row.expected).padStart(5)}%  observado ${String(row.observed).padStart(5)}%  ` +
        `${row.deviationSigma}σ ${status}\n`,
    );
  }

  const biased = stats.filter((row) => row.deviationSigma >= 3);
  if (violations.length > 0) {
    process.stdout.write('\n  ✗ Presupuesto excedido:\n');
    for (const violation of report.violations) {
      process.stdout.write(`    ${violation.name}: +${violation.excess} B sobre el límite\n`);
    }
  }
  if (biased.length > 0) {
    process.stdout.write('\n  ✗ Sesgo estadístico detectado (≥3σ) en: ');
    process.stdout.write(`${biased.map((row) => row.label).join(', ')}\n`);
  }
  process.stdout.write(
    violations.length === 0 && biased.length === 0
      ? '\n  ✓ Todo dentro de presupuesto y sin sesgo estadístico.\n\n'
      : '\n',
  );

  return violations.length === 0 && biased.length === 0 ? 0 : 1;
}

process.exitCode = main();
