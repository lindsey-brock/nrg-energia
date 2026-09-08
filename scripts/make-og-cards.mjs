#!/usr/bin/env node
// Renders the brand Open Graph cards to og/*.png using headless Chrome, so they
// carry the real dot-grid mark and the Syne wordmark rather than a Cloudinary
// text approximation in Arial.
//
//   node scripts/make-og-cards.mjs
//
// Blog post cards stay on Cloudinary: they have to be composed at publish time
// from whatever title the editor typed, and Chrome isn't available there.

import { writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'og');
const TMP = join(ROOT, '.og-tmp');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

async function findChrome() {
  for (const p of CHROME) {
    try { await access(p); return p; } catch { /* keep looking */ }
  }
  throw new Error('Chrome not found — install it, or render the cards on a machine that has it.');
}

const DOTS = ['#f5c842', '#f5c842', '#f5c842', '#2563a8', '#2563a8', '#2563a8', '#4aab6d', '#4aab6d', '#4aab6d'];

function card({ tagline, hours, eyebrow }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;
       background:linear-gradient(135deg,#12301f 0%,#1a4d2e 46%,#0d2237 100%);
       display:flex;flex-direction:column;justify-content:center;
       padding:0 96px;font-family:'DM Sans',sans-serif;color:#fff;position:relative}
  .glow{position:absolute;top:-30%;right:-12%;width:680px;height:680px;border-radius:50%;
        background:radial-gradient(circle,rgba(74,171,109,.22) 0%,transparent 70%)}
  .rule{position:absolute;top:0;left:0;right:0;height:9px;
        background:linear-gradient(90deg,#f5c842 0 33.3%,#2563a8 33.3% 66.6%,#4aab6d 66.6% 100%)}
  .brand{display:flex;align-items:center;gap:26px;margin-bottom:34px}
  .dots{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;width:96px;flex:none}
  .dots i{display:block;width:26px;height:26px;border-radius:50%}
  .word{font-family:'Syne',sans-serif;font-weight:800;font-size:76px;letter-spacing:-1.5px;line-height:1}
  .word span{font-weight:700}
  .eyebrow{font-size:19px;letter-spacing:3.4px;text-transform:uppercase;color:#8fd0a8;margin-bottom:20px}
  .tagline{font-family:'Syne',sans-serif;font-weight:700;font-size:41px;line-height:1.25;
           color:#eaf6ee;max-width:930px;margin-bottom:30px}
  .hours{font-size:23px;color:#9dbcab;letter-spacing:.2px}
</style></head><body>
  <div class="rule"></div><div class="glow"></div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <div class="brand">
    <div class="dots">${DOTS.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
    <div class="word">NRG <span>ENERGIA</span></div>
  </div>
  <div class="tagline">${tagline}</div>
  <div class="hours">${hours}</div>
</body></html>`;
}

const HOURS = {
  it: 'Lun–Ven 8:30–12:30 · 14:30–18:30 · Via I Maggio 70/b, Imola (BO)',
  en: 'Mon–Fri 8:30–12:30 · 14:30–18:30 · Via I Maggio 70/b, Imola, Italy',
};

export const CARDS = [
  { name: 'home-it',      lang: 'it', tagline: 'Energie rinnovabili, coperture e bonifica amianto' },
  { name: 'home-en',      lang: 'en', tagline: 'Renewable energy, roofing and asbestos removal' },
  { name: 'blog-it',      lang: 'it', eyebrow: 'News & Blog', tagline: 'Incentivi, tecnologie e novità dal settore energetico' },
  { name: 'blog-en',      lang: 'en', eyebrow: 'News & Blog', tagline: 'Incentives, technology and news from the energy sector' },
  { name: 'elettrici-it', lang: 'it', eyebrow: 'Servizi', tagline: 'Impianti elettrici civili e industriali' },
  { name: 'elettrici-en', lang: 'en', eyebrow: 'Services', tagline: 'Residential and industrial electrical systems' },
];

async function main() {
  const chrome = await findChrome();
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  for (const c of CARDS) {
    const html = join(TMP, `${c.name}.html`);
    const png = join(OUT, `${c.name}.png`);
    await writeFile(html, card({ ...c, hours: HOURS[c.lang] }), 'utf8');
    await run(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      '--virtual-time-budget=6000',      // let the webfont land
      `--screenshot=${png}`,
      `file://${html}`,
    ]).catch((e) => { if (!e.stdout?.includes('Written to file')) throw e; });

    // gradients compress well as JPEG; a 400KB PNG makes chat previews slow
    const jpg = join(OUT, `${c.name}.jpg`);
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', jpg]);
    await rm(png, { force: true });
    console.log(`  og/${c.name}.jpg`);
  }
  await rm(TMP, { recursive: true, force: true });
  console.log(`\n${CARDS.length} cards written to og/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
