import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  server: { host: '0.0.0.0', watch: { ignored: [resolve(process.cwd(), 'work/**')] } },
  build: { target: 'es2022' },
});
