# Design direction

## Owner brief

The owner selected: “Editorial modern, tenang tapi berkarakter”. The app and public site should feel modern, clean, and carefully animated. The product is for learning any subject or language on phones and computers. The owner approved the name Cardrove.

## Implementation decisions

- App: ENERGY 2 / RHYTHM 2 / MOTION 2. One study action dominates; navigation and progress stay quiet.
- Public site: ENERGY 2 / RHYTHM 3 / MOTION 2. Alternate an open typographic introduction, interactive card demonstration, and practical self-hosting documentation.
- Reading this as: a personal study workspace for independent learners, in a calm modern editorial style. The public site introduces that workspace to people who want to run their own copy.
- Warm paper and ink keep long reading sessions comfortable. A burnt orange accent identifies the next meaningful action. Semantic feedback colors are reserved for errors and review ratings.
- Georgia supplies a literary voice for short headings without a font download. System sans-serif keeps controls familiar and supports the device's language fonts.
- The repeated identity motif is an index rule and numbered margin, connecting the library, study card, and documentation. No invented logo is needed; use a text wordmark.
- Decks use rows, not promotional tiles: long imported titles and nested paths need room. Cards are reserved for actual flashcards.
- Motion explains a change of state: a new card arrives, an answer is revealed, a navigation panel opens. No looping decoration. Respect reduced motion.
- Utility icons explain an action or destination: search, import, review history, settings, theme, and navigation. They never stand in for content or decorate every section.
- Light and dark themes use semantic tokens. Interface language is independent of deck content; content uses automatic text direction and no assumed Japanese language.
- Phone navigation becomes a bottom bar. Review ratings stay reachable near the thumb; tablet layouts preserve a compact rail and readable content width.
- On the phone home screen, due and new counts precede the editorial session heading so a learner sees the workload before scrolling.

## Feature film and homepage

Reading this as: a product introduction for independent learners and self-hosters, in Cardrove's existing calm editorial language, dial ENERGY 2 / RHYTHM 3 / MOTION 2.

The hero pairs the headline and setup action with a real product film. The 40-second, silent English film uses original sample content, chapter numbers, paper, ink, and the existing C monogram. A short typographic opening leads into import, recall and reveal, ratings, connected screens, and workspace settings. Screenshots show the working app, while a persistent sample label identifies the demo collection. Movement follows those actions rather than looping as decoration.

The website serves a small WebP poster and a native MP4 player with `preload="none"`. Playback is requested by the visitor; a transcript and caption track provide another way to follow the film. Native video controls avoid shipping React or Remotion to website visitors. The left-hand headline sets the hierarchy, and the film supplies evidence for the product's behaviour. The portfolio reuses the poster as a project cover within its existing layout.

## Publication boundaries

The public repository contains software, setup documentation, and original labeled sample content. Personal decks, media, sessions, environment files, and production bootstrap material are excluded. Existing storage identifiers and API routes remain compatible to preserve the deployed collection.
