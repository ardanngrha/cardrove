const SITE = 'https://ardanngrha.github.io/cardrove/';
const SOURCE = `${SITE}sitemap-0.xml`;

export async function handleRequest(request, env = {}, fetchSource = fetch) {
  const url = new URL(request.url);
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
  const respond = (body, status, type, extra = {}) =>
    new Response(request.method === 'HEAD' ? null : body, {
      status,
      headers: { ...headers, 'Content-Type': type, ...extra },
    });
  if (!['GET', 'HEAD'].includes(request.method))
    return respond('Method not allowed', 405, 'text/plain', { Allow: 'GET, HEAD' });
  if (url.pathname === '/') {
    const token = env.GOOGLE_SITE_VERIFICATION || '';
    const verification = /^[A-Za-z0-9_-]{10,100}$/.test(token)
      ? `<meta name="google-site-verification" content="${token}">`
      : '';
    return respond(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cardrove sitemap</title><meta name="robots" content="noindex, follow">${verification}</head><body><p><a href="${SITE}">Cardrove</a></p></body></html>`,
      200,
      'text/html; charset=utf-8',
      { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, follow' },
    );
  }
  if (url.pathname === '/robots.txt')
    return respond(
      `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', url).href}\n`,
      200,
      'text/plain; charset=utf-8',
    );
  if (url.pathname !== '/sitemap.xml') return respond('Not found', 404, 'text/plain');
  let failure = 'upstream-fetch-failed';
  try {
    const upstream = await fetchSource(SOURCE, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      cf: { cacheEverything: true, cacheTtl: 300 },
    });
    if (!upstream.ok) {
      failure = `upstream-http-${upstream.status}`;
      throw new Error('Upstream unavailable');
    }
    const body = await upstream.text();
    failure = 'unexpected-sitemap-content';
    const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)];
    if (
      body.length > 1_000_000 ||
      !body.includes('<urlset') ||
      !locations.length ||
      locations.some((match) => !match[1].startsWith(SITE))
    )
      throw new Error('Unexpected sitemap');
    return respond(body, 200, 'application/xml; charset=utf-8', {
      'Cache-Control': 'public, max-age=300',
    });
  } catch {
    return respond('Sitemap temporarily unavailable', 503, 'text/plain; charset=utf-8', {
      'Retry-After': '300',
      'Cache-Control': 'no-store',
      'X-Cardrove-Crawl-Status': failure,
    });
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
