import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const site = resolve('site/dist');
const read = (file) => readFile(file, 'utf8');
const decode = (value) =>
  value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const attribute = (tag, name) => decode(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
const tags = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const meta = (html, name) =>
  attribute(
    tags(html, 'meta').find(
      (tag) => attribute(tag, 'name') === name || attribute(tag, 'property') === name,
    ) || '',
    'content',
  );
const link = (html, rel) =>
  attribute(tags(html, 'link').find((tag) => attribute(tag, 'rel') === rel) || '', 'href');
async function pages(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, item.name);
    if (item.isDirectory()) result.push(...(await pages(file)));
    else if (item.name.endsWith('.html')) result.push(file);
  }
  return result;
}

const home = link(await read(resolve(site, 'index.html')), 'canonical');
const base = new URL(home);
const expected = new Set();
const titles = new Set();
const descriptions = new Set();
for (const file of await pages(site)) {
  const html = await read(file);
  const path = relative(site, file)
    .replaceAll('\\', '/')
    .replace(/index\.html$/, '');
  const canonical = new URL(path, base).href;
  assert.equal(link(html, 'canonical'), canonical, `Canonical: ${path}`);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `One main heading: ${path}`);
  const title = decode(html.match(/<title>(.*?)<\/title>/s)?.[1] || '');
  const description = meta(html, 'description');
  assert.ok(title.includes('Cardrove') && description, `Search metadata: ${path}`);
  assert.ok(!titles.has(title) && !descriptions.has(description), `Distinct metadata: ${path}`);
  titles.add(title);
  descriptions.add(description);
  assert.ok(!meta(html, 'robots').includes('noindex'), `Public page remains indexable: ${path}`);
  assert.equal(meta(html, 'og:url'), canonical);
  assert.equal(meta(html, 'og:title'), title);
  assert.equal(meta(html, 'twitter:title'), title);
  assert.equal(meta(html, 'twitter:description'), description);
  assert.equal(meta(html, 'og:image'), meta(html, 'twitter:image'));
  const image = new URL(meta(html, 'og:image'));
  assert.equal(image.origin, base.origin);
  assert.ok(image.pathname.startsWith(base.pathname));
  await readFile(resolve(site, image.pathname.slice(base.pathname.length)));
  assert.equal(new URL(link(html, 'sitemap'), base).href, new URL('sitemap-index.xml', base).href);
  const blocks = [
    ...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((match) => JSON.parse(match[1]));
  assert.equal(blocks.length, 1, `Structured data: ${path}`);
  const schema = blocks[0];
  if (!path) {
    assert.equal(schema['@type'], 'SoftwareApplication');
    assert.equal(schema.url, home);
    assert.equal(schema.description, description);
    assert.equal(schema.aggregateRating, undefined);
    assert.equal(schema.review, undefined);
  } else {
    assert.equal(schema['@type'], 'BreadcrumbList');
    assert.equal(schema.itemListElement.at(-1).item, canonical);
    schema.itemListElement.forEach((item, i) => assert.equal(item.position, i + 1));
  }
  expected.add(canonical);
}
const locations = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
const actual = new Set();
for (const url of locations(await read(resolve(site, 'sitemap-index.xml')))) {
  assert.ok(url.startsWith(home));
  for (const page of locations(
    await read(resolve(site, new URL(url).pathname.slice(base.pathname.length))),
  ))
    actual.add(page);
}
assert.deepEqual(actual, expected, 'Sitemap contains every public HTML page exactly once');
const textURLs = (await read(resolve(site, 'sitemap.txt'))).trim().split('\n');
assert.equal(new Set(textURLs).size, textURLs.length, 'Text sitemap URLs are unique');
assert.deepEqual(new Set(textURLs), expected, 'Text sitemap matches the public canonical URLs');
const robots = await read(resolve(site, 'robots.txt'));
assert.ok(robots.includes(`Sitemap: ${new URL('sitemap-index.xml', base).href}`));
assert.ok(!robots.includes('Disallow: /'));
assert.match(await read('dist/index.html'), /name="robots" content="noindex, nofollow"/);
assert.match(await read('dist/_headers'), /X-Robots-Tag: noindex, nofollow/);
assert.equal((await read('dist/robots.txt')).trim(), 'User-agent: *\nAllow: /');
console.log(
  `SEO verified: ${expected.size} public pages, sitemap, JSON-LD, share metadata, and private-app noindex (${home}).`,
);
