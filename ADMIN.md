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

## Creating and removing posts

"+ Nuovo articolo" creates a **draft** and opens it in the canvas. Drafts
generate no pages and don't appear on the site — tick "Pubblicato" when it's
ready. "+ Nuovo lavoro" does the same for portfolio items.

Deleting a post, unpublishing it, or renaming its slug removes the pages it used
to produce, in the same commit as the save. Without that, a renamed post would
leave its old URL live forever. `npm run build:blog` does the same cleanup from
the command line, and `npm run check:blog` reports stale files as drift.

## Editor

The blog editor is a canvas, not a form: the article renders with the site's own
CSS and is edited in place. Blocks (paragraph, quote, rate cards, icon list,
image) can be added, reordered by dragging the handle, or deleted. Titles, slugs
and SEO fields stay as form fields below the canvas.

Blocks available: paragraph, sub-heading (H3/H4), pull quote, callout box,
rate cards, icon list, image. The article title is the page's only H1 — one per
page is what search engines expect — so body headings start at H2 (the section
titles) with H3/H4 beneath.

The sidebar is edited below the canvas: the table of contents generates itself
from the section headings, the related service is a dropdown, and the regulatory
references box takes `text | linked text | trailing text`. The contact card is
fixed.

Dropping an image onto a figure replaces it; dropping onto empty canvas replaces
the hero image. Uploads are signed server-side so the Cloudinary secret never
reaches the browser. "Scegli dalla libreria" lists what is already in the
Cloudinary account, so existing site photos can be reused without re-uploading:

| Variable | Purpose |
|---|---|
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | signed uploads to the existing `dmegrbq5k` cloud |
| `DEEPL_API_KEY` | "Genera versione inglese" — IT→EN draft translation |

Translation walks the Italian content in order, sends every segment to DeepL
with HTML tag handling on, and writes the results into the English side. It is a
**draft**: it overwrites the English version and should be reviewed before
saving.

## SEO

Inside the editor, a **Controlli SEO** panel sits above the canvas. It shows the
score for each language and expands to list every issue with a concrete fix —
how many characters to add, what to write, which slug to use. It recalculates
about a second after you stop typing, against the unsaved draft, so the score
moves while you write rather than after you publish.

Every post in the Blog list also carries score chips (IT and EN) with an
expandable panel listing what to fix. It recalculates on every load, so a new
post is audited the moment it is created — there is nothing to run, and no LLM
involved: the checks are deterministic rules over the content (character counts,
missing fields, duplicate slugs), not generated text.

The **SEO** tab keeps the site-wide view: totals, the worst-scoring pages, the
competitor analyser and PageSpeed. It audits every post in both languages from
`content/posts.json` — no external service, no API key, no network call. It
checks title and meta-description lengths against SERP display limits, missing
alt text, thin content, section structure, slug format, and duplicate slugs or
titles across posts. Errors cost 15 points, warnings 5.

The same tab can run **PageSpeed Insights** (Lighthouse SEO, performance,
accessibility, Core Web Vitals) against a public URL. Free, but it needs
`PAGESPEED_API_KEY` — the keyless quota is shared across all anonymous callers
and is permanently exhausted.

### Competitor research

"Analisi di un concorrente" fetches any public page and reports how it is built:
title and description lengths, heading structure with their actual H2s, word
count, image alt coverage, internal link count, structured data, canonical and
hreflang. Comparing a competitor's service page with the equivalent page here
covers most of what a paid audit gives a site this size, and costs nothing.

The endpoint fetches a user-supplied URL, so it validates the target first:
http/https only, DNS resolved and checked against private and link-local ranges,
12-second timeout, 1.5MB cap, HTML content types only.

What it deliberately does not do is rank tracking or backlink data. Neither is
available free, and estimating them would be worse than leaving them out.

Free options worth knowing, none of them API-accessible:

| Tool | Free allowance |
|---|---|
| SEMrush / Ubersuggest / Moz | a handful of competitor domain lookups a day, web UI only |
| Ahrefs Webmaster Tools | full backlink and keyword data, but only for sites you verify |
| Bing Webmaster Tools | keyword research with real volumes, free, and it has an API |
| Google Keyword Planner | free with a Google Ads account; volumes are bucketed without spend |
| Google Trends | relative interest and term comparison, free |

### On paid SEO tools

SEMrush and Ahrefs both put their APIs behind expensive plans, and for *this
site's own rankings* they largely duplicate Search Console, which reports actual
positions rather than estimates and is free. Their real advantage is competitor
and keyword-gap data, which no free API provides. Worth buying a seat and using
their web UI if that's wanted — not worth wiring into this dashboard.

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

## Moving to the client's Cloudinary account

The client never signs into Cloudinary. The admin lists their images and
receives their uploads using credentials held in the Vercel environment — the
dashboard is the only interface they see.

To hand the media over, the existing images move across first. Cloudinary has no
account-to-account transfer, but its uploader accepts a remote URL, so the new
account pulls each asset straight from the old account's CDN.

```bash
# .env.local — source is the current account, destination is the client's
CLOUDINARY_CLOUD_NAME=dmegrbq5k
CLOUDINARY_API_KEY=…
CLOUDINARY_API_SECRET=…
DEST_CLOUD_NAME=…
DEST_API_KEY=…
DEST_API_SECRET=…
```

```bash
npm run cloudinary:list      # what would move
npm run cloudinary:copy      # copy, preserving every public_id
npm run cloudinary:rewrite   # swap the cloud name across the repo
npm run check:blog           # confirm nothing else drifted
```

Delivery URLs work without the `/v<version>/` segment, and the copy preserves
`public_id`, so **the cloud name is the only thing that changes** — 361
references across 25 files, all handled by the rewrite step. No image URLs need
rebuilding by hand.

Keep the old account alive until the new URLs are live, then retire it.
