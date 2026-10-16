# Release verification

Verified on 16 October 2026. This is a bounded implementation review, not an accessibility certification, security audit, or guarantee for every imported Anki template.

## Build and behaviour evidence

- A fresh npm installation completed with no reported audit vulnerabilities at the time of installation.
- Svelte/TypeScript: zero errors and zero warnings.
- Four automated tests cover legacy and modern imports, archive validation, authentication, FSRS review/undo, reimport/edit, session persistence, and time zones.
- Local, configured cloud, and eight-page Astro builds completed.
- The published cloud assets were compared by SHA-256 with the deployment manifest. All ten assets returned HTTP 200, including the import worker and SQLite WASM. Security headers were checked on the HTML response.
- Existing cloud collection counts were read without changing notes or review history. The existing browser session opened the redesigned app and its device/storage settings.

### Recorded browser interactions

Browser checks used a disposable local collection and original sample notes. Production checks were limited to opening the workspace and reading settings. Device mutations used a local mock panel, not the owner's devices.

| Control or flow | Observed result |
| --- | --- |
| Local sign-in | Existing disposable account opened its collection |
| Study, Library, Browse, Progress, Settings navigation | Corresponding page and heading opened |
| Begin review, reveal, Good, next, undo | Answer appeared; next card loaded; undo restored the prior review state |
| Card preview, show answer, Escape | Reversed card showed `belajar`, then `学ぶ`; Escape closed the dialog |
| Browse search | Non-matching query produced the explicit empty state |
| Deck filter | Cell biology reduced seven sample cards to one |
| Edit note and save | Original Arabic sample's saved answer appeared in Browse |
| Import picker, import, open library | Four original sample cards imported; completion counts and updated library appeared |
| Daily allowance, goal, save | Saved values survived refresh and the home goal changed to 15 |
| Language selectors | English/Indonesian labels and document language changed |
| Theme controls | Light, dark, and device-following appearances were inspected |
| Daily activity disclosure | Accessible daily values expanded below the chart |
| Mock connect, expiry, fresh code, copy | QR and countdown appeared; expired state replaced the code; fresh code appeared; copy changed to Copied |
| Mock revoke, keep connected, disconnect | Confirmation opened; cancel kept the device; confirm removed only the sample phone |
| Mock cancel import | The sample unfinished import disappeared |
| Mock progress archive | Browser downloaded the sample JSON archive |
| Full-backup button in unconfigured mock | Lazy backup loaded and displayed a configuration error; controls became available again |
| Restore file picker and submit | Accepted the disposable invalid backup selection and entered the busy state; successful cloud restore was not repeated against the live collection |
| Landing demo reveal and next | Spanish answer appeared; next switched to the biology sample |
| Website theme | Theme switched through the keyboard-operated control |
| Handbook and chapter link | Handbook and compatibility chapter opened |
| Phone chapter menu | Expanded to show all seven real chapter links |

The cloud backup/restore engine and owner recovery procedure remain subject to the documented compatibility and size limits. A successful full restore into a separate empty Supabase project was not part of this UI release check. Disabled pagination was checked for the seven-card fixture; a large-collection pagination browser run was not repeated. These are explicit limits on verification, not claims of broken functionality.

## Responsive and accessibility review

Phone layouts were inspected at 320 and 390 CSS pixels, tablet layouts at the responsive rail breakpoint, and desktop at 1280 pixels. Browser layout metrics showed the content width matching the viewport on the checked phone screens. Long deck titles, mixed scripts, Arabic text, dialogs, and navigation were included. The screenshots in `docs/assets/` contain disposable sample content.

Primary study actions remain in the phone viewport; review ratings sit above bottom navigation. Controls have accessible names, modal focus handling, visible focus styling, and native form labels. Reduced-motion styles disable nonessential animation. Imported card documents are sandboxed and retain a separate compatibility boundary: custom author CSS can still need adjustment.

Measured contrast pairs: muted text on light ground 5.28:1, muted on soft ground 4.65:1, accent on paper 5.92:1, dark muted on ground 7.71:1, dark muted on soft ground 6.07:1, and dark primary-button text 7.51:1. Interactive input borders measure 3.60:1 in light appearance and 4.25:1 in dark appearance against their adjacent paper surfaces.

## Anti-slop delivery gate

