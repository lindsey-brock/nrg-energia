// Renders the blog HTML from content/posts.json.
import { metaBlock, photoCard, brandAsset } from './seo-meta.mjs';
import { ICONS } from './icons.mjs';
// Used by scripts/build.mjs (CLI) and api/admin/publish.js (admin dashboard).

const CLOUD = (typeof process !== 'undefined' && process.env?.CLOUDINARY_CLOUD_NAME) || 'dmegrbq5k';
const CLOUDINARY = `https://res.cloudinary.com/${CLOUD}/image/upload`;
const img = (id, w) => `${CLOUDINARY}/q_auto,f_auto,w_${w}/${id}`;

// Where each language's files live, and how to climb back to the site root.
export const LAYOUT = {
  it: { indexFile: 'blog.html',              articleDir: 'blog',              rootFromIndex: '',       rootFromArticle: '../' },
  en: { indexFile: 'services/en/blog.html',  articleDir: 'services/en/blog',  rootFromIndex: '../../', rootFromArticle: '../../../' },
};

const SERVICES = {
  'energie-rinnovabili': { it: ['Energie rinnovabili', 'services/energie-rinnovabili'], en: ['Renewable energy', 'services/en/renewable-energy'] },
  'coperture':           { it: ['Coperture', 'services/coperture'],                     en: ['Roofing', 'services/en/roofing'] },
  'bonifica-amianto':    { it: ['Bonifica amianto', 'services/bonifica-amianto'],       en: ['Asbestos removal', 'services/en/asbestos-removal'] },
};

const T = {
  it: { readMore: 'Leggi di pi&ugrave; &rarr;', back: '&larr; Torna a News &amp; Blog', share: 'Condividi',
        related: 'Continua a leggere', toc: 'In questo articolo', service: 'Servizio collegato',
        serviceLink: 'Scopri il servizio &rarr;', refs: 'Riferimenti normativi', talk: 'Parliamone',
        office: 'Ufficio tecnico NRG Energia' },
  en: { readMore: 'Read more &rarr;', back: '&larr; Back to News &amp; Blog', share: 'Share',
        related: 'Keep reading', toc: 'In this article', service: 'Related service',
        serviceLink: 'See the service &rarr;', refs: 'Regulatory references', talk: 'Let’s talk',
        office: 'NRG Energia technical office' },
};


const tagClass = (category) => (category === 'coperture' ? ' blue' : '');

