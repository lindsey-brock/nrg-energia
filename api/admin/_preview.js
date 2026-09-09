// Renders one post exactly as the site would, without saving it.
//
// Uses the same scripts/render.mjs and the same template as the published
// page, so what the editor shows is what deploying would produce — including
// unsaved edits, and including drafts that have no page yet.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireSession } from './_auth.js';
import { readTextFile } from './_store.js';
import { renderArticle } from '../../scripts/render.mjs';

const TPL = (n) => join(process.cwd(), 'scripts', 'templates', n);

export default requireSession(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  const draft = req.body?.post;
  const lang = req.body?.lang === 'en' ? 'en' : 'it';
  if (!draft?.[lang]) return res.status(400).json({ error: 'Manca il contenuto da mostrare' });

  // siblings drive the "other articles" links; keep the saved order and swap
  // the edited post in place rather than pushing it to the front
  let siblings = [];
  try { siblings = JSON.parse(await readTextFile('content/posts.json')).posts || []; } catch { /* none yet */ }
  const posts = siblings.some((p) => p.id === draft.id)
    ? siblings.map((p) => (p.id === draft.id ? draft : p))
    : [draft, ...siblings];

  try {
    const tpl = await readFile(TPL(`article.${lang}.html`), 'utf8');
    return res.status(200).json({ html: renderArticle(tpl, draft, posts, lang) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
