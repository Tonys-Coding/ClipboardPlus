import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const companionEnabled = mode !== 'store';
  const outDir = companionEnabled ? 'dist' : 'dist-store';
  return {
  plugins: [
    react(),
    {
      name: 'clipboard-plus-manifest-profile',
      async closeBundle() {
        if (!companionEnabled) return;
        const manifestPath = resolve(import.meta.dirname, outDir, 'manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { permissions: string[]; host_permissions?: string[] };
        if (!manifest.permissions.includes('nativeMessaging')) manifest.permissions.push('nativeMessaging');
        manifest.host_permissions = ['http://*/*', 'https://*/*'];
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    },
  ],
  define: {
    __CLIPBOARD_PLUS_COMPANION__: JSON.stringify(companionEnabled),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        options: resolve(import.meta.dirname, 'options.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  };
});
