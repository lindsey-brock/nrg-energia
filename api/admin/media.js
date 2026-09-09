// The image library.
//
// Two sources, and the useful one needs no credentials: every Cloudinary image
// the site already references is discoverable from the repo, and its delivery
// URL is public. So the library works out of the box on any deployment — the
// client can reuse any photo already on the site without an API key existing.
//
// With CLOUDINARY_API_KEY/SECRET set, the Admin API listing is merged in on top,
// which is what surfaces images uploaded but not yet placed. Uploading always
// needs the key, because it has to be signed; the response says so via
// canUpload, and the picker degrades to browse-only rather than refusing.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requireSession } from './_auth.js';
import { readTextFile } from './_store.js';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'dmegrbq5k';
const EXT = 'jpg|jpeg|png|webp|avif|gif';
const VID_EXT = 'mp4|webm|mov|m4v';

// A delivery URL carries optional transformation segments between /upload/ and
// the version, e.g. /upload/q_auto,f_auto,w_1600/v123/name.jpg — skip those and
// keep "v123/name.jpg", the id shape the content files store.
const URL_RE = new RegExp(
  `res\\.cloudinary\\.com/${CLOUD}/image/upload/(?:[^"'\\s)]*?/)?(v\\d+/[^"'\\s)?]+?\\.(?:${EXT}))`, 'gi');
const BARE_RE = new RegExp(`"(v\\d+/[^"]+?\\.(?:${EXT}))"`, 'gi');
const VIDEO_RE = new RegExp(
  `res\\.cloudinary\\.com/${CLOUD}/video/upload/(?:[^"'\\s)]*?/)?(v\\d+/[^"'\\s)?]+?\\.(?:${VID_EXT}))`, 'gi');

// Content files come through the store (GitHub when configured, disk otherwise);
// the pages are read straight off the deployment and skipped if unavailable.
const CONTENT = ['content/portfolio.json', 'content/posts.json'];
const PAGES = [
  'index.html', 'portfolio.html', 'blog.html',
  'services/energie-rinnovabili.html', 'services/coperture.html',
  'services/bonifica-amianto.html', 'services/impianti-elettrici.html',
  'services/en/portfolio.html', 'services/en/blog.html',
  'services/en/renewable-energy.html', 'services/en/roofing.html',
  'services/en/asbestos-removal.html', 'services/en/electrical-systems.html',
];

// Site furniture rather than photographs of work: it appears on the site, so
// the scan finds it, but nobody wants it as a cover or in a gallery.
const NOT_LIBRARY = [
  /(^|\/)map-imola/i,      // the map strip behind the footer address
];
const isLibraryImage = (id) => !NOT_LIBRARY.some((re) => re.test(id));

const thumbFor = (id) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,g_auto,h_120,w_180,q_auto,f_auto/${id}`;

// A video's poster is the same asset asked for as a still: Cloudinary renders a
// frame when the delivery URL requests an image extension.
const posterFor = (id) =>
  `https://res.cloudinary.com/${CLOUD}/video/upload/c_fill,h_120,w_180,q_auto/${id.replace(new RegExp(`\\.(?:${VID_EXT})$`, 'i'), '.jpg')}`;

const publicIdOf = (id) =>
  id.slice(id.indexOf('/') + 1).replace(new RegExp(`\\.(?:${EXT}|${VID_EXT})$`, 'i'), '');

/** Every Cloudinary image the site already points at. */
export async function imagesInUse() {
  const ids = new Set();
  const videoIds = new Set();
  const scan = (text) => {
    for (const m of text.matchAll(URL_RE)) ids.add(m[1]);
    for (const m of text.matchAll(BARE_RE)) ids.add(m[1]);
    for (const m of text.matchAll(VIDEO_RE)) videoIds.add(m[1]);
  };

  for (const f of CONTENT) {
    try { scan(await readTextFile(f)); } catch { /* not present yet */ }
  }
  for (const f of PAGES) {
    try { scan(await readFile(join(process.cwd(), f), 'utf8')); } catch { /* not deployed here */ }
  }

  const version = (id) => Number(id.slice(1, id.indexOf('/')));
  const images = [...ids].filter(isLibraryImage)
    .map((id) => ({ id, publicId: publicIdOf(id), kind: 'image', source: 'site', thumb: thumbFor(id) }));
  const videos = [...videoIds].filter(isLibraryImage)
    .map((id) => ({ id, publicId: publicIdOf(id), kind: 'video', source: 'site', thumb: posterFor(id) }));

  // newest version first, so recent uploads lead
  return [...images, ...videos].sort((a, b) => version(b.id) - version(a.id));
}

async function fromAccount(key, secret, resource, limit, cursor) {
  const params = new URLSearchParams({
    max_results: String(limit), type: 'upload', resource_type: resource,
  });
  if (cursor) params.set('next_cursor', cursor);

  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/resources/${resource}?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || `Cloudinary returned ${r.status}`);

  return {
    cursor: body.next_cursor || null,
    images: (body.resources || [])
      .map((x) => {
        const id = `v${x.version}/${x.public_id}.${x.format}`;
        const kind = resource === 'video' ? 'video' : 'image';
        return {
          id, publicId: x.public_id, kind, width: x.width, height: x.height,
          bytes: x.bytes, createdAt: x.created_at, source: 'cloudinary',
          thumb: kind === 'video' ? posterFor(id) : thumbFor(id),
        };
      })
      .filter((i) => isLibraryImage(i.id)),
  };
}

export default requireSession(async function handler(req, res) {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  const canUpload = Boolean(key && secret);
  const limit = Math.min(Number(req.query?.limit) || 60, 200);
  // callers that can only place a still ask for kind=image
  const kind = ['image', 'video'].includes(req.query?.kind) ? req.query.kind : 'all';
  const wanted = (list) => (kind === 'all' ? list : list.filter((i) => i.kind === kind));

  const site = wanted(await imagesInUse());

  if (!canUpload) {
    return res.status(200).json({
      configured: true,          // the library itself works
      canUpload: false,
      missing: [!key && 'CLOUDINARY_API_KEY', !secret && 'CLOUDINARY_API_SECRET'].filter(Boolean),
      // deliberately no mention of Cloudinary: whoever edits the site adds
      // images through this panel and never sees the service behind it.
      // The missing variables are named in Connessioni, which is the technical view.
      note: 'Sono mostrati i file già presenti sul sito. '
        + 'Il caricamento di nuovi file non è ancora attivo.',
      cursor: null,
      images: site.slice(0, limit),
    });
  }

  try {
    const resources = kind === 'all' ? ['image', 'video'] : [kind];
    const pages = await Promise.all(
      resources.map((r) => fromAccount(key, secret, r, limit, req.query?.cursor)));
    const account = wanted(pages.flatMap((p) => p.images));
    const seen = new Set(account.map((i) => i.id));
    return res.status(200).json({
      configured: true, canUpload: true, cursor: pages[0]?.cursor || null,
      images: [...account, ...site.filter((i) => !seen.has(i.id))],
    });
  } catch (err) {
    // the account listing failed; the site's own files are still browsable
    return res.status(200).json({
      configured: true, canUpload: true, error: err.message, cursor: null, images: site,
    });
  }
});
