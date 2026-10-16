# Cardrove feature film

An original, silent, 40-second walkthrough rendered with the official Remotion Node APIs. It uses original sample cards and screenshots of a disposable local installation. No personal decks, progress, device sessions, or access codes belong in these assets.

## Reproduce

From the repository root, use `npm ci`, then `npm run video:render`. The finished MP4, poster and transcript are served from `site/public/media/`. `npm run video:stills` renders representative frames for review without rendering the full film.

The checked-in screenshots in `video/public/captures/` come from the current app. To replace them, run `node video/create-demo.mjs` once to create a new original sample package under the ignored `work/video-demo/` folder. Start a separate local server using `CARDROVE_DATA_DIR` and import that package. Capture only this sample workspace. Never point the filming process at a personal cloud installation.

The film is not rendered during ordinary app or site builds. React and Remotion are authoring dependencies of this workspace; the published website uses a native HTML video element. Rendering is local and does not call a cloud rendering service. Remotion has its own [license terms](https://www.remotion.dev/license); Cardrove's MIT license does not replace them.

## Direction

Paper, ink, and a terracotta accent follow Cardrove's existing design direction. A chapter index, typographic transitions, and close-ups keep the viewer oriented. Movement explains the sequence: bring a deck, recall, reveal, rate, and return on another screen. The persistent “Sample collection” label identifies the demonstration content. There are no testimonials, customer numbers, or performance claims.
