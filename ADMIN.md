# Admin dashboard

Lives at `/admin/`, is `noindex, nofollow`, and is not linked from anywhere on
the public site. It needs the serverless functions, so it works on Vercel or
via the local dev server below — **not** on GitHub Pages, which serves static
files only.

## Running it locally

```bash
npm run dev          # http://localhost:3100/admin/
```

Create `.env.local` first (gitignored):

```
ADMIN_PASSWORD=choose-something-long
ADMIN_SESSION_SECRET=random-string-at-least-32-chars
```

Locally, saving writes straight to the working tree so you can inspect the diff.

## How content flows

Blog posts are **data**, not hand-written HTML:

```
content/posts.json  ──▶  scripts/render.mjs  ──▶  blog.html
                                                  blog/<slug>.html
                                                  services/en/blog.html
                                                  services/en/blog/<slug>.html
```

Saving a post in the admin rewrites the JSON and regenerates all six pages in
one commit. The same renderer backs the CLI, so the two can't drift:

```bash
npm run check:blog   # fails if any page differs from content/posts.json
npm run build:blog   # regenerate after editing the JSON by hand
```

`scripts/templates/*.html` hold the page shell (nav, footer, styles, quote
modal) with `{{PLACEHOLDERS}}`. Edit those to change chrome; edit the JSON to
change content.

## Production environment

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | sign-in password |
| `ADMIN_SESSION_SECRET` | signs the session cookie |
| `GITHUB_TOKEN` | fine-grained PAT, Contents: read & write |
| `GITHUB_REPO` | `owner/name` |
| `GITHUB_BRANCH` | defaults to `main` |

Without `GITHUB_TOKEN` the admin has nowhere to persist to on Vercel — the
filesystem there is read-only. With it, saving commits to the repo and the
resulting push redeploys the site.

## Editor

The blog editor is a canvas, not a form: the article renders with the site's own
CSS and is edited in place. Blocks (paragraph, quote, rate cards, icon list,
image) can be added, reordered by dragging the handle, or deleted. Titles, slugs
and SEO fields stay as form fields below the canvas.

Dropping an image onto a figure replaces it; dropping onto empty canvas replaces
the hero image. Uploads are signed server-side so the Cloudinary secret never
reaches the browser:

| Variable | Purpose |
|---|---|
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | signed uploads to the existing `dmegrbq5k` cloud |
| `DEEPL_API_KEY` | "Genera versione inglese" — IT→EN draft translation |

Translation walks the Italian content in order, sends every segment to DeepL
with HTML tag handling on, and writes the results into the English side. It is a
**draft**: it overwrites the English version and should be reviewed before
saving.

## Marketing sources

Each platform reports as connected only when its credentials are present. See
`api/admin/integrations.js` for the per-platform setup steps.

| Source | Variables | Effort |
|---|---|---|
| Google Search Console | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` | ~15 min, no approval |
| YouTube | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | ~10 min |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID` | needs LinkedIn approval |
| Facebook | `META_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID` | needs Meta App Review |
| Instagram | `META_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID` | needs Meta App Review |

Only Search Console has a working data path today; the other four report their
connection status and setup steps but have no fetch implementation yet.
