// SEO checks for the blog.
//
// Two modes:
//   GET /api/admin/seo                 on-page audit of every post, computed from
//                                      content/posts.json. No external service,
//                                      no API key, no network — instant.
//   GET /api/admin/seo?url=<page>      PageSpeed Insights (Lighthouse SEO,
//                                      performance, Core Web Vitals) for one URL.
//                                      Free, but needs PAGESPEED_API_KEY because
//                                      the keyless quota is shared and exhausted.

import { requireSession } from './_auth.js';
import { readTextFile } from './_store.js';

// ── helpers ──────────────────────────────────────────────────────────────────
const ENTITIES = { '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&mdash;': '—', '&ndash;': '–', '&eacute;': 'é', '&egrave;': 'è', '&agrave;': 'à',
  '&ugrave;': 'ù', '&ograve;': 'ò', '&laquo;': '«', '&raquo;': '»', '&amp;': '&', '&nbsp;': ' ' };

const plain = (html = '') =>
  String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, (m) => ENTITIES[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s) => (plain(s).match(/\S+/g) || []).length;

// Ranges are conventional SERP display limits, not hard rules.
const TITLE = [30, 60];
const DESC = [120, 160];
const MIN_WORDS = 300;

function auditPost(post, lang, allPosts) {
  const L = post[lang];
  const issues = [];
  const add = (level, field, message) => issues.push({ level, field, message });

  const titleLen = plain(L.title).length;
  if (!titleLen) add('error', 'title', 'Titolo mancante');
  else if (titleLen > TITLE[1]) add('warn', 'title', `Titolo di ${titleLen} caratteri — oltre ${TITLE[1]} viene troncato nei risultati`);
  else if (titleLen < TITLE[0]) add('warn', 'title', `Titolo di ${titleLen} caratteri — sotto ${TITLE[0]} sfrutta poco lo spazio`);

  const descLen = plain(L.metaDescription).length;
  if (!descLen) add('error', 'metaDescription', 'Meta description mancante');
  else if (descLen > DESC[1]) add('warn', 'metaDescription', `Meta description di ${descLen} caratteri — oltre ${DESC[1]} viene troncata`);
  else if (descLen < DESC[0]) add('warn', 'metaDescription', `Meta description di ${descLen} caratteri — sotto ${DESC[0]} è poco descrittiva`);

  if (!plain(L.excerpt)) add('warn', 'excerpt', 'Estratto mancante — usato nelle schede e nelle anteprime social');
  if (!plain(L.lead)) add('error', 'lead', 'Paragrafo introduttivo mancante');
  if (!post.image) add('error', 'image', 'Immagine di copertina mancante');
  if (post.image && !plain(L.imageAlt)) add('error', 'imageAlt', 'Testo alternativo mancante sull’immagine di copertina');
  if (post.inlineImage && !plain(L.inlineAlt)) add('warn', 'inlineAlt', 'Testo alternativo mancante su un’immagine nel testo');

  const bodyWords = words(L.lead) + (L.sections || []).reduce((n, s) =>
    n + words(s.heading) + (s.blocks || []).reduce((m, b) => m + words(b.html || ''), 0), 0);
  if (bodyWords < MIN_WORDS) add('warn', 'length', `Circa ${bodyWords} parole — sotto le ${MIN_WORDS} è considerato contenuto sottile`);

  const headings = (L.sections || []).length;
  if (headings < 2) add('warn', 'structure', 'Meno di due sezioni — la struttura aiuta lettura e indicizzazione');

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(L.slug || '')) {
    add('error', 'slug', 'Slug non valido: usa solo minuscole, numeri e trattini');
  }

  // cross-post collisions would produce two pages fighting for the same URL
  const clash = allPosts.filter((p) => p.id !== post.id && p[lang]?.slug === L.slug);
  if (clash.length) add('error', 'slug', `Slug duplicato con “${plain(clash[0][lang].title)}”`);
  const sameTitle = allPosts.filter((p) => p.id !== post.id && plain(p[lang]?.title) === plain(L.title));
  if (sameTitle.length) add('warn', 'title', 'Titolo identico a un altro articolo');

  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  return {
    lang, slug: L.slug, title: plain(L.title), words: bodyWords,
    titleLength: titleLen, descLength: descLen,
    score: Math.max(0, 100 - errors * 15 - warns * 5),
    errors, warns, issues,
  };
}

async function pageSpeed(url, key) {
  const p = new URLSearchParams({ url, strategy: 'mobile' });
  ['seo', 'performance', 'accessibility', 'best-practices'].forEach((c) => p.append('category', c));
  if (key) p.set('key', key);

  const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${p}`);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || `PageSpeed returned ${r.status}`);

  const lr = body.lighthouseResult;
  const cat = (id) => Math.round((lr.categories[id]?.score ?? 0) * 100);
  const failing = Object.values(lr.audits)
    .filter((a) => a.score !== null && a.score < 1 && a.title)
    .map((a) => ({ title: a.title, description: plain(a.description).slice(0, 200) }));

  return {
    url,
    scores: { seo: cat('seo'), performance: cat('performance'),
              accessibility: cat('accessibility'), bestPractices: cat('best-practices') },
    failing: failing.slice(0, 12),
  };
}

export default requireSession(async function handler(req, res) {
  const url = req.query?.url;

  if (url) {
    const key = process.env.PAGESPEED_API_KEY;
    if (!key) {
      return res.status(200).json({
        mode: 'pagespeed', configured: false, missing: ['PAGESPEED_API_KEY'],
        setup: [
          'In Google Cloud Console, enable the "PageSpeed Insights API"',
          'Create an API key (no OAuth needed — it only reads public pages)',
          'Add PAGESPEED_API_KEY to the environment',
          'The free quota is 25,000 requests a day',
        ],
      });
    }
    try {
      return res.status(200).json({ mode: 'pagespeed', configured: true, ...(await pageSpeed(url, key)) });
    } catch (err) {
      return res.status(502).json({ mode: 'pagespeed', configured: true, error: err.message });
    }
  }

  try {
    const posts = JSON.parse(await readTextFile('content/posts.json')).posts || [];
    const reports = [];
    for (const post of posts) {
      for (const lang of ['it', 'en']) {
        if (post[lang]) reports.push({ postId: post.id, published: post.published !== false, ...auditPost(post, lang, posts) });
      }
    }
    return res.status(200).json({
      mode: 'audit', configured: true, reports,
      totals: {
        errors: reports.reduce((n, r) => n + r.errors, 0),
        warns: reports.reduce((n, r) => n + r.warns, 0),
        average: reports.length ? Math.round(reports.reduce((n, r) => n + r.score, 0) / reports.length) : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
