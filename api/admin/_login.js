import { safeEqual, issueToken, setSessionCookie, isConfigured } from './_auth.js';

// Small in-memory throttle. Serverless instances are short-lived, so this slows
// down bursts rather than providing durable rate limiting.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Admin is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.',
      code: 'not_configured',
    });
  }

  const ip = req.headers['x-forwarded-for'] || 'local';
  const now = Date.now();
  const rec = attempts.get(ip) || { n: 0, since: now };
  if (now - rec.since > WINDOW_MS) { rec.n = 0; rec.since = now; }
  if (rec.n >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const { password } = req.body || {};
  if (!password || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    rec.n += 1; attempts.set(ip, rec);
    return res.status(401).json({ error: 'Password non corretta' });
  }

  attempts.delete(ip);
  setSessionCookie(res, issueToken());
  return res.status(200).json({ ok: true });
}
