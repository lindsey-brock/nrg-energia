// GET  /api/admin/content?type=posts|portfolio   -> the JSON content file
// PUT  /api/admin/content?type=posts|portfolio   -> save it (and rebuild pages)
import { requireSession } from './_auth.js';
import { readTextFile, writeFiles, usingGitHub } from './_store.js';
import { buildFromPosts } from './_build.js';

const FILES = {
  posts:     'content/posts.json',
  portfolio: 'content/portfolio.json',
};

export default requireSession(async function handler(req, res) {
  const type = String(req.query?.type || 'posts');
  const file = FILES[type];
  if (!file) return res.status(400).json({ error: `Unknown content type "${type}"` });

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ type, data: JSON.parse(await readTextFile(file)) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Expected { data: … }' });
    }
    try {
      const files = [{ path: file, content: JSON.stringify(data, null, 2) + '\n' }];

      // Editing posts also regenerates the blog HTML, so the change is live.
      let pages = [];
      let removed = [];
      if (type === 'posts') {
        // pages the previous content produced, so renamed/unpublished posts
        // don't leave an orphaned HTML file live on the site
        let before = [];
        try {
          const prev = JSON.parse(await readTextFile(file));
          before = (await buildFromPosts(prev.posts || [])).map((p) => p.path);
        } catch { /* first write, nothing to clean up */ }

        pages = await buildFromPosts(data.posts || []);
        const keep = new Set(pages.map((p) => p.path));
        removed = before.filter((p) => !keep.has(p));

        files.push(...pages, ...removed.map((path) => ({ path, content: null })));
      }

      const result = await writeFiles(files, `Update ${type} from the admin dashboard`);
      return res.status(200).json({
        ok: true,
        storage: result.mode,
        commit: result.commit || null,
        regenerated: pages.map((p) => p.path),
        removed,
        note: usingGitHub() ? null : 'Saved to the local filesystem — no commit was made.',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
