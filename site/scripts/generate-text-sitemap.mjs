import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const locations = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => entities[entity]),
  );
const sitemaps = locations(await readFile(new URL('sitemap-index.xml', output), 'utf8'));
assert.ok(sitemaps.length, 'The XML sitemap index must contain a sitemap');
const base = new URL('.', sitemaps[0]);
const pages = [];
for (const sitemap of sitemaps) {
  const name = sitemap.slice(base.href.length);
  assert.ok(sitemap.startsWith(base.href) && /^sitemap-\d+\.xml$/.test(name));
  pages.push(...locations(await readFile(new URL(name, output), 'utf8')));
}
assert.ok(pages.length && pages.every((url) => url.startsWith(base.href) && !/\s/.test(url)));
assert.equal(new Set(pages).size, pages.length, 'Sitemap URLs must be unique');
await writeFile(new URL('sitemap.txt', output), pages.join('\n') + '\n', 'utf8');
console.log(`Text sitemap generated: ${pages.length} URLs.`);
