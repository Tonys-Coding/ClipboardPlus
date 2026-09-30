import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: mode === 'store' ? 'dist-store' : 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content.ts'),
      name: 'ClipboardPlusContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
}));
