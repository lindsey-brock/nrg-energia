// Canvas editor for blog posts.
//
// Renders the article body with the site's own CSS and makes it editable in
// place: click text and type, drag blocks to reorder, drop an image anywhere to
// upload it. Blocks map one-to-one onto content/posts.json, so what you edit is
// the same structure the page generator consumes.

const BLOCK_LABELS = {
  it: { p: 'Paragrafo', quote: 'Citazione', rates: 'Percentuali', icons: 'Elenco con icone',
        figure: 'Immagine', callout: 'Box informativo', heading: 'Sottotitolo' },
  en: { p: 'Paragraph', quote: 'Quote', rates: 'Rate cards', icons: 'Icon list',
        figure: 'Image', callout: 'Callout box', heading: 'Sub-heading' },
};

const ICON_SVG = {
  panel:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M3 8.3h18M3 12.7h18M9 4v13M15 4v13M12 17v3M9 20h6"/></svg>',
  fixing: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l-2 2v9l-1 3-1-3V9L9 7z"/><path d="M9 5.5h6M9 7h6"/></svg>',
  route:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c0-4 3-5 6-5s6-1 6-5"/><circle cx="4" cy="20" r="2"/><circle cx="16" cy="6" r="2"/><path d="M20 10h-2M20 14h-5"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><path d="M9.2 12l2 2 3.6-3.8"/></svg>',
};

const cloudinary = (id, w = 1200) =>
  id ? `https://res.cloudinary.com/dmegrbq5k/image/upload/q_auto,f_auto,w_${w}/${id}` : '';

const h = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c) n.append(c);
  return n;
};

/**
 * @param {object} opts
 * @param {object} opts.lang         'it' | 'en'
 * @param {object} opts.langData     post[lang] — mutated in place as the user types
 * @param {object} opts.post         the whole post (for shared image ids)
 * @param {function} opts.onDirty    called whenever content changes
 * @param {function} opts.uploadImage async (File) => cloudinary public id
 */
