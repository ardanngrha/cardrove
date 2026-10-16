---
layout: ../../layouts/Docs.astro
title: Devices & backups
description: Continue on another screen and keep an independent copy of your collection.
---

## Connect another cloud device

On a connected device, open Settings and choose **Connect a new device**. Scan the QR code on the new device, or paste its connection code into the app there.

A pairing code works once and expires after five minutes. If it has expired, create a new one. The app remembers the device session in that browser. Clearing browser storage can remove access.

All connected devices share one owner’s decks and progress. There are no separate profiles, classrooms, or public deck permissions.

## Revoke a device

Use Settings on another connected device to revoke its access. The list does not offer revocation of the current device.

Revocation blocks new requests. Files already downloaded cannot be recalled. Existing signed media links can remain valid for up to ten minutes.

## If every device is lost

The installation owner can recover access through the Supabase dashboard. First revoke the lost devices in the SQL Editor:

```sql
UPDATE public.myanki_devices
SET revoked_at = now()
WHERE revoked_at IS NULL;
```

Then generate a fresh setup code with `node scripts/create-connect-token.mjs`, run its SQL, and connect again. This recovery preserves decks and progress. Only do this when you intend to disconnect every existing device.

## Full cloud backup

In Settings, choose **Download full backup**. The `.myanki.zip` file contains notes, decks, templates, settings, progress, review history, and media. It does not contain device sessions or pairing codes.

Keep the archive private because it contains your collection. Backups require a connection and consume download quota. The browser backup limit is 450 MB of media and 64 MB of metadata; a device with little available memory may reach its limit sooner.

### Restore

Set up a separate, empty cloud installation and connect its first device. Choose your backup in Settings and restore it. Restoration into an installation that already has cards is rejected.

The app validates media hashes and activates the restored collection in a transaction. Reconnect your other devices afterwards. Keep the old installation and original backup until you have verified the restored collection.

A **progress archive** is different: it is a JSON export for inspection and record keeping. It is not a complete restorable backup.

## Local backups

Stop the local server, then copy the entire data folder to a safe location. Restore it with the server stopped. Keep your original `.apkg` files too.

For cloud collections beyond the browser backup limits, use database and Storage backups with the provider’s tools. Neither the app nor its public repository is a backup service.
