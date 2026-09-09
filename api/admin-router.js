// Every admin endpoint, behind one Serverless Function.
//
// Vercel makes a function out of each non-underscore file under api/, and the
// Hobby plan allows twelve per deployment; the admin alone has twelve routes.
// So the handlers live in _-prefixed modules that Vercel leaves alone, and
// vercel.json rewrites /api/admin/<name> here with ?route=<name>.
//
// A dynamic route (api/admin/[...path].js) would express this more directly,
// but did not resolve on this deployment — every /api/admin/* request 404'd.
// A rewrite onto a plain function needs no dynamic-route support at all.

import competitor from './admin/_competitor.js';
import content from './admin/_content.js';
import integrations from './admin/_integrations.js';
import login from './admin/_login.js';
import logout from './admin/_logout.js';
import media from './admin/_media.js';
import preview from './admin/_preview.js';
import searchConsole from './admin/_search-console.js';
import seo from './admin/_seo.js';
import session from './admin/_session.js';
import translate from './admin/_translate.js';
import upload from './admin/_upload.js';

const ROUTES = {
  competitor, content, integrations, login, logout, media,
  preview, 'search-console': searchConsole, seo, session, translate, upload,
};

export default async function handler(req, res) {
  const route = ROUTES[req.query?.route];
  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `Unknown admin endpoint: ${req.query?.route ?? ''}` }));
  }
  return route(req, res);
}
