// Signed Cloudinary upload for images and video.
//
// The browser never sees the Cloudinary API secret: it asks this endpoint for a
// one-shot signature, then uploads the file straight to Cloudinary. That keeps
// large files off the serverless function entirely.
//
// Env:
//   CLOUDINARY_CLOUD_NAME  defaults to the cloud the site already uses
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//   CLOUDINARY_MAX_IMAGE_MB / CLOUDINARY_MAX_VIDEO_MB  override the plan limits
//
// The size caps are Cloudinary's free-plan defaults (10 MB an image, 100 MB a
// video). Paid plans allow more, so both are overridable rather than hard-coded
// into the browser — the client reads them from here.
import { createHash } from 'node:crypto';
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

  const kind = req.query?.kind === 'video' ? 'video' : 'image';
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'blog';
  // Cloudinary signs the alphabetically sorted parameter string.
  const toSign = `folder=${folder}&timestamp=${timestamp}${secret}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  return res.status(200).json({
    configured: true,
    cloudName: CLOUD,
    apiKey: key,
    timestamp,
    folder,
    kind,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`,
    limits: {
      imageMB: Number(process.env.CLOUDINARY_MAX_IMAGE_MB) || 10,
      videoMB: Number(process.env.CLOUDINARY_MAX_VIDEO_MB) || 100,
    },
  });
});
