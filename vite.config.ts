import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react() as any],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
