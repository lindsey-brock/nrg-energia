// Lists images already in the Cloudinary account, so the editor can reuse a
// photo that's on the site instead of re-uploading it.
//
// Uses the Cloudinary Admin API with the same key/secret as signed uploads.
// Nothing is proxied through here except the listing — the browser loads the
// thumbnails straight from Cloudinary's CDN.

import { requireSession } from './_auth.js';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'dmegrbq5k';

export default requireSession(async function handler(req, res) {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (!key || !secret) {
    return res.status(200).json({
      configured: false,
      missing: [!key && 'CLOUDINARY_API_KEY', !secret && 'CLOUDINARY_API_SECRET'].filter(Boolean),
      setup: [
        'Open cloudinary.com → Settings → API Keys',
        `Copy the API key and secret for cloud "${CLOUD}"`,
        'Add CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to the environment',
      ],
    });
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const params = new URLSearchParams({
    max_results: String(Math.min(Number(req.query?.limit) || 60, 200)),
    type: 'upload',
    resource_type: 'image',
  });
  if (req.query?.cursor) params.set('next_cursor', req.query.cursor);
  // Cloudinary's search endpoint would allow folder filters; the plain listing
  // keeps this working on every plan tier.

  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/resources/image?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error?.message || `Cloudinary returned ${r.status}`);

    return res.status(200).json({
      configured: true,
      cursor: body.next_cursor || null,
      images: (body.resources || []).map((x) => ({
        // the id shape the site stores: "v<version>/<public_id>.<format>"
        id: `v${x.version}/${x.public_id}.${x.format}`,
        publicId: x.public_id,
        width: x.width,
        height: x.height,
        bytes: x.bytes,
        createdAt: x.created_at,
        thumb: `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,g_auto,h_120,w_180,q_auto,f_auto/v${x.version}/${x.public_id}.${x.format}`,
      })),
    });
  } catch (err) {
    return res.status(502).json({ configured: true, error: err.message });
  }
});
