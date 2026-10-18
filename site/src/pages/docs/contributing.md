---
layout: ../../layouts/Docs.astro
title: Contribute
description: Focused improvements, clear behaviour, and a study space that stays understandable.
seoTitle: "Contribute to the Open-source Flashcard App"
seoDescription: "Run Cardrove locally, understand its npm workspaces, verify app and handbook changes, and contribute focused improvements to the open-source project."
---

## Work locally

Use Node.js 24 or newer and npm. After cloning the repository:

```sh
npm ci
npm run dev
```

Use a disposable collection for development. Do not test destructive operations against a personal production project. Environment files and user data stay outside Git.

## Check a change

```sh
npm run check
npm test
npm run build
npm run build:cloud
npm run build:site
```

For interface changes, also inspect a phone, tablet, and desktop width. Check light and dark appearances, keyboard focus, reduced motion, loading states, and errors. Label demonstration content honestly.

The design direction is in `DESIGN.md`. Keep the interface useful for any language or subject. Do not infer a deck’s language from its title or the interface locale.

## Send a focused improvement

Explain the problem, the resulting behaviour, and how you verified it. Screenshots help for visual changes. Separate unrelated fixes so a reviewer can assess each change.

Report reproducible deck issues with a small example you have permission to share. Remove personal notes, credentials, connection codes, private media, and production data before attaching anything.

## Dependency choices

Use npm and commit its lockfile. Prefer browser capabilities and small, maintained dependencies where they fit. Measure performance claims against a stated scenario instead of describing an entire stack as universally faster or lighter.

## Documentation

The handbook is built from Markdown and Astro in `site/src`. Public documentation should explain a clean installation, not the configuration or contents of the maintainer’s private instance.
