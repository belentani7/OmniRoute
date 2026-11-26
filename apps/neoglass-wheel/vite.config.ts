import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // El preview de Arena llega con un Host *.e2b.app: no lo bloqueamos.
    allowedHosts: true,
  },
  css: {
    // Sin esto, Vite sube por el árbol de directorios y encuentra el
    // `postcss.config.mjs` de OmniRoute (Tailwind), que no está instalado en
    // esta app: el build falla con "Cannot find module '@tailwindcss/postcss'".
    // La rueda no usa PostCSS, así que se declara la cadena vacía y se corta
    // la herencia del monorepo.
    postcss: { plugins: [] },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    reportCompressedSize: true,
    sourcemap: false,
    assetsInlineLimit: 1024,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
