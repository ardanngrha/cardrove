import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../tools/sitemap-mirror/worker.mjs';

const site = 'https://ardanngrha.github.io/cardrove/';
const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}</loc></url></urlset>`;

test('sitemap mirror fetches only the fixed public source without forwarding credentials', async () => {
  const response = await handleRequest(
    new Request('https://mirror.example/sitemap.xml?url=https://example.net/', {
      headers: { Authorization: 'Bearer private-test-value', Cookie: 'test=value' },
    }),
    {},
    async (url, options) => {
      assert.equal(url, `${site}sitemap-0.xml`);
      assert.equal(options.headers, undefined);
      assert.equal(options.redirect, 'manual');
      return new Response(xml);
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(await response.text(), xml);
});

test('sitemap mirror fails closed for upstream errors and unexpected content', async () => {
  for (const source of [
    new Response('Unavailable', { status: 503 }),
    new Response(null, { status: 302, headers: { Location: 'https://unexpected.example/' } }),
    new Response('<html>Error</html>'),
    new Response(xml.replace(site, 'https://unexpected.example/')),
  ]) {
    const response = await handleRequest(
      new Request('https://mirror.example/sitemap.xml'),
      {},
      async () => source,
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '300');
  }
});

test('sitemap mirror scopes verification to its noindex home and rejects other routes/methods', async () => {
  const unexpected = () => assert.fail('This route must not fetch upstream');
  const home = await handleRequest(
    new Request('https://mirror.example/'),
    { GOOGLE_SITE_VERIFICATION: 'public-test-verification-value' },
    unexpected,
  );
  assert.match(await home.text(), /google-site-verification/);
  assert.equal(home.headers.get('x-robots-tag'), 'noindex, follow');
  const invalid = await handleRequest(
    new Request('https://mirror.example/'),
    { GOOGLE_SITE_VERIFICATION: '"><script>alert(1)</script>' },
    unexpected,
  );
  assert.doesNotMatch(await invalid.text(), /<script>/);
  assert.equal(
    (await handleRequest(new Request('https://mirror.example/other'), {}, unexpected)).status,
    404,
  );
  assert.equal(
    (
      await handleRequest(
        new Request('https://mirror.example/sitemap.xml', { method: 'POST' }),
        {},
        unexpected,
      )
    ).status,
    405,
  );
});
