#!/usr/bin/env node
// Rebuilds every blog page from content/posts.json.
//   node scripts/build.mjs          write the files
//   node scripts/build.mjs --check  report drift without writing (exit 1 if any)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, renderIndex, renderArticle } from './render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = (n) => join(ROOT, 'scripts', 'templates', n);

/** Returns [{ path, html }] for every page the content produces. */
export async function buildPages(posts) {
  const out = [];
  for (const lang of ['it', 'en']) {
    const layout = LAYOUT[lang];
    const indexTpl = await readFile(TPL(`index.${lang}.html`), 'utf8');
    out.push({ path: layout.indexFile, html: renderIndex(indexTpl, posts, lang) });

    const articleTpl = await readFile(TPL(`article.${lang}.html`), 'utf8');
    for (const post of posts) {
      if (post.published === false) continue;
      out.push({
        path: `${layout.articleDir}/${post[lang].slug}.html`,
        html: renderArticle(articleTpl, post, posts, lang),
      });
    }
  }
  return out;
}

export async function loadPosts() {
  return JSON.parse(await readFile(join(ROOT, 'content', 'posts.json'), 'utf8')).posts;
}

async function main() {
  const check = process.argv.includes('--check');
  const posts = await loadPosts();
  const pages = await buildPages(posts);

  let drift = 0;
  for (const { path, html } of pages) {
    const abs = join(ROOT, path);
    const current = existsSync(abs) ? await readFile(abs, 'utf8') : null;
    const same = current === html;
    if (check) {
      if (!same) { console.log(`  DRIFT   ${path}`); drift++; }
      continue;
    }
    if (!same) {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, html, 'utf8');
      console.log(`  ${current === null ? 'created' : 'updated'} ${path}`);
    } else {
      console.log(`  unchanged ${path}`);
    }
  }
  // any generated page that the current content no longer produces is stale
  const expected = new Set(pages.map((p) => p.path));
  const { readdir } = await import('node:fs/promises');
  const stale = [];
  for (const dir of ['blog', 'services/en/blog']) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of await readdir(abs)) {
      if (!name.endsWith('.html')) continue;
      const rel = `${dir}/${name}`;
      if (!expected.has(rel)) stale.push(rel);
    }
  }
  for (const rel of stale) {
    if (check) { console.log(`  STALE   ${rel}`); drift++; continue; }
    const { rm } = await import('node:fs/promises');
    await rm(join(ROOT, rel), { force: true });
    console.log(`  removed ${rel}`);
  }

  if (check) {
    console.log(drift ? `\n${drift} page(s) differ from content/posts.json` : '\nAll pages match content/posts.json');
    process.exit(drift ? 1 : 0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
