#!/usr/bin/env node
// Injects canonical, hreflang, Open Graph and Twitter tags into the static
// pages. The blog pages get theirs from scripts/render.mjs instead, since they
// are generated. Re-running replaces the block rather than duplicating it.
//
//   node scripts/add-seo-meta.mjs           write
//   node scripts/add-seo-meta.mjs --check   report what is missing, write nothing

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, metaBlock, escapeAttr } from './seo-meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '  <!-- seo:start -->';
const END = '  <!-- seo:end -->';

function upsert(html, block, description) {
  // description: some pages already have one, the homepage has none
  const descTag = `  <meta name="description" content="${escapeAttr(description)}"/>`;
  if (/<meta name="description"[^>]*>/i.test(html)) {
    html = html.replace(/[ \t]*<meta name="description"[^>]*>/i, descTag);
  } else {
    html = html.replace(/(<title>[\s\S]*?<\/title>)/i, `$1\n${descTag}`);
  }

  const wrapped = `${START}\n${block}\n${END}`;
  if (html.includes(START)) {
    return html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), wrapped);
  }
  return html.replace(/(<meta name="description"[^>]*>)/i, `$1\n${wrapped}`);
}

const check = process.argv.includes('--check');
let changed = 0;

for (const pair of PAGES) {
  const alt = { it: pair.it.url, en: pair.en.url };

  for (const lang of ['it', 'en']) {
    const side = pair[lang];
    // the homepage serves both languages from one file, so it carries the
    // Italian block and declares English as an alternate
    if (pair.sharedFile && lang === 'en') continue;

    const abs = join(ROOT, side.file);
    const before = await readFile(abs, 'utf8');
    const block = metaBlock({
      lang, self: side.url, alt,
      title: side.title, description: side.description,
      ogImage: side.og(),
    });
    const after = upsert(before, block, side.description);

    if (after === before) { console.log(`  unchanged ${side.file}`); continue; }
    changed++;
    if (check) { console.log(`  WOULD UPDATE ${side.file}`); continue; }
    await writeFile(abs, after, 'utf8');
    console.log(`  updated   ${side.file}  (${lang})`);
  }
}

console.log(check
  ? `\n${changed} file(s) would change`
  : `\n${changed} file(s) updated`);
