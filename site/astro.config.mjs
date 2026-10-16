import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4322',
  base: process.env.SITE_BASE || '/',
  output: 'static',
  trailingSlash: 'always',
});
