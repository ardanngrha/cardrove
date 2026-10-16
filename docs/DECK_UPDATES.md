# Automatic deck updates: feasibility

Research checked 16 October 2026. This is a proposal, not an implemented feature.

## Conclusion

Automatic updates are technically feasible when a deck author provides a permitted, versioned source, such as their GitHub Releases or a public APKG feed. Direct unattended access to AnkiWeb is not a supported integration to ship: its current [Access to the Service terms](https://ankiweb.net/account/terms) restrict third-party clients. Request permission or an approved API before building such an adapter. A maintainer's [2021 forum reply](https://forums.ankiweb.net/t/token-id-from-the-name-of-deck-and-vice-versa/8807) also says shared decks had no API; that historical reply alone does not establish today's API inventory.

The current browser flow exposes a modified date and a Download action. That makes browser-based version comparison conceivable, but does not establish permission for a backend poller, a stable public API, or access from Cardrove's origin. Do not automate sessions, bypass challenges, or treat a browser-internal endpoint as a supported integration.

The [Anki manual](https://docs.ankiweb.net/manual/contrib#sharing-decks-publicly) describes downloading an updated shared deck and reimporting it. Cardrove currently supports this manual route. Files do not reliably carry their original shared-page URL; source registration must be explicit rather than guessed from a deck name.

## A viable source

[Kaishi's author](https://github.com/donkuri/kaishi#where-do-i-get-the-deck) publishes through both AnkiWeb and GitHub Releases. For sources like this, [GitHub's documented release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) can identify release IDs and APKG assets. This is an example of a possible integration, not a claim that every AnkiWeb deck has a GitHub mirror. Check the author's distribution permission for each source; Cardrove should not rehost a shared deck publicly.

## Proposed flow for Cardrove

1. The owner explicitly associates an imported deck with an approved source and asset variant.
2. Check metadata at most daily when the app opens. Cache the release ID or validator and use backoff on failure. No new version means no package download.
3. Download a changed asset within explicit byte limits, validate the package, and stage its notes, templates, and media. Reject unsupported structure before activation.
4. Compare source baseline, owner copy, and new source. Apply non-conflicting content changes; require a choice when both sides edited a field or the note type changed. Keep review progress, card identity, local-only cards, and scheduling separate.
5. Activate one version transactionally and record its checksum and import summary. Keep absent source cards unless the owner explicitly chooses removal. A failed import leaves the previous collection usable.

Checking on open can use the existing browser import worker without an always-on renderer. Fully unattended updates while every device is closed require a scheduled backend job and a server-side package processor. The existing Supabase Edge API only stages and commits rows; it does not parse APKG packages. Its current [memory and CPU limits](https://supabase.com/docs/guides/functions/limits) need a separate bounded proof before selecting it for large-package parsing. Free quotas still apply to checks, downloads, media, and retained backups; no paid plan or automatic upgrade is proposed.

## Existing merge verification

A disposable SQLite fixture exercised a newer author note, one additional card, existing scheduling, and a newer owner edit. The newer note and new card were imported, the existing progress row was byte-for-byte unchanged, and an older package retained the newer owner note. Current local and cloud import implementations use note GUID plus card ordinal for identity and note modification timestamps for content updates. They do not yet keep the source baseline needed for conflict-aware automatic updates.
