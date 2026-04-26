import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'src', 'renderer'),
  base: './',
  publicDir: path.join(__dirname, 'static'),
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, 'dist', 'renderer'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src', 'renderer')
    }
  }
});