// Plain-text fields (title, excerpt, alt text…) hold real characters, not HTML
// entities, so the editor can show them as typed. They are escaped here on the
// way into the page. Rich fields — the lead, section headings and block html —
// intentionally contain markup and are inserted as-is.
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s = '') => esc(s).replace(/"/g, '&quot;');

/** Accepts a YouTube or Vimeo URL and returns its privacy-friendly embed form. */
export function embedUrl(raw = '') {
  const url = String(raw).trim();
  if (!url) return '';
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return '';
}

// ── SEO head block ───────────────────────────────────────────────────────────
const OG_ALT = {
  it: (post) => `/blog/${post.it.slug}`,
  en: (post) => `/services/en/blog/${post.en.slug}`,
};

function articleSeo(post, lang) {
  const L = post[lang];
  const self = OG_ALT[lang](post);
  return metaBlock({
    lang, self,
    alt: { it: OG_ALT.it(post), en: OG_ALT.en(post) },
    title: L.title, description: L.metaDescription,
    // the post's own photo, with its title and description composed on top
    ogImage: photoCard(post.image, L.title, L.metaDescription),
    type: 'article',
  });
}

function indexSeo(lang) {
  const self = lang === 'it' ? '/blog' : '/services/en/blog';
  const copy = lang === 'it'
    ? { title: 'News & Blog — NRG Energia',
        description: 'Approfondimenti su incentivi fiscali, fotovoltaico, coperture e sicurezza in quota dal team di NRG Energia.',
        tagline: 'News & Blog' }
    : { title: 'News & Blog — NRG Energia',
        description: 'Insights on tax incentives, solar power, roofing and working at height from the NRG Energia team.',
        tagline: 'News & Blog' };
  return metaBlock({
    lang, self, alt: { it: '/blog', en: '/services/en/blog' },
    title: copy.title, description: copy.description,
    ogImage: brandAsset(lang === 'it' ? 'blog-it' : 'blog-en'),
  });
}

/** URL of a post, relative to the page doing the linking. */
export function postUrl(post, lang, from) {
  const slug = post[lang].slug;
  if (lang === 'it') return from === 'index' ? `blog/${slug}` : `../blog/${slug}`;
  return from === 'index'
    ? `../../services/en/blog/${slug}`
    : `../../../services/en/blog/${slug}`;
}

// ── content blocks ───────────────────────────────────────────────────────────
function renderBlock(block, post, lang) {
  switch (block.type) {
    case 'p': {
      // the toolbar can turn a paragraph into a list; <ul> inside <p> is invalid
      // HTML and browsers unnest it, so emit the list on its own
      const html = (block.html || '').trim();
      if (/^<(ul|ol)[\s>]/i.test(html)) return `        ${html}`;
      return `        <p>${html}</p>`;
    }
    case 'quote':
      return `        <blockquote class="pull-quote">${block.html}</blockquote>`;
    case 'heading': {
      const level = [3, 4].includes(Number(block.level)) ? Number(block.level) : 3;
      const id = block.id ? ` id="${block.id}"` : '';
      return `        <h${level}${id}>${block.html}</h${level}>`;
    }
    case 'video': {
      const src = embedUrl(block.url);
      if (!src) return '';
      const L = post[lang];
      return [
        '        <figure class="article-video">',
        '          <div class="frame">',
        `            <iframe src="${src}" title="${escAttr(block.title || L.title)}" loading="lazy" allowfullscreen`,
        '                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"></iframe>',
        '          </div>',
        block.caption ? `          <figcaption>${esc(block.caption)}</figcaption>` : null,
        '        </figure>',
      ].filter(Boolean).join('\n');
    }
    case 'callout':
      return [
        '        <div class="callout">',
        `          <div class="callout-icon">${block.icon || 'i'}</div>`,
        `          <p>${block.html}</p>`,
        '        </div>',
      ].join('\n');
    case 'rates':
      return [
        '        <div class="rate-grid">',
        ...block.items.map((r) => [
          `          <div class="rate-card${r.variant === 'alt' ? ' alt' : ''}">`,
          `            <div class="rate-num">${r.value}</div>`,
          `            <div class="rate-label">${r.label}</div>`,
          '          </div>',
        ].join('\n')),
        '        </div>',
      ].join('\n');
    case 'icons':
      return [
        '        <div class="icon-grid">',
        ...block.items.map((i) =>
          `          <div class="icon-card">${ICONS[i.icon] || ''}<span>${i.label}</span></div>`),
        '        </div>',
      ].join('\n');
    case 'figure': {
      // each figure carries its own image; older posts fall back to the single
      // post-level inlineImage they were written against
      const L = post[lang];
      const id = block.image || post.inlineImage;
      if (!id) return '';
      const alt = block.alt ?? L.inlineAlt ?? '';
      const caption = block.caption ?? L.inlineCaption ?? '';
      return [
        '        <figure class="article-inline-figure">',
        `          <img src="${img(id, 1200)}" alt="${escAttr(alt)}" loading="lazy" decoding="async">`,
        caption ? `          <figcaption>${esc(caption)}</figcaption>` : null,
        '        </figure>',
      ].filter(Boolean).join('\n');
    }
    default:
      return '';
  }
}

export function renderBody(post, lang) {
  const L = post[lang];
  const out = [`  <p class="lead">${L.lead}</p>`, ''];
  for (const s of L.sections) {
    out.push(`        <h2 id="${s.id}">${s.heading}</h2>`);
    for (const b of s.blocks) {
      const html = renderBlock(b, post, lang);
      if (html) out.push(html);
    }
  }
  out.push('      ');
  return out.join('\n');
}

// ── sidebar ──────────────────────────────────────────────────────────────────
export function renderAside(post, lang) {
  const t = T[lang];
  const L = post[lang];
  const root = LAYOUT[lang].rootFromArticle;
  const toc = L.sections
    .map((s) => `        <a href="#${s.id}">${s.heading}</a>`)
    .join('\n');

  const svc = SERVICES[post.service];
  const [svcName, svcPath] = svc ? svc[lang] : ['', ''];

  let refs = '';
  if (post.references && post.references[lang]) {
    // "plain|linked|trailing" — the middle part becomes the hyperlink
    const parts = post.references[lang].split('|');
    const body = parts.length > 1
      ? `${parts[0]}<br><a href='${post.references.url}' target='_blank' rel='noopener noreferrer'>${parts[1]}</a>${parts[2] ? ' ' + parts[2] : ''}`
      : `<a href='${post.references.url}' target='_blank' rel='noopener noreferrer'>${parts[0]}</a>`;
    refs = [
      '    <div class="aside-card">',
      `      <div class="aside-label">${t.refs}</div>`,
      `      <p>${body}</p>`,
      '    </div>',
    ].join('\n') + '\n';
  }

  return [
    '<aside class="article-aside">',
    '    <div class="aside-toc-block">',
    `      <div class="aside-label">${t.toc}</div>`,
    '      <div class="aside-toc">',
    toc,
    '      </div>',
    '    </div>',
    `    <a class="aside-card" href="${root}${svcPath}">`,
    `      <div class="aside-label">${t.service}</div>`,
    `      <div class="aside-card-title">${svcName}</div>`,
    `      <span class="aside-card-link">${t.serviceLink}</span>`,
    '    </a>',
    refs + '    <div class="aside-card">',
    `      <div class="aside-label">${t.talk}</div>`,
    `      <p>${t.office}<br><a href="mailto:info@nrg-energia.it">info@nrg-energia.it</a><br><a href="tel:+390542552010">+39 0542 55201</a></p>`,
    '    </div>',
    '  </aside>',
  ].join('\n');
}

// ── cards ────────────────────────────────────────────────────────────────────
export function renderCard(post, lang, { featured = false, reverse = false, from = 'index' } = {}) {
  const L = post[lang];
  const t = T[lang];
  const url = postUrl(post, lang, from);
  const cls = tagClass(post.category);

  if (featured) {
    return [
      `  <a href="${url}" class="post-featured${reverse ? ' reverse' : ''}" data-category="${post.category}">`,
      '    <div class="post-featured-media">',
      `      <img src="${img(post.image, 1200)}" alt="${escAttr(L.imageAlt)}" loading="lazy" decoding="async">`,
      `      <span class="post-tag${cls} post-media-tag">${esc(L.tag)}</span>`,
      '    </div>',
      '    <div class="post-featured-body">',
      '      <div class="post-meta">',
      `        <span class="post-date">${esc(L.dateLabel)} &middot; ${esc(L.readLabel)}</span>`,
      '      </div>',
      `      <h2 class="post-title">${esc(L.title)}</h2>`,
      `      <p class="post-excerpt">${esc(L.excerpt)}</p>`,
      `      <span class="post-read">${t.readMore}</span>`,
      '    </div>',
      '  </a>',
    ].join('\n');
  }

  return [
    `      <a href="${url}" class="post-card" data-category="${post.category}">`,
    '        <div class="post-card-media">',
    `          <img src="${img(post.image, 800)}" alt="${escAttr(L.imageAlt)}" loading="lazy" decoding="async">`,
    `          <span class="post-tag${cls} post-media-tag">${esc(L.tag)}</span>`,
    '        </div>',
    '        <div class="post-card-body">',
    `          <div class="post-meta"><span class="post-date">${esc(L.dateLabel)}</span></div>`,
    `          <h3 class="post-title">${esc(L.title)}</h3>`,
    `          <p class="post-excerpt">${esc(L.excerpt)}</p>`,
    `          <span class="post-read">${t.readMore}</span>`,
    '        </div>',
    '      </a>',
  ].join('\n');
}

// ── pages ────────────────────────────────────────────────────────────────────

// With every post unpublished there is no card to lead with. The index still
// has to render: the page is linked from the nav either way.
const NO_POSTS = {
  it: '    <p style="text-align:center;color:var(--text-mid);padding:48px 0">Non ci sono ancora articoli pubblicati.</p>',
  en: '    <p style="text-align:center;color:var(--text-mid);padding:48px 0">No articles have been published yet.</p>',
};

export function renderIndex(template, posts, lang) {
  const live = posts.filter((p) => p.published !== false);
  const rest = live.slice(1);
  let cards = live.length ? renderCard(live[0], lang, { featured: true }) : NO_POSTS[lang];
  if (rest.length === 1) {
    cards += '\n\n' + renderCard(rest[0], lang, { featured: true, reverse: true });
  } else if (rest.length > 1) {
    cards += '\n\n    <div class="post-grid" id="postGrid">\n'
      + rest.map((p) => renderCard(p, lang)).join('\n') + '\n    </div>';
  }
  const altHref = lang === 'it' ? 'services/en/blog' : '../../blog';
  return template.replace('{{CARDS}}', cards)
    .replace('{{SEO_META}}', indexSeo(lang))
    .replace(/\{\{ALT_HREF\}\}/g, altHref);
}

export function renderArticle(template, post, posts, lang) {
  const L = post[lang];
  const t = T[lang];
  const other = posts.filter((p) => p.id !== post.id && p.published !== false)[0];
  const root = LAYOUT[lang].rootFromArticle;

  const heroFigure = [
    '<figure class="article-figure">',
    `  <img src="${img(post.image, 1600)}" alt="${escAttr(L.imageAlt)}" loading="eager" decoding="async">`,
    post.imageCaption ? `  <figcaption>${post.imageCaption}</figcaption>` : null,
    '</figure>',
  ].filter(Boolean).join('\n');

  const altSlug = lang === 'it' ? post.en.slug : post.it.slug;
  const altHref = lang === 'it' ? `${root}services/en/blog/${altSlug}` : `${root}blog/${altSlug}`;
  const blogHome = lang === 'it' ? `${root}blog` : `${root}services/en/blog`;
  const plainTitle = L.title.replace(/&mdash;/g, '-').replace(/—/g, '-');

  return template
    .replace('{{SEO_META}}', articleSeo(post, lang))
    .replace('{{TITLE}}', `${esc(plainTitle)} &mdash; NRG Energia`)
    .replace('{{META_DESCRIPTION}}', escAttr(L.metaDescription))
    .replace(/\{\{ALT_HREF\}\}/g, altHref)
    .replace(/\{\{TAG_CLASS\}\}/g, tagClass(post.category))
    .replace(/\{\{TAG\}\}/g, esc(L.tag))
    .replace('{{TITLE_HTML}}', esc(L.title))
    .replace('{{DATE}}', esc(L.dateLabel))
    .replace('{{READ}}', esc(L.readLabel))
    .replace('{{HERO_FIGURE}}', heroFigure)
    .replace('{{BODY}}', renderBody(post, lang))
    .replace('{{ASIDE}}', renderAside(post, lang))
    .replace('{{BLOG_HOME}}', blogHome)
    .replace('{{RELATED_CARD}}', other ? renderCard(other, lang, { from: 'article' }) : '');
}
