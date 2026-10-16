---
layout: ../../layouts/Docs.astro
title: Host your own
description: Run locally, or put your private study space online with Cloudflare Pages and Supabase.
---

## Before you begin

Use Node.js 24 or newer, npm, and Git. Clone this repository, open its folder, then install dependencies with `npm ci`.

The application supports two separate backends. Choose one per installation. There is no automatic synchronisation between local and cloud installations.

## A local server

```sh
npm ci
npm run dev
```

Open `http://localhost:4317`. Create the local account, then import a deck. Data is stored in the ignored `data/` folder. To use a different location, set `MYANKI_DATA_DIR` to an absolute path.

For a production build:

```sh
npm run build
npm start
```

Set `HOST=127.0.0.1` if the server should only accept connections from your computer. The default host accepts connections on your network. For internet access, use an HTTPS reverse proxy and configure `TRUST_PROXY=1` only behind a proxy you control. Never expose the development server directly to the internet.

## Cloudflare Pages and Supabase

### Prepare Supabase

Create your own project on the Free plan. Install the official Supabase CLI, sign in, and link this checkout to your project:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy myanki-api --no-verify-jwt
```

The migrations create the schema, access policies, private Storage bucket, and review operations. Apply every migration in order.

The initial claim endpoint needs to work before a device has a session. This is why gateway JWT verification is disabled for the function. Private endpoints still verify the bearer token and approved device inside the handler. Keep those checks intact.

### Configure the app

Copy `.env.example` to `.env.cloud.local` and fill in your project’s **public** configuration:

```dotenv
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key is meant for browser use. A secret or `service_role` key must never appear in a `VITE_` variable, source file, or GitHub commit.

```sh
npm run dev:cloud
```

### Publish the app

Create a Cloudflare Pages project with Git integration or Direct Upload. Use these settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cloud` |
| Output directory | `dist` |
| Node version | `24` |
| Variables | The three `VITE_` variables above |

Use the free `pages.dev` address. Custom domains are optional and may cost money. You do not need R2, a paid Worker, or a Pages Function.

For an authenticated Wrangler installation, a manual deployment is also possible:

```sh
npm run build:cloud
npx wrangler pages deploy dist --project-name YOUR_PAGES_PROJECT
```

### Connect the first device

```sh
node scripts/create-connect-token.mjs
```

Run the generated `work/setup/setup.sql` in your Supabase project’s SQL Editor. Open the app and enter the code in `work/setup/connect-code.txt`. It is single-use and valid for 30 minutes after the SQL runs. The generated files are ignored by Git.

After connecting, use Settings on this device to create codes for your other devices. Do not share a code publicly: connected devices can access the entire collection.

## About free hosting

The software does not require a paid subscription. Hosting is subject to each provider’s Free quotas and policies. There is no guarantee of unlimited storage, traffic, or availability. Keep your projects on Free and monitor usage in the provider dashboards.

The app caps media imports at an estimated 900 MB. Its quota check is a safety margin, not a billing control. Database usage and account-wide quotas still need checking in Supabase.

See [Supabase pricing](https://supabase.com/pricing) and [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) for current allowances. Free Supabase projects may pause after inactivity, and free backups should be managed by you.

## The public website

The landing page and this handbook live in `site/`. They are static Astro pages, separate from your private app.

```sh
npm run dev:site
npm run build:site
```

GitHub Pages serves this site. Configure its repository base path when deploying to a project URL. The site does not connect to a Supabase project or expose a personal collection.
