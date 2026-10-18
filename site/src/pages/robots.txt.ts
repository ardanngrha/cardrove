import type { APIRoute } from 'astro';
import { link } from '../config';

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL(link('sitemap-index.xml'), site);
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapURL.href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
