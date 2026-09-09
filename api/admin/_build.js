// Renders blog pages from post data, for the admin save path.
// Shares scripts/render.mjs with the CLI build so both produce identical output.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LAYOUT, renderIndex, renderArticle } from '../../scripts/render.mjs';

const TPL = (n) => join(process.cwd(), 'scripts', 'templates', n);

export async function buildFromPosts(posts) {
  const out = [];
  for (const lang of ['it', 'en']) {
    const indexTpl = await readFile(TPL(`index.${lang}.html`), 'utf8');
    out.push({ path: LAYOUT[lang].indexFile, content: renderIndex(indexTpl, posts, lang) });

    const articleTpl = await readFile(TPL(`article.${lang}.html`), 'utf8');
    for (const post of posts) {
      if (post.published === false) continue;
      out.push({
        path: `${LAYOUT[lang].articleDir}/${post[lang].slug}.html`,
        content: renderArticle(articleTpl, post, posts, lang),
      });
    }
  }
  return out;
}