Applied [anti-slop](https://github.com/miqdadbadjuber/anti-slop) in During mode. The design rationale is in [DESIGN.md](../DESIGN.md). PASS below refers to the checked source and the recorded scope above; it does not assert universal device, deck, or assistive-technology coverage.

### Hard gate

- R-02 PASS: source/copy scan found no em dashes in the newly authored app, site, and public documentation.
- R-03 PASS: checked phone content width matched the viewport; long sample content wrapped within cards and editor.
- R-17 PASS: no adoption, uptime, customer, or speed statistics are presented; collection counts come from the API.
- R-18 PASS: no testimonials or fictional customer identities are included.
- R-23 PASS: the owner approved Cardrove and the editorial direction; screenshots and interactive examples are explicitly sample content; branding is a text wordmark.
- R-24 PASS: navigation targets the implemented app views, seven handbook chapters, or the actual repository.
- R-25 PASS: the measured semantic text pairs meet normal-text AA; input borders meet non-text contrast of 3:1.
- R-26 PASS: controls have real handlers, links, native disclosures, or explicit disabled conditions; interaction outcomes are recorded above.
- R-27 PASS: startup/loading, empty search, import progress, API errors, expired codes, and successful save/import states are implemented and inspected.
- R-28 PASS: no generic FAQ was added.
- R-32 PASS: navigation, preview, theme, and menu controls were operated using Enter; Escape closed the preview; visible focus and modal focus handling exist in source.
- R-33 PASS: UI and CSS changes were written directly in source; external scripts were used only for fixtures, verification, and deployment.
- R-34 PASS: both semantic themes were rendered; author-supplied deck CSS remains a documented compatibility limitation.
- R-35 PASS: app/site builds ran and interactive control paths are recorded above, with production mutations isolated from disposable QA actions and verification limits stated explicitly.
- R-36 PASS: no unmeasured memory, security-certification, uptime, or universal-performance claims appear in product copy.
- R-37 PASS: the owner selected the editorial direction and During mode before implementation; dials are recorded in DESIGN.md.
- R-38 PASS: product capabilities are backed by source; demo notes are labelled original samples and progress is not fabricated.

### Purpose gate

- R-01 PASS: no decorative gradients or glows are used.
- R-04 PASS: functional book, layers, search, chart, settings, upload, undo, and theme icons identify their associated actions; reasons are recorded in DESIGN.md.
- R-06 PASS: Georgia headings express the approved editorial character; system sans supports controls and body readability.
- R-07 PASS: no decorative grid or dot-pattern background is used.
- R-08 PASS: arrows identify primary next actions, pagination, or external navigation; they are absent from most secondary actions.
- R-09 PASS: no promotional capsule above the headline or unverifiable status badge is used.
- R-10 PASS: surfaces are opaque semantic paper/ground, without layered glass effects.
- R-12 PASS: shadow is limited to the sample card and dialogs where separation has a purpose.
- R-13 PASS: no glow effect is used.
- R-14 PASS: collection rows share comparison structure; landing sections use different compositions according to their content.
- R-19 PASS: small transitions indicate state and section arrival; they stop under reduced motion and no continuous floating animation is used.
- R-22 PASS: the working flashcard sample supplies the illustration; no unrelated stock illustration is used.

### Liveliness

- Dials PASS: app ENERGY 2 / RHYTHM 2 / MOTION 2; site ENERGY 2 / RHYTHM 3 / MOTION 2.
- Consistency PASS: the app remains task-focused; the site alternates an opening spread, interactive practice, ownership ledger, and handbook links.
- Focal point PASS: review action/card leads the app; the headline and working sample lead the site.
- Whitespace PASS: ruled sections and spacing separate workload, review controls, and reference reading.
- Accent PASS: terracotta identifies active navigation, primary actions, and selected editorial emphasis.
- Identity PASS: serif/italic headings, paper surfaces, fine rules, and indexed chapters recur across app and handbook.
- Design Read PASS: editorial direction and its implementation rationale were declared before generation and recorded in DESIGN.md.

### Craftsmanship and quality locks

- C-1 PASS: typography, palette, layout, icons, and motion each have a written product purpose.
- C-2 PASS: working controls and disabled/error feedback are recorded in the interaction table.
- C-3 PASS: sections explain study, self-hosting, ownership, compatibility, or recovery; no customer-logo, pricing, or filler FAQ section was added.
- C-4 PASS: checked responsive, theme, keyboard, empty, and error states hold up within the stated verification scope.
- C-5 PASS: examples and limitations are explicit; no fictional endorsement or performance claim is presented.
- R-05 PASS: the landing composition varies with the material rather than repeating uniform feature tiles.
- R-11 PASS: controls use modest corners; the circular theme control denotes a compact icon action; components are not uniformly pill-shaped.
- R-15 PASS: primary calls to action name their destination or action, including Begin review, Build your study space, and Open the handbook.
- R-16 PASS: copy describes concrete study and ownership behaviour without AI marketing buzzwords.
- R-20 PASS: the bookish editorial motif and actual recall demonstration connect identity to this product's purpose.
- R-21 PASS: appearance follows the device by default, with working light/dark choices.
- R-29 PASS: semantic paper, ground, ink, muted ink, and one accent form a coherent system; state colours have functional roles.
- R-30 PASS: no popular-product layout or visual source was cloned.
- R-31 PASS: major visual reasons are recorded in DESIGN.md.

## Performance evidence

Configured cloud builds are compared with the original configured cloud app. The initial main JavaScript changed from approximately 553 KB (191 KB gzip) to 368 KB (113 KB gzip). QR, full-backup ZIP, and device controls load separately. Import parsing continues in a worker. These are build-byte measurements, not a device-memory benchmark, latency guarantee, or proof of lower peak import memory. SQLite WASM and large media still carry real costs.
