#!/usr/bin/env node
/**
 * check-shaders · Compila los shaders GLSL con el validador oficial de Khronos.
 *
 * Evita el ciclo "rompo el shader → sólo lo descubro en el navegador".
 * Si el binario no está disponible (plataforma no soportada), avisa y sale
 * con código 0: no bloquea el build, pero el chequeo semántico de tests sigue.
 *
 * Uso:
 *   node scripts/check-shaders.mjs [--help]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wheelFragmentShader, wheelVertexShader } from '../src/ui/shaders.ts';

const HELP = `
check-shaders — valida el GLSL con glslangValidator

Opciones:
  -h, --help     Esta ayuda

Comprueba:
  · Sintaxis y semántica de wheelVertexShader y wheelFragmentShader
  · Que el vertex declara gl_VertexID (sin buffers) y el fragment respeta uCount
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const BIN_DIR = 'node_modules/glslang-validator-prebuilt-predownloaded/bin';
const CANDIDATES = ['linux', 'darwin']
  .map((suffix) => join(BIN_DIR, `glslangValidator.${suffix}`))
  .filter((path) => existsSync(path));

if (CANDIDATES.length === 0) {
  process.stdout.write('⚠ glslangValidator no disponible: se omite la validación GLSL.\n');
  process.exit(0);
}

const validator = CANDIDATES[0];
const stage = validator.endsWith('.linux') ? '-S' : '-S';
const dir = mkdtempSync(join(tmpdir(), 'neoglassrojo-glsl-'));
let failures = 0;

try {
  const files = [
    { name: 'wheel.vert', source: wheelVertexShader, stage: 'vert' },
    { name: 'wheel.frag', source: wheelFragmentShader, stage: 'frag' },
  ];

  for (const file of files) {
    const path = join(dir, file.name);
    writeFileSync(path, file.source);
    try {
      execFileSync(validator, [stage, file.stage, path], { stdio: 'pipe' });
      process.stdout.write(`  ✓ ${file.name} compila (GLSL ES 3.00)\n`);
    } catch (error) {
      failures += 1;
      const log = `${error.stdout?.toString() ?? ''}${error.stderr?.toString() ?? ''}`;
      process.stdout.write(`  ✗ ${file.name} NO compila:\n${log}\n`);
    }
  }

  if (!wheelVertexShader.includes('gl_VertexID')) {
    failures += 1;
    process.stdout.write('  ✗ el vertex shader no usa gl_VertexID\n');
  }
  if (!wheelFragmentShader.includes('if (i >= uCount) break;')) {
    failures += 1;
    process.stdout.write('  ✗ el fragment shader no acota el bucle por uCount\n');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.stdout.write(
  failures === 0 ? '\n  ✓ Shaders válidos.\n' : `\n  ✗ ${failures} problema(s) en GLSL.\n`,
);
process.exit(failures === 0 ? 0 : 1);
