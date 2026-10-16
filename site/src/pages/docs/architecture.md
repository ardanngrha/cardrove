---
layout: ../../layouts/Docs.astro
title: Under the hood
description: A static app, a private collection, and one owner’s connected devices.
---

## Two ways to run

The Svelte 5 and TypeScript interface is built with Vite. It uses either a local Node.js server with SQLite, or a Supabase cloud API. The public landing page and handbook use Astro to generate static HTML on GitHub Pages.

| Layer     | Cloud                                      | Local                                           |
| --------- | ------------------------------------------ | ----------------------------------------------- |
| Interface | Static assets on Cloudflare Pages          | Vite in development, built assets in production |
| API       | Supabase Edge Function                     | Express on Node.js 24                           |
| Data      | PostgreSQL                                 | Node’s built-in SQLite                          |
| Media     | Private Supabase Storage                   | Local data directory                            |
| Session   | Supabase Auth plus approved-device records | Server session cookie                           |

There is no author-operated central server. Each person who clones the repository supplies their own hosting and data store.

## A cloud request

The browser loads the static app from Pages. For a private operation it sends its session token to the Edge API. The handler verifies the session and approved device before accessing data. Database policies and private Storage enforce access too.

The publishable key identifies the Supabase project; it does not grant access to the collection. The cloud API uses privileged server keys inside the Edge environment. Owner-run migration tooling may also obtain a project key through an authenticated CLI, keeps it in memory only, and never includes it in browser assets or source control.

Media is retrieved using signed links that expire after ten minutes. Revoking a device stops new API access but does not invalidate every previously issued link immediately.

## Deck import

A Web Worker opens the APKG ZIP. SQLite/WASM reads the collection, and decompression supports the formats the importer recognises. The browser checks records, hashes media, and uploads in batches.

An import job tracks progress. A final transaction verifies and activates the collection. Existing card progress is retained when compatible notes are updated by a reimport.

## Review consistency

FSRS calculates the next schedule in the backend. A card version prevents a stale answer from overwriting a newer one. A unique operation ID lets a retry return its existing result rather than applying the same answer twice.

Undo validates the current review state. Multi-device use can cause a conflict that requires reloading the card. This is online consistency, not an offline merge system.

## Card rendering

Deck HTML is sanitised with DOMPurify and shown in a sandboxed iframe without scripts. External resource loading is restricted. Supported media references point to local or signed private assets. Native audio controls live in the trusted application document, outside that frame, so media controls do not require enabling deck scripts.

The app preserves supported template content. It cannot guarantee visual fidelity for every custom Anki template. Test your decks before relying on a migrated installation.

## Private media storage

The cloud workspace chooses its private Storage bucket through the server's workspace setting. New installations use `cardrove-media`. The upgrade tooling copies old objects through the Storage API and verifies their names, sizes and media types before a guarded database migration changes the app's references and policies. The API, import checks, and quota accounting follow the same bucket setting.

## Ownership and device access

The first-owner setup link is generated locally and registered by running its hash-only SQL in the owner's Supabase project. It works once for 30 minutes and cannot claim an installation that already has an active device. After entering profile names, the owner saves a reusable random access code; the database retains its hash. Rotating that code invalidates the old code and unused temporary pairing codes, while already connected devices remain connected until revoked.

## Home Screen and connectivity

The Home Screen manifest provides the C icon and standalone presentation. The service worker uses the network for navigation and shows a connection-needed page when that fails. It does not cache private cards, media, sessions, or API responses and does not queue offline reviews.

## Keeping the interface lean

Backup ZIP generation, QR generation, device settings, and import controls are loaded when needed. The database parser runs in a separate worker. The public website does not load the study app or its database client.

These choices reduce work on the initial route. Actual memory use depends on deck size, template content, media, browser, and device. No framework choice removes those costs.
