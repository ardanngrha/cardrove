---
layout: ../../layouts/Docs.astro
title: Devices & backups
description: Continue on another screen and keep an independent copy of your collection.
---

## Connect another cloud device

Paste the permanent access code saved during setup into the new device. It stays valid until replaced in Settings. Anyone holding this code can access the entire collection, so store it privately in a password manager or your downloaded code file.

You can also open Settings on a connected device and choose **Connect a new device**. Scan the QR code on the new device, or paste its temporary connection code into the app there.

A pairing code works once and expires after five minutes. If it has expired, create a new one. The app remembers the device session in that browser. Clearing browser storage can remove access.

All connected devices share one owner’s decks and progress. There are no separate profiles, classrooms, or public deck permissions.

## Revoke a device

Use Settings on another connected device to revoke its access. The list does not offer revocation of the current device.

Revocation blocks new requests. Files already downloaded cannot be recalled. Existing signed media links can remain valid for up to ten minutes.

## If every device is lost

Use your saved permanent access code. If both the code and every device session are lost, the installation owner can recover through their Supabase dashboard:

```sh
node scripts/create-connect-token.mjs --recover
```

Review and run the generated SQL, then connect using its setup code. This disconnects every existing device, invalidates the old permanent code, and asks you to save a new one. Decks and study progress are preserved. Keep the generated setup files private.

## Save and replace your access code

During first setup, enter your name and workspace name. Copy or download the generated code, then confirm that you saved it. The server stores only a hash and cannot display the same code later. If you reload before confirming, setup can generate a replacement while your device session remains valid.

To rotate a code, open **Your workspace** in Settings, expand **Replace access code**, and type the current workspace name. Save the replacement before leaving. The old code and unused temporary pairing codes stop working; existing connected devices stay connected. Revoke those devices separately if needed.

## Home-screen installation

On iPhone or iPad, open Cardrove in Safari, tap **Share**, then **Add to Home Screen**. Enable **Open as Web App** if offered and tap **Add**. On Android, open Chrome's menu and choose **Install app** or **Add to Home screen**. Settings contains these instructions and an install button when the browser offers one.

The app uses the C icon and opens in standalone mode on supported browsers. HTTPS is required outside localhost. Study still requires a connection, and the service worker does not cache private cards, session responses, or media. An installed app may have separate browser storage; use your saved access code if it asks you to connect again.

## Rename or reset a workspace

Edit your name and workspace name under **Your workspace** in Settings. **Reset study progress** requires typing the current workspace name. It permanently clears schedules, reviews, and streaks across connected devices while keeping cards, notes, media, and preferences. Make a backup before resetting if you may need the old history.

## Full cloud backup

In Settings, choose **Download full backup**. The `.cardrove.zip` file contains notes, decks, templates, settings, progress, review history, and media. It does not contain device sessions or pairing codes.

Keep the archive private because it contains your collection. Backups require a connection and consume download quota. The browser backup limit is 450 MB of media and 64 MB of metadata; a device with little available memory may reach its limit sooner.

### Restore

Set up a separate, empty cloud installation and connect its first device. Choose your backup in Settings and restore it. Restoration into an installation that already has cards is rejected.

The app validates media hashes and activates the restored collection in a transaction. Reconnect your other devices afterwards. Keep the old installation and original backup until you have verified the restored collection.

A **progress archive** is different: it is a JSON export for inspection and record keeping. It is not a complete restorable backup.

## Local backups

Stop the local server, then copy the entire data folder to a safe location. Restore it with the server stopped. Keep your original `.apkg` files too.

For cloud collections beyond the browser backup limits, use database and Storage backups with the provider’s tools. Neither the app nor its public repository is a backup service.
