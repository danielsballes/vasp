import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  /* Relative paths: the dist folder can be served from any subfolder. */
  base: './',
  plugins: [vue()],
  build: { chunkSizeWarningLimit: 900 },
  /* The mesh tests walk every triangle of full-size exports; allow slow machines some headroom. */
  test: { environment: 'node', include: ['tests/**/*.test.js'], testTimeout: 20000 },
});
