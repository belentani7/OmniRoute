import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/core/**/*.ts', 'src/ui/**/*.ts'],
      // Se excluye lo que exige una GPU o un DOM real: se cubre con la suite
      // E2E en navegador. Medir aquí sólo produciría un número artificial.
      exclude: [
        'src/core/types.ts',
        'src/ui/shaders.ts',
        'src/ui/renderer.ts',
        'src/ui/dom.ts',
        'src/main.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
