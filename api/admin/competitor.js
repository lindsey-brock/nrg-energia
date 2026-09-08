// Competitor page analysis — free, no third-party API.
//
// Fetches a public page and reports what it exposes about its own SEO: title,
// meta description, heading structure, word count, structured data, hreflang,
// image alt coverage. Comparing a competitor's service page against the
// equivalent page here is most of what a paid "competitor research" report
// gives you for a site this size, and it costs nothing.
//
// What this deliberately does NOT do: rank tracking or backlink data. Neither
// is available free, and guessing at them would be worse than omitting them.

import { requireSession } from './_auth.js';
import { lookup } from 'node:dns/promises';

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;

// ── SSRF guard: this endpoint fetches a URL the user supplies ────────────────
const PRIVATE_V4 = [
  /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^0\./,
];

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('URL non valido'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo http e https sono ammessi');
  if (/^\[?::1\]?$/.test(url.hostname) || url.hostname === 'localhost') throw new Error('Indirizzo non pubblico');

  const { address } = await lookup(url.hostname).catch(() => ({ address: null }));
  if (!address) throw new Error('Host non risolvibile');
  if (address.includes(':')) {
    if (address.startsWith('::1') || address.toLowerCase().startsWith('fc') || address.toLowerCase().startsWith('fd')) {
      throw new Error('Indirizzo non pubblico');
    }
  } else if (PRIVATE_V4.some((re) => re.test(address))) {
    throw new Error('Indirizzo non pubblico');
  }
  return url;
}

// ── extraction ───────────────────────────────────────────────────────────────
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  '&rsquo;': '’', '&egrave;': 'è', '&eacute;': 'é', '&agrave;': 'à', '&ugrave;': 'ù', '&ograve;': 'ò' };
const text = (s = '') => s.replace(/<[^>]+>/g, ' ')
  .replace(/&[#a-z0-9]+;/gi, (m) => ENT[m.toLowerCase()] ?? ' ')
  .replace(/\s+/g, ' ').trim();

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
};

function analyse(html, url) {
  const head = html.slice(0, 60000);
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const find = (key, val) => meta.find((t) => (attr(t, key) || '').toLowerCase() === val);

  const titleM = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = find('name', 'description');
  const ogTitle = find('property', 'og:title');
  const ogImage = find('property', 'og:image');
  const canonical = (head.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0];
  const hreflang = [...head.matchAll(/<link\b[^>]*hreflang=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);

  const heads = {};
  for (const lvl of [1, 2, 3]) {
    heads[`h${lvl}`] = [...html.matchAll(new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)</h${lvl}>`, 'gi'))]
      .map((m) => text(m[1])).filter(Boolean);
  }

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const withAlt = imgs.filter((t) => (attr(t, 'alt') || '').trim().length > 0).length;

  const origin = new URL(url).origin;
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  // internal = anything that isn't another origin or a non-navigational scheme.
  // Relative hrefs like "portfolio" or "index#servizi" are internal too — an
  // earlier version only counted "/..." and same-origin absolutes, which
  // reported 0 for sites built with relative links.
  const external = /^(https?:)?\/\//i;
  const nonNav = /^(mailto:|tel:|javascript:|data:|#)/i;
  const internal = links.filter((href) => {
    if (nonNav.test(href)) return false;
    if (external.test(href)) return href.startsWith(origin);
    return true;
  }).length;

  const body = html.replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, '');

  return {
    url,
    title: titleM ? text(titleM[1]) : null,
    titleLength: titleM ? text(titleM[1]).length : 0,
    description: desc ? text(attr(desc, 'content') || '') : null,
    descriptionLength: desc ? text(attr(desc, 'content') || '').length : 0,
    words: (text(body).match(/\S+/g) || []).length,
    headings: {
      h1: heads.h1.length, h2: heads.h2.length, h3: heads.h3.length,
      h1Text: heads.h1.slice(0, 3),
      h2Text: heads.h2.slice(0, 12),
    },
    images: { total: imgs.length, withAlt, altCoverage: imgs.length ? Math.round((withAlt / imgs.length) * 100) : null },
    internalLinks: internal,
    structuredData: /application\/ld\+json/i.test(head),
    openGraph: { title: Boolean(ogTitle), image: Boolean(ogImage) },
    canonical: Boolean(canonical),
    hreflang: [...new Set(hreflang)],
  };
}

export default requireSession(async function handler(req, res) {
  const target = req.query?.url;
  if (!target) return res.status(400).json({ error: 'Manca il parametro url' });

  try {
    const url = await assertPublicUrl(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const r = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NRG-Admin-SEO/1.0)' },
    }).finally(() => clearTimeout(timer));

    if (!r.ok) return res.status(200).json({ error: `La pagina ha risposto ${r.status}` });
    const type = r.headers.get('content-type') || '';
    if (!type.includes('html')) return res.status(200).json({ error: `Tipo di contenuto non analizzabile (${type})` });

    const buf = await r.arrayBuffer();
    const html = Buffer.from(buf.slice(0, MAX_BYTES)).toString('utf8');

    return res.status(200).json({ ok: true, ...analyse(html, r.url || url.toString()) });
  } catch (err) {
    const message = err.name === 'AbortError' ? 'La pagina non ha risposto in tempo' : err.message;
    return res.status(200).json({ error: message });
  }
});
