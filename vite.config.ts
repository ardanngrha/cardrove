import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { appCsp } from './server/security.mjs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  return {
    plugins: [
      svelte(),
      {
        name: 'cardrove-security-headers',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: '_headers',
            source: readFileSync('public/_headers', 'utf8').replace(
              '__APP_CSP__',
              appCsp(env.VITE_BACKEND === 'supabase' ? env.VITE_SUPABASE_URL : ''),
            ),
          });
        },
      },
    ],
    server: { host: '0.0.0.0', watch: { ignored: [resolve(process.cwd(), 'work/**')] } },
    build: { target: 'es2022' },
  };
});
