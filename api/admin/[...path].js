// One function for the whole admin API.
//
// Vercel turns every non-underscore file under api/ into its own Serverless
// Function, and the Hobby plan allows twelve per deployment. The admin has
// twelve routes of its own, which together with the site's contact endpoints
// put the deployment over the limit and stopped it deploying.
//
// So the routes live in _-prefixed modules — which Vercel does not turn into
// functions — and this catch-all dispatches to them. The URLs are unchanged:
// /api/admin/media still reaches the media handler.

import competitor from './_competitor.js';
import content from './_content.js';
import integrations from './_integrations.js';
import login from './_login.js';
import logout from './_logout.js';
import media from './_media.js';
import preview from './_preview.js';
import searchConsole from './_search-console.js';
import seo from './_seo.js';
import session from './_session.js';
import translate from './_translate.js';
import upload from './_upload.js';

const ROUTES = {
  competitor,
  content,
  integrations,
  login,
  logout,
  media,
  preview,
  'search-console': searchConsole,
  seo,
  session,
  translate,
  upload,
};

export default async function handler(req, res) {
  // the catch-all gives us the segments after /api/admin
  const segments = req.query?.path;
  const name = Array.isArray(segments) ? segments[segments.length - 1] : segments;
  const route = ROUTES[name];

  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Unknown admin endpoint: ${name ?? ''}` }));
  }
  return route(req, res);
}
