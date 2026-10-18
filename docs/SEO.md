# Search visibility

The public landing page and handbook are indexable static HTML. Personal app installations use `noindex, nofollow` in HTML and Cloudflare response headers. Crawling the app shell remains allowed so a crawler can read the noindex rule. Access codes and server authorization remain responsible for protecting collections; robots rules are not access control.

## What builds automatically

- Descriptive, distinct page titles and descriptions, separate from the editorial headings.
- Self-referencing canonical URLs and social previews based on `SITE_URL` and `SITE_BASE`.
- A sitemap index and URL sitemap from the official Astro integration. New static pages enter the sitemap on build; no invented last-modified timestamps are emitted.
- A UTF-8 text sitemap generated from those same XML URLs after each site build. `sitemap.txt` is an alternative supported by Google for discovering HTML pages; it does not contain manually maintained URLs.
- `SoftwareApplication` JSON-LD on the landing page and `BreadcrumbList` on handbook pages. The product has no claimed ratings or reviews. The schema describes the software; it does not promise Google's software-app rich results, which have additional requirements.
- A sitemap discovery link in every public page's head and a generated robots file.

`npm run verify:seo` checks the built pages, canonical URLs, distinct metadata, preview images, parsed JSON-LD, exact sitemap coverage, and app noindex rules. Build the app and site first. CI runs this check before publishing the handbook.

## Hosting paths

The current public sitemap is [sitemap-index.xml](https://ardanngrha.github.io/cardrove/sitemap-index.xml). The site's generated URLs follow its configured hostname and base path, including root-hosted deployments.

[sitemap.txt](https://ardanngrha.github.io/cardrove/sitemap.txt) provides the same canonical URLs, one per line. It can be submitted separately to isolate XML parsing and index-file issues when diagnosing a Search Console fetch failure. A successful live URL test proves access at the time of that test; it does not prove the sitemap-processing service has fetched or parsed the file. Do not mark a fetch issue resolved until the Sitemaps report says **Success**. Do not keep resubmitting an unchanged sitemap or add a trailing slash unless that exact URL actually serves a sitemap.

A robots file only governs crawlers when served at a hostname's root. On this GitHub project site, `/cardrove/robots.txt` is not the effective robots policy for `ardanngrha.github.io`. The page-head sitemap link and a direct Search Console sitemap submission provide discovery without changing an unrelated root repository. A root-hosted copy serves the generated robots file at `/robots.txt`.

## Optional sitemap mirror

`tools/sitemap-mirror/` contains a small Cloudflare Worker for testing sitemap access from another host. It fetches the public XML sitemap, caches it for five minutes, and preserves the original canonical URLs. It is optional and is not part of an app installation. It does not use the app's database, credentials, or access codes. The source is fixed in `worker.mjs`; request parameters cannot choose an upstream URL. Update `SITE` explicitly if adapting it to a fork.

Deploy it only when diagnosing a sitemap-host issue:

```sh
npx --yes wrangler@4.151.1 deploy --config tools/sitemap-mirror/wrangler.json
```

Use an existing Workers Free account and its `workers.dev` subdomain. No paid plan or storage binding is needed; requests still count toward the shared free Workers daily limit. Verify ownership of both the original public site and the mirror in Search Console, following [Google's cross-site sitemap instructions](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#cross-submit-sitemaps).

The mirror homepage accepts the public `GOOGLE_SITE_VERIFICATION` environment variable for HTML-tag verification. Set it as a plain-text Worker variable, retain it after verification, and submit `/sitemap.xml` in the mirror property's Sitemaps report. The config preserves dashboard variables on subsequent Wrangler deploys. The homepage uses noindex; the XML endpoint remains crawlable and indexable. A mirror that returns HTTP 200 is not proof that Google has processed the sitemap. Consider it successful only when the report confirms processing; changing hosts is not a guaranteed fix for **Couldn't fetch**.

## Google Search Console

[Search Console is free](https://support.google.com/webmasters/answer/9128668?hl=en). It is not required for inclusion in Google Search, but it provides ownership verification, sitemap submission, URL inspection, and search performance reports.

For this GitHub Pages site:

1. Sign into your own Google account in [Search Console](https://search.google.com/search-console/).
2. Add a **URL-prefix** property for `https://ardanngrha.github.io/cardrove/`. A Domain property for `github.io` is not appropriate because you do not own that domain's DNS.
3. Choose the HTML tag verification method. Copy only its public `content` value into the GitHub repository's Actions variable `GOOGLE_SITE_VERIFICATION`. The publish workflow passes it to `SITE_GOOGLE_VERIFICATION`; local/manual builds can set that environment variable directly. This token is intentionally published in the HTML head. Do not use an account password or an API credential.
4. Publish the site, return to Search Console, and verify ownership. Keep the verification tag deployed afterward.
5. Submit `https://ardanngrha.github.io/cardrove/sitemap-index.xml` in Sitemaps. Use URL Inspection on the landing page to check Google's view and request indexing where offered.
6. Monitor the indexing and performance reports after Google has crawled the pages. A successful deployment or HTTP 200 is not proof of indexing or ranking.

No Search Console account was verified or sitemap submitted as part of the source change alone. Completing those steps requires the owner's signed-in account and Google's confirmation.

References: [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/), [Google title guidance](https://developers.google.com/search/docs/appearance/title-link), [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [software-app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app).
