---
layout: ../../layouts/Docs.astro
title: Devices & backups
description: Continue on another screen and keep an independent copy of your collection.
seoTitle: "Connect Devices & Back Up Flashcard Progress"
seoDescription: "Connect phones and computers to your Cardrove workspace, save or rotate your access code, and export or restore decks, media, and study progress."
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
npm run setup:cloud -- --app-url https://YOUR_APP.pages.dev --recover
```

Replace the example URL with your installed app address. Review and run `work/setup/setup.sql` in the project's SQL Editor, then open the private link in `work/setup/setup-link.txt`. This disconnects every existing device, invalidates the old permanent code, and asks you to save a new one. Decks and study progress are preserved. Keep the generated setup files private; never run this command just to connect an additional device.

## Save and replace your access code

During first setup, enter your name and workspace name. Copy or download the generated code, then confirm that you saved it. The server stores only a hash and cannot display the same code later. If you reload before confirming, setup can generate a replacement while your device session remains valid.

To rotate a code, open **Your workspace** in Settings, expand **Replace access code**, and type the current workspace name. Save the replacement before leaving. The old code and unused temporary pairing codes stop working; existing connected devices stay connected. Revoke those devices separately if needed.

## Home-screen installation

On iPhone or iPad, open Cardrove in Safari, tap **Share**, then **Add to Home Screen**. Enable **Open as Web App** if offered and tap **Add**. On Android, open Chrome's menu and choose **Install app** or **Add to Home screen**. Settings contains these instructions and an install button when the browser offers one.

The app uses the C icon and opens in standalone mode on supported browsers. HTTPS is required outside localhost. Study still requires a connection, and the service worker does not cache private cards, session responses, or media. An installed app may have separate browser storage; use your saved access code if it asks you to connect again.

### If the iPhone icon looks wrong

Install from your own app address, rather than the public handbook. The app and website both declare a PNG version of the C icon for iOS, and the app also provides Safari's standard root icon file. iOS may retain an icon that was saved before an update. First make sure you have your saved access code, remove the old Home Screen shortcut, reopen the current app URL in Safari, reload it, then add it again. Choose to remove only the shortcut if iOS offers that distinction; installation and browser storage behaviour vary. A separate installed session may need your saved access code.

If the image is still different, check whether iOS is applying a tinted or other customised Home Screen appearance. The website supplies the icon artwork; the operating system controls its final presentation. Updating these files does not guarantee that an existing installed icon refreshes immediately.

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
