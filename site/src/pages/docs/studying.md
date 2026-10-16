---
layout: ../../layouts/Docs.astro
title: Study & organise
description: Learn at your own pace, one return at a time.
---

## Your daily practice

Study shows cards due for review and new cards still available within your daily allowance. Begin a session across all decks, or start from a deck in Library.

The app uses FSRS to calculate intervals. It schedules on the server so connected devices use the same result. Sibling cards from the same note may be buried until the next study day.

## Rate what you remembered

Reveal the answer after attempting to recall it. Then choose:

| Rating | Use it when                                     |
| ------ | ----------------------------------------------- |
| Again  | You did not recall the answer.                  |
| Hard   | You recalled it with considerable effort.       |
| Good   | You recalled it with a normal amount of effort. |
| Easy   | The answer came immediately.                    |

Each rating displays its next interval. Use **Undo** to reverse the last available answer in your current session. An undo can be refused if another device has already changed that card.

### Keyboard shortcuts

Press **Space** or **Enter** to reveal an unanswered card when focus is on the page. Once the answer is visible, **1 = Again**, **2 = Hard**, **3 = Good**, and **4 = Easy**, including when a rating button has focus. Space and Enter keep their native behaviour on a focused button, link, or media control.

Study shortcuts pause while you type in an input, open a dialog, or wait for an operation. Held keys, input-method composition, and keys combined with Ctrl, Command, or Alt are ignored. Use Tab to reach controls and Escape to close a dialog that is not busy.

### Audio

Supported sound references appear as native audio controls below the card. Tap Play to start playback; mobile browsers can require a user gesture. If a temporary cloud media URL expires or fails, use **Refresh audio** to request a new one. Unsupported codecs and browser or device restrictions can still prevent playback. The audio player sits outside the script-disabled card frame while imported card HTML remains sandboxed.

## Search your collection

Browse searches card text and tags. Narrow results by deck, open a card to preview it, or choose Edit to change its note.

A note can generate several cards. Editing its fields updates all those cards. Fields may contain HTML and media references; preserve any markup your template needs.

## Personal preferences

The interface supports English and Indonesian. This does not translate deck content. Decks keep their own text, templates, and media; content direction is detected automatically.

Choose light, dark, or the device’s appearance setting. Motion follows your system’s reduced-motion preference.

Set your study time zone in Settings. It determines the study day and daily allowance. Existing installations keep their saved time zone until you change it.

## Progress

Progress shows activity recorded by this installation. It does not reconstruct review history from the original Anki file. The daily values below the chart provide a text version of its data.

## Across devices

Cloud changes are saved when the API request succeeds. Returning to the browser refreshes the collection. If two devices answer the same card, version checks reject a stale answer instead of replacing newer progress. Review the refreshed card before continuing.

The app requires a connection. It does not queue offline reviews or sync with AnkiWeb.