export function createCanvas({ lang, langData, post, onDirty, uploadImage }) {
  const L = BLOCK_LABELS[lang];
  const root = h('div', { class: 'canvas' });
  const touch = () => onDirty && onDirty();

  // ── inline formatting toolbar ─────────────────────────────────────────────
  // Appears over a text selection inside the canvas. execCommand is deprecated
  // but remains the only thing that reliably edits a contenteditable selection.
  let bar = null;
  function hideBar() { bar?.remove(); bar = null; }

  function normalise(node) {
    // Chrome emits <b>/<i>; the site styles <strong>/<em>
    node.querySelectorAll('b').forEach((el) => el.replaceWith(h('strong', { html: el.innerHTML })));
    node.querySelectorAll('i').forEach((el) => el.replaceWith(h('em', { html: el.innerHTML })));
    node.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  }

  function showBar(host) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !host.contains(sel.anchorNode)) { hideBar(); return; }
    hideBar();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const cmd = (name, arg) => (e) => {
      e.preventDefault();
      document.execCommand(name, false, arg);
      normalise(host);
      host.dispatchEvent(new Event('input', { bubbles: true }));
    };
    bar = h('div', { class: 'fmt-bar' }, [
      h('button', { title: 'Grassetto', onmousedown: cmd('bold') }, ['B']),
      h('button', { class: 'ital', title: 'Corsivo', onmousedown: cmd('italic') }, ['I']),
      h('button', {
        title: 'Link',
        onmousedown: (e) => {
          e.preventDefault();
          const url = prompt(lang === 'it' ? 'Indirizzo del link' : 'Link address', 'https://');
          if (url) cmd('createLink', url)(e);
        },
      }, ['🔗']),
      h('button', { title: lang === 'it' ? 'Togli formattazione' : 'Clear', onmousedown: cmd('removeFormat') }, ['⌫']),
    ]);
    document.body.append(bar);
    bar.style.top = `${window.scrollY + rect.top - bar.offsetHeight - 8}px`;
    bar.style.left = `${window.scrollX + rect.left + rect.width / 2 - bar.offsetWidth / 2}px`;
  }

  // ── inline editable ───────────────────────────────────────────────────────
  function editable(tag, html, onChange, cls = '') {
    const n = h(tag, { class: cls, contenteditable: 'true', spellcheck: 'false', html: html || '' });
    n.addEventListener('input', () => { onChange(n.innerHTML.trim()); touch(); });
    // keep pasted content as plain text so stray markup can't leak in
    n.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    n.addEventListener('mouseup', () => setTimeout(() => showBar(n), 0));
    n.addEventListener('keyup', (e) => { if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight') showBar(n); });
    n.addEventListener('blur', () => setTimeout(hideBar, 150));
    return n;
  }

  // ── one block ─────────────────────────────────────────────────────────────
  function renderBlock(block, section, index) {
    const wrap = h('div', { class: 'blk', draggable: 'true', 'data-index': index });

    wrap.append(h('div', { class: 'blk-handle', title: 'Trascina per riordinare' }, ['⠿']));
    wrap.append(h('div', { class: 'blk-kind' }, [L[block.type] || block.type]));
    wrap.append(h('button', {
      class: 'blk-del', title: 'Elimina blocco',
      onclick: () => {
        section.blocks.splice(section.blocks.indexOf(block), 1);
        touch(); paint();
      },
    }, ['×']));

    let body;
    switch (block.type) {
      case 'p':
        body = editable('p', block.html, (v) => { block.html = v; });
        break;
      case 'quote':
        body = editable('blockquote', block.html, (v) => { block.html = v; }, 'pull-quote');
        break;
      case 'rates': {
        body = h('div', { class: 'rate-grid' });
        block.items.forEach((item) => {
          body.append(h('div', { class: `rate-card${item.variant === 'alt' ? ' alt' : ''}` }, [
            editable('div', item.value, (v) => { item.value = v; }, 'rate-num'),
            editable('div', item.label, (v) => { item.label = v; }, 'rate-label'),
          ]));
        });
        break;
      }
      case 'icons': {
        body = h('div', { class: 'icon-grid' });
        block.items.forEach((item) => {
          body.append(h('div', { class: 'icon-card' }, [
            h('span', { class: 'icon-slot', html: ICON_SVG[item.icon] || '' }),
            editable('span', item.label, (v) => { item.label = v; }),
          ]));
        });
        break;
      }
      case 'heading': {
        const level = [3, 4].includes(Number(block.level)) ? Number(block.level) : 3;
        body = h('div', { class: 'heading-row' }, [
          editable(`h${level}`, block.html, (v) => { block.html = v; }),
          h('select', {
            class: 'level-pick', title: 'Livello',
            onchange: (e) => { block.level = Number(e.target.value); touch(); paint(); },
          }, [3, 4].map((n) => h('option', { value: n, selected: n === level }, [`H${n}`]))),
        ]);
        break;
      }
      case 'callout':
        body = h('div', { class: 'callout' }, [
          h('div', { class: 'callout-icon' }, [block.icon || 'i']),
          editable('p', block.html, (v) => { block.html = v; }),
        ]);
        break;
      case 'figure': {
        const id = post.inlineImage;
        body = h('figure', { class: 'article-inline-figure' }, [
          id ? h('img', { src: cloudinary(id, 900), alt: '' })
             : h('div', { class: 'img-empty' }, ['Trascina un’immagine qui']),
          editable('figcaption', langData.inlineCaption, (v) => { langData.inlineCaption = v; }),
        ]);
        body.append(h('button', {
          class: 'pick-btn',
          onclick: () => openLibrary((publicId) => { post.inlineImage = publicId; touch(); paint(); }),
        }, ['Scegli dalla libreria']));
        body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drop'); });
        body.addEventListener('dragleave', () => body.classList.remove('drop'));
        body.addEventListener('drop', async (e) => {
          e.preventDefault(); e.stopPropagation();
          body.classList.remove('drop');
          const file = e.dataTransfer.files[0];
          if (file) await handleDrop(file, (publicId) => { post.inlineImage = publicId; paint(); });
        });
        break;
      }
      default:
        body = h('div', { class: 'blk-unknown' }, [`Blocco "${block.type}" — modificabile solo nel JSON`]);
    }
    wrap.append(body);

    // drag to reorder
    wrap.addEventListener('dragstart', (e) => {
      if (e.target !== wrap) return;         // ignore drags starting inside text
      e.dataTransfer.setData('text/plain', String(index));
      wrap.classList.add('dragging');
    });
    wrap.addEventListener('dragend', () => wrap.classList.remove('dragging'));
    wrap.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); wrap.classList.add('over');
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('over'));
    wrap.addEventListener('drop', (e) => {
      if (e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); wrap.classList.remove('over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isNaN(from) || from === index) return;
      const [moved] = section.blocks.splice(from, 1);
      section.blocks.splice(index, 0, moved);
      touch(); paint();
    });

    return wrap;
  }

  // ── upload plumbing ───────────────────────────────────────────────────────
  let uploadNotice = null;
  async function handleDrop(file, apply) {
    if (!file.type.startsWith('image/')) return;
    setNotice('Caricamento immagine…', 'busy');
    try {
      const publicId = await uploadImage(file);
      apply(publicId);
      setNotice('Immagine caricata', 'ok');
      touch();
    } catch (err) {
      setNotice(err.message, 'err');
    }
  }
  function setNotice(text, kind) {
    if (!uploadNotice) return;
    uploadNotice.textContent = text;
    uploadNotice.className = `canvas-notice show ${kind}`;
    if (kind !== 'busy') setTimeout(() => uploadNotice.classList.remove('show'), 3500);
  }

  // ── media library ─────────────────────────────────────────────────────────
  async function openLibrary(pick) {
    const overlay = h('div', { class: 'lib-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
    const panel = h('div', { class: 'lib' }, [
      h('div', { class: 'lib-head' }, [
        h('strong', {}, ['Libreria immagini']),
        h('button', { class: 'lib-close', onclick: () => overlay.remove() }, ['×']),
      ]),
    ]);
    const grid = h('div', { class: 'lib-grid' }, [h('div', { class: 'lib-empty' }, ['Caricamento…'])]);
    panel.append(grid);
    overlay.append(panel);
    document.body.append(overlay);

    try {
      const r = await fetch('/api/admin/media?limit=60').then((x) => x.json());
      grid.innerHTML = '';
      if (!r.configured) {
        grid.append(h('div', { class: 'lib-empty' }, [
          `Libreria non disponibile: mancano ${r.missing.join(', ')}.`,
        ]));
        return;
      }
      if (!r.images.length) { grid.append(h('div', { class: 'lib-empty' }, ['Nessuna immagine.'])); return; }
      for (const im of r.images) {
        grid.append(h('button', {
          class: 'lib-item', title: im.publicId,
          onclick: () => { pick(im.id); overlay.remove(); },
        }, [h('img', { src: im.thumb, alt: '', loading: 'lazy' })]));
      }
    } catch (err) {
      grid.innerHTML = '';
      grid.append(h('div', { class: 'lib-empty' }, [err.message]));
    }
  }

  // ── add-block menu ────────────────────────────────────────────────────────
  // One "+" per section opens a menu that shows what each element looks like,
  // rather than a row of seven buttons repeated down the page.
  const BLOCK_ORDER = ['p', 'heading', 'quote', 'callout', 'rates', 'icons', 'figure'];

  const PREVIEW = {
    p:       '<span class="pv-line w90"></span><span class="pv-line w100"></span><span class="pv-line w70"></span>',
    heading: '<span class="pv-line pv-head w60"></span><span class="pv-line w90"></span>',
    quote:   '<span class="pv-quote"><span class="pv-line w80"></span><span class="pv-line w60"></span></span>',
    callout: '<span class="pv-callout"><i></i><span class="pv-line w70"></span></span>',
    rates:   '<span class="pv-rates"><b>50%</b><b class="alt">36%</b></span>',
    icons:   '<span class="pv-icons"><i></i><i></i><i></i><i></i></span>',
    figure:  '<span class="pv-img"></span>',
  };

  const HINT = {
    it: { p: 'Testo normale', heading: 'Titolo di terzo livello', quote: 'Frase in evidenza',
          callout: 'Riquadro verde', rates: 'Due percentuali affiancate',
          icons: 'Quattro voci con icona', figure: 'Foto a tutta larghezza' },
    en: { p: 'Body text', heading: 'Third-level heading', quote: 'Pulled-out sentence',
          callout: 'Green highlight box', rates: 'Two figures side by side',
          icons: 'Four items with icons', figure: 'Full-width photo' },
  };

  function makeBlock(type) {
    if (type === 'p' || type === 'quote' || type === 'callout') return { type, html: '' };
    if (type === 'heading') return { type, level: 3, html: '' };
    if (type === 'rates') return { type, items: [{ value: '50%', label: '' }, { value: '36%', label: '', variant: 'alt' }] };
    if (type === 'icons') return { type, items: [{ icon: 'panel', label: '' }, { icon: 'shield', label: '' }] };
    return { type: 'figure', position: 'inline' };
  }

  let openMenu = null;
  function closeMenu() { openMenu?.remove(); openMenu = null; }
  document.addEventListener('click', (e) => {
    if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.add-trigger')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function adder(section, atIndex = null) {
    const trigger = h('button', { class: 'add-trigger', title: lang === 'it' ? 'Aggiungi elemento' : 'Add element' }, ['+']);
    const wrap = h('div', { class: 'add-wrap' }, [trigger]);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openMenu?.dataset.owner === String(atIndex) && openMenu.parentElement === wrap) { closeMenu(); return; }
      closeMenu();
      const menu = h('div', { class: 'add-menu' });
      menu.dataset.owner = String(atIndex);
      menu.append(h('div', { class: 'add-menu-title' }, [lang === 'it' ? 'Aggiungi elemento' : 'Add element']));
      const grid = h('div', { class: 'add-grid' });
      for (const type of BLOCK_ORDER) {
        grid.append(h('button', {
          class: 'add-card',
          onclick: () => {
            const block = makeBlock(type);
            if (atIndex === null) section.blocks.push(block);
            else section.blocks.splice(atIndex, 0, block);
            closeMenu(); touch(); paint();
          },
        }, [
          h('span', { class: 'pv', html: PREVIEW[type] }),
          h('span', { class: 'add-card-name' }, [L[type]]),
          h('span', { class: 'add-card-hint' }, [HINT[lang][type]]),
        ]));
      }
      menu.append(grid);
      wrap.append(menu);
      openMenu = menu;
    });
    return wrap;
  }

  // ── full paint ────────────────────────────────────────────────────────────
  function paint() {
    root.innerHTML = '';
    uploadNotice = h('div', { class: 'canvas-notice' });
    root.append(uploadNotice);

    root.append(h('div', { class: 'hero-row' }, [
      h('div', { class: 'canvas-label', style: 'margin:0' }, ['Immagine di copertina']),
      h('button', {
        class: 'pick-btn',
        onclick: () => openLibrary((publicId) => { post.image = publicId; touch(); paint(); }),
      }, ['Scegli dalla libreria']),
    ]));
    root.append(h('img', { class: 'hero-thumb', src: cloudinary(post.image, 900), alt: '' }));

    root.append(h('div', { class: 'canvas-label', style: 'margin-top:22px' }, ['Occhiello']));
    root.append(editable('p', langData.lead, (v) => { langData.lead = v; }, 'lead'));

    langData.sections.forEach((section, si) => {
      const secEl = h('section', { class: 'sec' });
      secEl.append(h('div', { class: 'sec-bar' }, [
        h('span', { class: 'sec-num' }, [`Sezione ${si + 1}`]),
        h('button', {
          class: 'sec-del', title: 'Elimina sezione',
          onclick: () => {
            if (!confirm('Eliminare questa sezione e tutti i suoi blocchi?')) return;
            langData.sections.splice(si, 1); touch(); paint();
          },
        }, ['Elimina sezione']),
      ]));
      secEl.append(editable('h2', section.heading, (v) => { section.heading = v; }));
      section.blocks.forEach((b, bi) => {
        secEl.append(adder(section, bi));
        secEl.append(renderBlock(b, section, bi));
      });
      secEl.append(adder(section));
      root.append(secEl);
    });

    root.append(h('button', {
      class: 'add-section',
      onclick: () => {
        langData.sections.push({
          id: `sezione-${langData.sections.length + 1}`,
          heading: 'Nuova sezione',
          blocks: [{ type: 'p', html: '' }],
        });
        touch(); paint();
      },
    }, ['+ Aggiungi sezione']));
  }

  // dropping an image on empty canvas space replaces the hero image
  root.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); root.classList.add('drop-hero'); }
  });
  root.addEventListener('dragleave', () => root.classList.remove('drop-hero'));
  root.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); root.classList.remove('drop-hero');
    const file = e.dataTransfer.files[0];
    if (file) await handleDrop(file, (publicId) => { post.image = publicId; });
  });

  paint();
  return { el: root, repaint: paint };
}
