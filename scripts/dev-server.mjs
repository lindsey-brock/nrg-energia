#!/usr/bin/env node
// Local dev server: serves the static site AND runs the /api functions, so the
// admin dashboard works offline without needing `vercel dev` (which requires a
// Vercel login). Production still runs the same handlers on Vercel unchanged.
//
//   node scripts/dev-server.mjs [port]
//
// Reads .env.local for ADMIN_PASSWORD / ADMIN_SESSION_SECRET etc.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 3100;

// ── .env.local ───────────────────────────────────────────────────────────────
if (existsSync(join(ROOT, '.env.local'))) {
  for (const line of (await readFile(join(ROOT, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

/** Minimal shim over node http to match the Vercel function signature. */
function shim(req, res, url, body) {
  req.query = Object.fromEntries(url.searchParams);
  req.body = body;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (s) => { res.end(s); return res; };
  return { req, res };
}

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let path = decodeURIComponent(url.pathname);

  // ── API ───────────────────────────────────────────────────────────────────
  if (path.startsWith('/api/')) {
    let file = join(ROOT, `${path}.js`);
    let segments = null;

    // Vercel-style catch-all: with no exact file, walk up looking for
    // [...path].js and hand it the remaining segments, the way the platform
    // routes /api/admin/media to api/admin/[...path].js.
    if (!existsSync(file)) {
      const parts = path.slice('/api/'.length).split('/').filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = join(ROOT, 'api', ...parts.slice(0, i), '[...path].js');
        if (existsSync(candidate)) { file = candidate; segments = parts.slice(i); break; }
      }
    }

    if (!existsSync(file)) { res.statusCode = 404; return res.end('No such function'); }
    try {
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`); // fresh each request
      shim(req, res, url, await readBody(req));
      if (segments) req.query.path = segments;
      await mod.default(req, res);
    } catch (err) {
      console.error(`[api] ${path}:`, err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── static, with vercel.json-style clean URLs ─────────────────────────────
  if (path.endsWith('/')) path += 'index.html';
  let file = join(ROOT, path);
  // cleanUrls: "<name>.html" wins over a same-named directory, matching Vercel.
  // /blog must serve blog.html even though a blog/ directory also exists.
  if (existsSync(`${file}.html`)) file = `${file}.html`;
  else if (existsSync(file) && (await stat(file)).isDirectory()) file = join(file, 'index.html');

  if (!existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
}).listen(PORT, () => {
  const configured = process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET;
  console.log(`\n  site   http://localhost:${PORT}/`);
  console.log(`  admin  http://localhost:${PORT}/admin/`);
  console.log(`  auth   ${configured ? 'configured from .env.local' : 'NOT configured — set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in .env.local'}\n`);
});
