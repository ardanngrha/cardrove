# Security and deployment boundaries

Cardrove is a single-owner installation. Every approved device can access the entire collection, edit notes, rotate the access code, and reset progress. It is not a multi-user service or an independently audited security product.

## Access codes and sessions

The first device must prove ownership using the setup code supplied by the local server or provisioned through the installation owner's Supabase dashboard. A public website visitor cannot complete setup using only the installation URL.

During onboarding, the owner enters a personal name and a workspace name. The server generates a 256-bit random permanent access code. The server stores a hash; plaintext appears in the setup or rotation screen and optional private download only. Save it in a password manager or another safe place. It grants full collection access, remains reusable, and has no expiry until replaced. The app does not store a plaintext copy in browser storage.

Rotating the permanent code invalidates the previous code and unused temporary pairing codes. Existing devices remain connected and must be revoked separately. Five-minute, single-use device codes are still available for QR pairing.

An installed web app can have a separate browser storage context. Use the saved permanent code if it needs its own connection. Avoid shared browsers and devices you do not control. This is not end-to-end encryption; the hosting provider and project administrator control the backend.

## Browser and content isolation

Production app responses use a Content Security Policy that restricts scripts to the app origin, permits WebAssembly compilation, and restricts API/media connections to the configured backend. Inline styles are needed for Svelte state styling and imported card layout; inline application scripts and arbitrary JavaScript evaluation are not enabled. Object embeds and framing of the app are denied.

Imported card HTML is sanitised, runs in a sandboxed frame without script permission, and has its own restrictive policy. Native audio players are created in the trusted app document so Safari does not need script permission inside imported card frames. Audio playback requires a user action. Custom card CSS and unsupported codecs remain compatibility boundaries.

The service worker uses the network for app navigation and provides only a static connection-needed fallback. It does not use Cache Storage and does not cache cards, credentials, API responses, signed media, or application bundles. Ordinary browser media caching can still occur independently of the service worker.

## Backend controls

Cloud requests validate the Auth user and the approved device record. Database RLS and a private Storage bucket apply separately. Credential hashes and import staging tables have no browser read grants. Privileged mutation functions are executable only by the server role. The browser uses a public publishable key; the administrative key stays in the Edge runtime.

The cloud API stops reading JSON bodies after its byte limit, including streamed requests. These application limits do not constitute comprehensive distributed denial-of-service protection. Provider quotas still apply. Media links are short lived and can remain valid for up to ten minutes after revocation; downloaded files cannot be recalled.

Reset requires the current workspace name, clears review history and schedules, and advances card versions so stale review submissions are rejected. It keeps decks, notes, and media. Reset is destructive to study history; make an independent backup before using it.

For local installations, use HTTPS for internet access and home-screen installation outside localhost. Only enable `TRUST_PROXY=1` behind a reverse proxy you control. Stop the old server before moving or upgrading SQLite files. Older local database names and backup formats are read through explicit compatibility helpers.

## Supabase advisor review

The checked deployment has intentional informational findings for RLS-enabled credential/staging tables without policies. These tables are server-only, with browser grants revoked. Adding permissive policies would weaken that boundary. See [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Two warning categories remain documented:

- The signed-in device approval helper is a `SECURITY DEFINER` function. It intentionally returns whether `auth.uid()` has an active device row so RLS can evaluate that predicate without recursive device-table policies. It accepts no caller-selected owner ID or SQL. Mutation functions remain server-only. See [definer function review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Supabase leaked-password checking is not enabled. Cloud device passwords are generated randomly by the backend rather than chosen by humans, and the saved access code is separately generated and hashed. This is not a claim that the advisor setting is enabled. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A source review, passing tests, and advisor output do not replace a penetration test, operational monitoring, or recovery rehearsal. Security reports should omit live access codes, tokens, personal deck content, and media URLs.
