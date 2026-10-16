---
layout: ../../layouts/Docs.astro
title: Deck compatibility
description: Bring the decks that fit. Know the boundaries before importing.
---

## Supported

- Anki `.apkg` packages, including supported legacy and newer compressed collection formats.
- Basic and reversed cards.
- Simple cloze deletions.
- Conditional template fields and supported text, hint, furigana, kana, and kanji filters.
- Images, audio, tags, and nested decks.
- Editing imported notes and reimporting newer versions without resetting this app’s progress.

Decks can cover any subject or language. The interface does not assume Japanese content. Complex custom template CSS can still need adjustment for a phone screen or dark appearance.

## Not supported

Card JavaScript, add-ons, Image Occlusion, LaTeX rendering, complex nested cloze, and every specialised Anki template filter are not supported. Type-in-answer cards show a recall prompt rather than a graded typing exercise.

There is no AnkiWeb synchronisation, offline study, multiplayer classroom, public deck marketplace, or automatic content generation. Scheduling starts fresh when a deck is imported. Existing Anki review history is not migrated.

The app is independent of Anki. Deck licences and attribution remain with their original authors. A public software repository does not grant permission to redistribute someone else’s deck.

## Import limits

| Item                          | Application limit |
| ----------------------------- | ----------------- |
| APKG file                     | 512 MB            |
| Extracted collection database | 256 MiB           |
| Cards per file                | 100,000           |
| Unique media objects per file | 10,000            |
| One cloud media object        | 50 MB             |
| Estimated cloud media usage   | 900 MB            |

These are validation ceilings, not a promise that every device can import a file that size. Parsing and decompression need browser memory. Large decks can fail earlier on a phone. Prefer importing a smaller deck on a computer first.

## Interrupted cloud imports

Choose the same source file again to resume. Uploaded media can be reused. New cards become available after the import’s records and media have been verified.

Cancel an unfinished import from Settings if you no longer need it. This removes staging records, but does not automatically remove media objects already uploaded. The installation owner can inspect and remove unused objects through Storage after checking that no active deck or import references them.

## Free service limits

Application limits and hosting quotas are separate. Database size, transfer usage, invocation counts, and project activity policies are controlled by your hosting providers. Check their dashboards and current pricing pages. The app does not upgrade your plan automatically.
