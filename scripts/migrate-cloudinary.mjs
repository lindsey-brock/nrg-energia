#!/usr/bin/env node
// Copies every image from one Cloudinary account to another, preserving
// public_ids, then rewrites the cloud name across the repo.
//
// Cloudinary has no account-to-account transfer, but its uploader accepts a
// remote URL as the source — so the destination account fetches each asset
// straight from the source account's CDN. Nothing is downloaded locally.
//
// Because delivery URLs work without the /v<version>/ segment (verified), and
// public_ids are preserved, the only thing that changes in the HTML is the
// cloud name.
//
//   node scripts/migrate-cloudinary.mjs --dry-run   list what would move
//   node scripts/migrate-cloudinary.mjs --copy      copy the assets
//   node scripts/migrate-cloudinary.mjs --rewrite   swap the cloud name in the repo
//
// Env (put these in .env.local):
//   CLOUDINARY_CLOUD_NAME  CLOUDINARY_API_KEY  CLOUDINARY_API_SECRET        source
//   DEST_CLOUD_NAME        DEST_API_KEY        DEST_API_SECRET              destination

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(ROOT, '.env.local'))) {
  for (const line of (await readFile(join(ROOT, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SRC = {
  cloud: process.env.CLOUDINARY_CLOUD_NAME || 'dmegrbq5k',
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
};
const DST = {
  cloud: process.env.DEST_CLOUD_NAME,
  key: process.env.DEST_API_KEY,
  secret: process.env.DEST_API_SECRET,
};

const basic = (a) => 'Basic ' + Buffer.from(`${a.key}:${a.secret}`).toString('base64');

async function listAll(account) {
  const out = [];
  let cursor = null;
  do {
    const p = new URLSearchParams({ max_results: '100', type: 'upload', resource_type: 'image' });
    if (cursor) p.set('next_cursor', cursor);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${account.cloud}/resources/image?${p}`,
      { headers: { Authorization: basic(account) } });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error?.message || `Listing failed (${r.status})`);
    out.push(...(body.resources || []));
    cursor = body.next_cursor || null;
  } while (cursor);
  return out;
}

/** Upload by remote URL, keeping the same public_id. */
async function copyAsset(asset) {
  const source = `https://res.cloudinary.com/${SRC.cloud}/image/upload/v${asset.version}/${asset.public_id}.${asset.format}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { overwrite: 'true', public_id: asset.public_id, timestamp: String(timestamp) };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + DST.secret;
  const { createHash } = await import('node:crypto');
  const signature = createHash('sha1').update(toSign).digest('hex');

  const form = new URLSearchParams({ ...params, file: source, api_key: DST.key, signature });
  const r = await fetch(`https://api.cloudinary.com/v1_1/${DST.cloud}/image/upload`, {
    method: 'POST', body: form,
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || `Upload failed (${r.status})`);
  return body;
}

/** Repo-wide cloud-name swap. Safe because public_ids are unchanged. */
async function rewrite() {
  if (!DST.cloud) throw new Error('DEST_CLOUD_NAME is not set');
  const files = execSync(
    `grep -rl "res.cloudinary.com/${SRC.cloud}" --include="*.html" --include="*.json" --include="*.js" --include="*.mjs" --include="*.css" .`,
    { cwd: ROOT, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean);

  let total = 0;
  for (const rel of files) {
    const abs = join(ROOT, rel);
    const before = await readFile(abs, 'utf8');
    const after = before.replaceAll(`res.cloudinary.com/${SRC.cloud}`, `res.cloudinary.com/${DST.cloud}`)
                        .replaceAll(`api.cloudinary.com/v1_1/${SRC.cloud}`, `api.cloudinary.com/v1_1/${DST.cloud}`)
                        .replaceAll(`'${SRC.cloud}'`, `'${DST.cloud}'`);
    if (after !== before) {
      const n = before.split(SRC.cloud).length - 1;
      await writeFile(abs, after, 'utf8');
      console.log(`  ${rel} — ${n} reference(s)`);
      total += n;
    }
  }
  console.log(`\nRewrote ${total} references across ${files.length} files.`);
  console.log('Now set CLOUDINARY_* to the new account and run: npm run check:blog');
}

// ── main ─────────────────────────────────────────────────────────────────────
const mode = process.argv[2] || '--dry-run';

if (mode === '--rewrite') {
  await rewrite();
} else {
  if (!SRC.key || !SRC.secret) {
    console.error('Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for the source account.');
    process.exit(1);
  }
  const assets = await listAll(SRC);
  console.log(`Source cloud "${SRC.cloud}": ${assets.length} images\n`);

  if (mode === '--dry-run') {
    for (const a of assets) {
      console.log(`  ${a.public_id}.${a.format}  ${(a.bytes / 1024).toFixed(0)}KB  ${a.width}x${a.height}`);
    }
    console.log(`\nDry run only. Re-run with --copy once DEST_* are set.`);
    process.exit(0);
  }

  if (!DST.cloud || !DST.key || !DST.secret) {
    console.error('Set DEST_CLOUD_NAME, DEST_API_KEY and DEST_API_SECRET for the destination account.');
    process.exit(1);
  }

  let ok = 0, failed = 0;
  for (const a of assets) {
    try {
      await copyAsset(a);
      ok++;
      console.log(`  copied  ${a.public_id}`);
    } catch (err) {
      failed++;
      console.log(`  FAILED  ${a.public_id} — ${err.message}`);
    }
  }
  console.log(`\n${ok} copied, ${failed} failed.`);
  if (!failed) console.log('Next: node scripts/migrate-cloudinary.mjs --rewrite');
}
