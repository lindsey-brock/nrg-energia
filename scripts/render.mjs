// Renders the blog HTML from content/posts.json.
// Used by scripts/build.mjs (CLI) and api/admin/publish.js (admin dashboard).

const CLOUDINARY = 'https://res.cloudinary.com/dmegrbq5k/image/upload';
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

const ICONS = {
  panel:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M3 8.3h18M3 12.7h18M9 4v13M15 4v13M12 17v3M9 20h6"/></svg>',
  fixing: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l-2 2v9l-1 3-1-3V9L9 7z"/><path d="M9 5.5h6M9 7h6"/></svg>',
  route:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-4 3-5 6-5s6-1 6-5"/><circle cx="4" cy="20" r="2"/><circle cx="16" cy="6" r="2"/><path d="M20 10h-2M20 14h-5"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><path d="M9.2 12l2 2 3.6-3.8"/></svg>',
};

const tagClass = (category) => (category === 'coperture' ? ' blue' : '');

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
    case 'p':
      return `        <p>${block.html}</p>`;
    case 'quote':
      return `        <blockquote class="pull-quote">${block.html}</blockquote>`;
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
      if (!post.inlineImage) return '';
      const L = post[lang];
      return [
        '        <figure class="article-inline-figure">',
        `          <img src="${img(post.inlineImage, 1200)}" alt="${L.inlineAlt || ''}" loading="lazy" decoding="async">`,
        `          <figcaption>${L.inlineCaption || ''}</figcaption>`,
        '        </figure>',
      ].join('\n');
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
      `      <img src="${img(post.image, 1200)}" alt="${L.imageAlt}" loading="lazy" decoding="async">`,
      `      <span class="post-tag${cls} post-media-tag">${L.tag}</span>`,
      '    </div>',
      '    <div class="post-featured-body">',
      '      <div class="post-meta">',
      `        <span class="post-date">${L.dateLabel} &middot; ${L.readLabel}</span>`,
      '      </div>',
      `      <h2 class="post-title">${L.title}</h2>`,
      `      <p class="post-excerpt">${L.excerpt}</p>`,
      `      <span class="post-read">${t.readMore}</span>`,
      '    </div>',
      '  </a>',
    ].join('\n');
  }

  return [
    `      <a href="${url}" class="post-card" data-category="${post.category}">`,
    '        <div class="post-card-media">',
    `          <img src="${img(post.image, 800)}" alt="${L.imageAlt}" loading="lazy" decoding="async">`,
    `          <span class="post-tag${cls} post-media-tag">${L.tag}</span>`,
    '        </div>',
    '        <div class="post-card-body">',
    `          <div class="post-meta"><span class="post-date">${L.dateLabel}</span></div>`,
    `          <h3 class="post-title">${L.title}</h3>`,
    `          <p class="post-excerpt">${L.excerpt}</p>`,
    `          <span class="post-read">${t.readMore}</span>`,
    '        </div>',
    '      </a>',
  ].join('\n');
}

// ── pages ────────────────────────────────────────────────────────────────────
export function renderIndex(template, posts, lang) {
  const live = posts.filter((p) => p.published !== false);
  const rest = live.slice(1);
  let cards = renderCard(live[0], lang, { featured: true });
  if (rest.length === 1) {
    cards += '\n\n' + renderCard(rest[0], lang, { featured: true, reverse: true });
  } else if (rest.length > 1) {
    cards += '\n\n    <div class="post-grid" id="postGrid">\n'
      + rest.map((p) => renderCard(p, lang)).join('\n') + '\n    </div>';
  }
  const altHref = lang === 'it' ? 'services/en/blog' : '../../blog';
  return template.replace('{{CARDS}}', cards).replace(/\{\{ALT_HREF\}\}/g, altHref);
}

export function renderArticle(template, post, posts, lang) {
  const L = post[lang];
  const t = T[lang];
  const other = posts.filter((p) => p.id !== post.id && p.published !== false)[0];
  const root = LAYOUT[lang].rootFromArticle;

  const heroFigure = [
    '<figure class="article-figure">',
    `  <img src="${img(post.image, 1600)}" alt="${L.imageAlt}" loading="eager" decoding="async">`,
    post.imageCaption ? `  <figcaption>${post.imageCaption}</figcaption>` : null,
    '</figure>',
  ].filter(Boolean).join('\n');

  const altSlug = lang === 'it' ? post.en.slug : post.it.slug;
  const altHref = lang === 'it' ? `${root}services/en/blog/${altSlug}` : `${root}blog/${altSlug}`;
  const blogHome = lang === 'it' ? `${root}blog` : `${root}services/en/blog`;
  const plainTitle = L.title.replace(/&mdash;/g, '-');

  return template
    .replace('{{TITLE}}', `${plainTitle} &mdash; NRG Energia`)
    .replace('{{META_DESCRIPTION}}', L.metaDescription)
    .replace(/\{\{ALT_HREF\}\}/g, altHref)
    .replace(/\{\{TAG_CLASS\}\}/g, tagClass(post.category))
    .replace(/\{\{TAG\}\}/g, L.tag)
    .replace('{{TITLE_HTML}}', L.title)
    .replace('{{DATE}}', L.dateLabel)
    .replace('{{READ}}', L.readLabel)
    .replace('{{HERO_FIGURE}}', heroFigure)
    .replace('{{BODY}}', renderBody(post, lang))
    .replace('{{ASIDE}}', renderAside(post, lang))
    .replace('{{BLOG_HOME}}', blogHome)
    .replace('{{RELATED_CARD}}', other ? renderCard(other, lang, { from: 'article' }) : '');
}
