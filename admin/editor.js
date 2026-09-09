import { ICONS, ICON_ORDER, ICON_LABELS } from '../scripts/icons.mjs';

// Canvas editor for blog posts.
//
// Renders the article body with the site's own CSS and makes it editable in
// place: click text and type, drag blocks to reorder, drop an image anywhere to
// upload it. Blocks map one-to-one onto content/posts.json, so what you edit is
// the same structure the page generator consumes.

const BLOCK_LABELS = {
  it: { p: 'Paragrafo', quote: 'Citazione', rates: 'Percentuali', icons: 'Elenco con icone',
        figure: 'Immagine', callout: 'Box informativo', heading: 'Sottotitolo', video: 'Video' },
  en: { p: 'Paragraph', quote: 'Quote', rates: 'Rate cards', icons: 'Icon list',
        figure: 'Image', callout: 'Callout box', heading: 'Sub-heading', video: 'Video' },
};


function toEmbed(raw = '') {
  const url = String(raw).trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return '';
}

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

  // Blocks are stored per language, and "Genera versione inglese" pairs them by
  // index — so structural edits have to happen on both sides or translation
  // starts writing into the wrong block.
  const otherData = () => post[lang === 'it' ? 'en' : 'it'];
  const mirrorOf = (section) => {
    const i = langData.sections.indexOf(section);
    return i < 0 ? null : otherData()?.sections?.[i] ?? null;
  };

  function insertBlock(section, index, block) {
    const at = index === null || index < 0 ? section.blocks.length : index;
    section.blocks.splice(at, 0, block);
    const m = mirrorOf(section);
    if (m) m.blocks.splice(Math.min(at, m.blocks.length), 0, structuredClone(block));
  }
  function removeBlock(section, block) {
    const i = section.blocks.indexOf(block);
    if (i < 0) return;
    section.blocks.splice(i, 1);
    const m = mirrorOf(section);
    if (m && m.blocks[i]) m.blocks.splice(i, 1);
  }
  function moveBlock(section, from, to) {
    const [moved] = section.blocks.splice(from, 1);
    section.blocks.splice(to, 0, moved);
    const m = mirrorOf(section);
    if (m && m.blocks[from]) {
      const [mm] = m.blocks.splice(from, 1);
      m.blocks.splice(Math.min(to, m.blocks.length), 0, mm);
    }
  }
  /** An image belongs to the post, not to one language: set it on both sides. */
  function setBlockImage(section, block, publicId) {
    block.image = publicId;
    const m = mirrorOf(section);
    const i = section.blocks.indexOf(block);
    if (m && m.blocks[i]?.type === 'figure') m.blocks[i].image = publicId;
  }

  // ── persistent formatting toolbar ─────────────────────────────────────────
  // Pinned above the canvas rather than floating on selection, so the controls
  // are always in the same place. execCommand is deprecated but remains the
  // only thing that reliably edits a contenteditable selection.
  let activeEditable = null;

  function normalise(node) {
    // Chrome emits <b>/<i>; the site styles <strong>/<em>
    node.querySelectorAll('b').forEach((el) => el.replaceWith(h('strong', { html: el.innerHTML })));
    node.querySelectorAll('i').forEach((el) => el.replaceWith(h('em', { html: el.innerHTML })));
    node.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
    node.querySelectorAll('a').forEach((el) => {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    });
  }

  const TOOLS = {
    it: { style: 'Stile', para: 'Paragrafo', h3: 'Sottotitolo H3', h4: 'Sottotitolo H4', quote: 'Citazione',
          bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato',
          link: 'Inserisci link', unlink: 'Rimuovi link', ul: 'Elenco puntato', ol: 'Elenco numerato',
          clear: 'Togli formattazione', insert: 'Inserisci', hint: 'Seleziona del testo per formattarlo' },
    en: { style: 'Style', para: 'Paragraph', h3: 'Heading H3', h4: 'Heading H4', quote: 'Quote',
          bold: 'Bold', italic: 'Italic', underline: 'Underline',
          link: 'Insert link', unlink: 'Remove link', ul: 'Bulleted list', ol: 'Numbered list',
          clear: 'Clear formatting', insert: 'Insert', hint: 'Select text to format it' },
  };

  /** The block wrapper holding the current selection, if any. */
  function activeBlockEl() {
    return activeEditable?.closest?.('.blk') || null;
  }

  function buildToolbar() {
    const t = TOOLS[lang];
    const bar = h('div', { class: 'fmt-toolbar' });

    const apply = (fn) => (e) => {
      e.preventDefault();
      if (!activeEditable) return;
      fn();
      normalise(activeEditable);
      activeEditable.dispatchEvent(new Event('input', { bubbles: true }));
      syncState();
    };
    const cmd = (name, arg) => apply(() => document.execCommand(name, false, arg));

    // ── style dropdown: converts the block the cursor is in ──────────────────
    const style = h('select', { class: 'fmt-style', title: t.style });
    for (const [v, label] of [['p', t.para], ['h3', t.h3], ['h4', t.h4], ['quote', t.quote]]) {
      style.append(h('option', { value: v }, [label]));
    }
    style.addEventListener('change', () => {
      const el = activeBlockEl();
      if (!el?._block) { syncState(); return; }
      const block = el._block;
      const v = style.value;
      const html = block.html ?? '';
      if (v === 'p') { block.type = 'p'; delete block.level; }
      else if (v === 'quote') { block.type = 'quote'; delete block.level; }
      else { block.type = 'heading'; block.level = v === 'h3' ? 3 : 4; }
      block.html = html;
      touch(); paint();
    });

    const btn = (label, title, onDown, cls = '', data = null) => h('button', {
      class: `fmt-btn ${cls}`, title, ...(data ? { 'data-cmd': data } : {}), onmousedown: onDown,
    }, [label]);

    // ── insert menu, mirroring the "+" between blocks ────────────────────────
    const insertWrap = h('div', { class: 'fmt-insert' });
    const insertBtn = h('button', { class: 'fmt-btn wide', title: t.insert }, [`+ ${t.insert}`]);
    insertWrap.append(insertBtn);
    insertBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (insertWrap.querySelector('.add-menu')) { closeMenu(); return; }
      closeMenu();
      const el = activeBlockEl();
      const section = el?._section || langData.sections[langData.sections.length - 1];
      const at = el ? section.blocks.indexOf(el._block) + 1 : null;
      const menu = buildInsertMenu(section, at);
      insertWrap.append(menu);
      openMenu = menu;
    });

    bar.append(
      style,
      h('span', { class: 'fmt-sep' }),
      btn('B', t.bold, cmd('bold'), 'bold', 'bold'),
      btn('I', t.italic, cmd('italic'), 'ital', 'italic'),
      btn('U', t.underline, cmd('underline'), 'under', 'underline'),
      h('span', { class: 'fmt-sep' }),
      btn('🔗', t.link, apply(() => {
        const url = prompt(t.link, 'https://');
        if (url) document.execCommand('createLink', false, url);
      })),
      btn('⌦', t.unlink, cmd('unlink')),
      h('span', { class: 'fmt-sep' }),
      btn('• —', t.ul, cmd('insertUnorderedList'), '', 'insertUnorderedList'),
      btn('1. —', t.ol, cmd('insertOrderedList'), '', 'insertOrderedList'),
      h('span', { class: 'fmt-sep' }),
      btn('⌫', t.clear, cmd('removeFormat')),
      h('span', { class: 'fmt-sep' }),
      insertWrap,
      h('span', { class: 'fmt-hint' }, [t.hint]),
    );

    function syncState() {
      for (const b of bar.querySelectorAll('.fmt-btn[data-cmd]')) {
        let on = false;
        try { on = document.queryCommandState(b.dataset.cmd); } catch { /* ignore */ }
        b.classList.toggle('on', on);
      }
      const el = activeBlockEl();
      const block = el?._block;
      style.value = !block ? 'p'
        : block.type === 'quote' ? 'quote'
        : block.type === 'heading' ? (Number(block.level) === 4 ? 'h4' : 'h3')
        : 'p';
      // the style dropdown only means something for text blocks
      const textual = !block || ['p', 'quote', 'heading'].includes(block.type);
      style.disabled = !textual;
      bar.classList.toggle('armed', Boolean(activeEditable));
    }

    function editableFromSelection() {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode) return null;
      const start = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const host = start?.closest?.('[contenteditable="true"]');
      return host && root.contains(host) ? host : null;
    }

    // focusin bubbles, unlike focus, and covers clicking straight into a block
    root.addEventListener('focusin', (e) => {
      const host = e.target.closest?.('[contenteditable="true"]');
      if (host) { activeEditable = host; syncState(); }
    });

    document.addEventListener('selectionchange', () => {
      const host = editableFromSelection();
      if (host) activeEditable = host;
      else if (activeEditable && !root.contains(activeEditable)) activeEditable = null;
      syncState();
    });

    syncState();
    return bar;
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
    return n;
  }

  // ── block selection ───────────────────────────────────────────────────────
  // A selected block can be removed with Backspace or Delete. The key handler
  // ignores everything typed inside text, so editing never deletes a block.
  let selected = null;

  function selectBlock(el) {
    if (selected === el) return;
    clearSelection();
    selected = el;
    el.classList.add('selected');
  }
  function clearSelection() {
    selected?.classList.remove('selected');
    selected = null;
    closeBlockMenu();
  }

  let blockMenu = null;
  function closeBlockMenu() { blockMenu?.remove(); blockMenu = null; }

  function openBlockMenu(el, section, block, x, y) {
    closeBlockMenu();
    const menu = h('div', { class: 'blk-menu' }, [
      h('button', {
        class: 'blk-menu-item danger',
        onclick: () => { closeBlockMenu(); clearSelection(); removeBlock(section, block); touch(); paint(); },
      }, [lang === 'it' ? 'Elimina elemento' : 'Delete element']),
      h('button', {
        class: 'blk-menu-item',
        onclick: () => {
          closeBlockMenu();
          insertBlock(section, section.blocks.indexOf(block) + 1, structuredClone(block));
          touch(); paint();
        },
      }, [lang === 'it' ? 'Duplica' : 'Duplicate']),
    ]);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    el.append(menu);
    blockMenu = menu;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSelection(); return; }
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (!selected || !root.contains(selected)) return;
    // never intercept a keystroke meant for text
    const a = document.activeElement;
    if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    e.preventDefault();
    const el = selected;
    clearSelection();
    removeBlock(el._section, el._block);
    touch(); paint();
  });

  // clicking outside the canvas drops the selection
  document.addEventListener('mousedown', (e) => {
    if (selected && !e.target.closest('.blk')) clearSelection();
  });

  // ── one block ─────────────────────────────────────────────────────────────
  function renderBlock(block, section, index) {
    const wrap = h('div', { class: 'blk', draggable: 'true', 'data-index': index });
    wrap._block = block; wrap._section = section;   // the toolbar reads these

    wrap.append(h('div', {
      class: 'blk-handle',
      title: lang === 'it' ? 'Trascina per riordinare, clicca per selezionare' : 'Drag to reorder, click to select',
      onmousedown: (e) => { e.stopPropagation(); selectBlock(wrap); },
    }, ['⠿']));

    // clicking the block's own chrome selects it; clicking its text does not
    wrap.addEventListener('mousedown', (e) => {
      if (e.target.closest('[contenteditable], input, select, button')) { clearSelection(); return; }
      selectBlock(wrap);
    });
    wrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('[contenteditable], input, select, button')) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      selectBlock(wrap);
      openBlockMenu(wrap, section, block, e.clientX - r.left, e.clientY - r.top);
    });
    wrap.append(h('div', { class: 'blk-kind' }, [L[block.type] || block.type]));
    wrap.append(h('button', {
      class: 'blk-del', title: 'Elimina blocco',
      onclick: () => {
        removeBlock(section, block);
        touch(); paint();
      },
    }, ['×']));

    let body;
    switch (block.type) {
      case 'p': {
        // a list can't live inside <p>, so switch the host element once it is one
        const isList = /^<(ul|ol)[\s>]/i.test((block.html || '').trim());
        body = editable(isList ? 'div' : 'p', block.html, (v) => {
          const wasList = isList;
          block.html = v;
          // repaint when it crosses between paragraph and list so the host matches
          if (/^<(ul|ol)[\s>]/i.test(v.trim()) !== wasList) { touch(); paint(); }
        }, isList ? 'rich-list' : '');
        break;
      }
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
        block.items.forEach((item, ii) => {
          const swatch = h('button', {
            class: 'icon-pick', title: lang === 'it' ? 'Cambia icona' : 'Change icon',
            onclick: (e) => { e.stopPropagation(); openIconMenu(swatch, section, block, ii); },
          }, [
            h('span', { class: 'icon-slot', html: ICONS[item.icon] || '' }),
            h('span', { class: 'icon-caret' }, ['⌄']),
          ]);
          const card = h('div', { class: 'icon-card' }, [
            swatch,
            editable('span', item.label, (v) => { item.label = v; }),
          ]);
          if (block.items.length > 1) {
            card.append(h('button', {
              class: 'icon-remove', title: lang === 'it' ? 'Rimuovi voce' : 'Remove item',
              onclick: () => {
                block.items.splice(ii, 1);
                const m = mirrorOf(section);
                const bi = section.blocks.indexOf(block);
                m?.blocks[bi]?.items?.splice(ii, 1);
                touch(); paint();
              },
            }, ['×']));
          }
          body.append(card);
        });
        body.append(h('button', {
          class: 'icon-add',
          onclick: () => {
            const fresh = { icon: 'check', label: '' };
            block.items.push(fresh);
            const m = mirrorOf(section);
            const bi = section.blocks.indexOf(block);
            m?.blocks[bi]?.items?.push(structuredClone(fresh));
            touch(); paint();
          },
        }, [lang === 'it' ? '+ Voce' : '+ Item']));
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
      case 'video': {
        const src = toEmbed(block.url || '');
        body = h('figure', { class: 'article-video' }, [
          h('div', { class: 'frame' }, [
            src ? h('iframe', { src, allowfullscreen: true, loading: 'lazy' })
                : h('div', { class: 'img-empty' }, [lang === 'it' ? 'Incolla un link YouTube o Vimeo' : 'Paste a YouTube or Vimeo link']),
          ]),
          (() => {
            const input = h('input', { class: 'video-url', type: 'url', placeholder: 'https://youtube.com/watch?v=…' });
            input.value = block.url || '';
            input.addEventListener('change', () => { block.url = input.value; touch(); paint(); });
            return input;
          })(),
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
        const id = block.image || post.inlineImage;
        if (block.caption === undefined && langData.inlineCaption) block.caption = langData.inlineCaption;
        body = h('figure', { class: 'article-inline-figure' }, [
          id ? h('img', { src: cloudinary(id, 900), alt: '' })
             : h('div', { class: 'img-empty' }, [lang === 'it' ? 'Trascina un’immagine qui' : 'Drag an image here']),
          editable('figcaption', block.caption ?? '', (v) => { block.caption = v; }),
        ]);
        body.append(h('button', {
          class: 'pick-btn',
          onclick: () => openLibrary((publicId) => { setBlockImage(section, block, publicId); touch(); paint(); }),
        }, [lang === 'it' ? 'Scegli dalla libreria' : 'Choose from library']));
        body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drop'); });
        body.addEventListener('dragleave', () => body.classList.remove('drop'));
        body.addEventListener('drop', async (e) => {
          e.preventDefault(); e.stopPropagation();
          body.classList.remove('drop');
          const file = e.dataTransfer.files[0];
          if (file) await handleDrop(file, (publicId) => { setBlockImage(section, block, publicId); paint(); });
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
      moveBlock(section, from, index);
      touch(); paint();
    });

    return wrap;
  }

  // ── upload plumbing (used by figures and by the gaps between blocks) ──────
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

  // ── icon picker ───────────────────────────────────────────────────────────
  let iconMenu = null;
  function closeIconMenu() { iconMenu?.remove(); iconMenu = null; }
  document.addEventListener('click', (e) => {
    if (iconMenu && !iconMenu.contains(e.target) && !e.target.closest('.icon-pick')) closeIconMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeIconMenu(); });

  function openIconMenu(anchor, section, block, itemIndex) {
    if (iconMenu?.dataset.owner === `${section.id}-${itemIndex}`) { closeIconMenu(); return; }
    closeIconMenu();
    const menu = h('div', { class: 'icon-menu' });
    menu.dataset.owner = `${section.id}-${itemIndex}`;
    const current = block.items[itemIndex].icon;
    for (const key of ICON_ORDER) {
      menu.append(h('button', {
        class: `icon-opt${key === current ? ' on' : ''}`,
        title: ICON_LABELS[lang][key] || key,
        onclick: () => {
          block.items[itemIndex].icon = key;
          // the icon is structural, so it applies to both languages
          const m = mirrorOf(section);
          const bi = section.blocks.indexOf(block);
          const twin = m?.blocks[bi]?.items?.[itemIndex];
          if (twin) twin.icon = key;
          closeIconMenu(); touch(); paint();
        },
      }, [h('span', { html: ICONS[key] })]));
    }
    anchor.append(menu);
    iconMenu = menu;
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
  const BLOCK_ORDER = ['p', 'heading', 'quote', 'callout', 'rates', 'icons', 'figure', 'video'];

  const PREVIEW = {
    p:       '<span class="pv-line w90"></span><span class="pv-line w100"></span><span class="pv-line w70"></span>',
    heading: '<span class="pv-line pv-head w60"></span><span class="pv-line w90"></span>',
    quote:   '<span class="pv-quote"><span class="pv-line w80"></span><span class="pv-line w60"></span></span>',
    callout: '<span class="pv-callout"><i></i><span class="pv-line w70"></span></span>',
    rates:   '<span class="pv-rates"><b>50%</b><b class="alt">36%</b></span>',
    icons:   '<span class="pv-icons"><i></i><i></i><i></i><i></i></span>',
    figure:  '<span class="pv-img"></span>',
    video:   '<span class="pv-img pv-video"><b>&#9654;</b></span>',
  };

  const HINT = {
    it: { p: 'Testo normale', heading: 'Titolo di terzo livello', quote: 'Frase in evidenza',
          callout: 'Riquadro verde', rates: 'Due percentuali affiancate',
          icons: 'Quattro voci con icona', figure: 'Foto a tutta larghezza', video: 'YouTube o Vimeo' },
    en: { p: 'Body text', heading: 'Third-level heading', quote: 'Pulled-out sentence',
          callout: 'Green highlight box', rates: 'Two figures side by side',
          icons: 'Four items with icons', figure: 'Full-width photo', video: 'YouTube or Vimeo' },
  };

  function makeBlock(type) {
    if (type === 'p' || type === 'quote' || type === 'callout') return { type, html: '' };
    if (type === 'video') return { type, url: '' };
    if (type === 'heading') return { type, level: 3, html: '' };
    if (type === 'rates') return { type, items: [{ value: '50%', label: '' }, { value: '36%', label: '', variant: 'alt' }] };
    if (type === 'icons') return { type, items: [{ icon: 'panel', label: '' }, { icon: 'shield', label: '' }] };
    return { type: 'figure', position: 'inline' };
  }

  let openMenu = null;
  function closeMenu() { openMenu?.remove(); openMenu = null; }
  document.addEventListener('click', (e) => {
    // both openers must be excluded, or the click that follows their own
    // mousedown closes the menu again before anything can be picked
    if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.add-trigger, .fmt-insert')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function adder(section, atIndex = null) {
    const trigger = h('button', { class: 'add-trigger', title: lang === 'it' ? 'Aggiungi elemento' : 'Add element' }, ['+']);
    const wrap = h('div', { class: 'add-wrap' }, [trigger]);

    // dropping a photo into the gap inserts an image block right there
    wrap.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
      wrap.classList.add('drop-here');
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-here'));
    wrap.addEventListener('drop', async (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); e.stopPropagation();
      wrap.classList.remove('drop-here');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      await handleDrop(file, (publicId) => {
        const block = makeBlock('figure');
        block.image = publicId;
        insertBlock(section, atIndex, block);
        paint();
      });
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openMenu?.dataset.owner === String(atIndex) && openMenu.parentElement === wrap) { closeMenu(); return; }
      closeMenu();
      const menu = buildInsertMenu(section, atIndex);
      wrap.append(menu);
      openMenu = menu;
    });
    return wrap;
  }

  /** The element picker, shared by the toolbar and the "+" between blocks. */
  function buildInsertMenu(section, atIndex) {
    const menu = h('div', { class: 'add-menu' });
    menu.dataset.owner = String(atIndex);
    menu.append(h('div', { class: 'add-menu-title' }, [lang === 'it' ? 'Aggiungi elemento' : 'Add element']));
    const grid = h('div', { class: 'add-grid' });
    for (const type of BLOCK_ORDER) {
      grid.append(h('button', {
        class: 'add-card',
        onmousedown: (e) => e.preventDefault(),   // keep the caret where it is
        onclick: () => {
          insertBlock(section, atIndex, makeBlock(type));
          closeMenu(); touch(); paint();
        },
      }, [
        h('span', { class: 'pv', html: PREVIEW[type] }),
        h('span', { class: 'add-card-name' }, [L[type]]),
        h('span', { class: 'add-card-hint' }, [HINT[lang][type]]),
      ]));
    }
    menu.append(grid);
    return menu;
  }

  // ── full paint ────────────────────────────────────────────────────────────
  function paint() {
    selected = null; blockMenu = null;
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
    root.append(post.image
      ? h('img', { class: 'hero-thumb', src: cloudinary(post.image, 900), alt: '' })
      : h('div', { class: 'hero-thumb hero-empty' }, [
          h('span', { class: 'hero-empty-icon', html:
            '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-4.5 4.5L9 13l-6 6"/></svg>' }),
          h('span', {}, [lang === 'it'
            ? 'Trascina un’immagine qui, o scegline una dalla libreria'
            : 'Drag an image here, or pick one from the library']),
        ]));

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
            const m = otherData()?.sections;
            langData.sections.splice(si, 1);
            if (m && m[si]) m.splice(si, 1);
            touch(); paint();
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
        const fresh = {
          id: `sezione-${langData.sections.length + 1}`,
          heading: lang === 'it' ? 'Nuova sezione' : 'New section',
          blocks: [{ type: 'p', html: '' }],
        };
        langData.sections.push(fresh);
        otherData()?.sections?.push(structuredClone(fresh));
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
  return { el: root, toolbar: buildToolbar(), repaint: paint };
}
