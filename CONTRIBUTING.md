# Contributing to Cardrove

Use Node.js 24+ and npm. Run `npm ci`, then `npm run dev` for the local app or `npm run dev:site` for the public site. Keep test collections separate from production.

Before submitting, run `npm run check`, `npm test`, `npm run build`, `npm run build:cloud`, and `npm run build:site`. For UI changes, inspect phone, tablet, and desktop widths in both appearances. Check keyboard focus, reduced motion, errors, and loading states.

Follow the direction in `DESIGN.md`. UI language and deck language are independent. Preserve existing database identifiers and backup formats unless a migration explicitly supports the change.

Explain the user-visible problem and outcome, with relevant validation. For a deck bug, provide the smallest example you have permission to redistribute. Never attach personal notes, private media, setup codes, session files, or environment files.

Public website code is in `site/`; application code is in `src/`; local API code is in `server/`; cloud migrations and API code are in `supabase/`.
