// Session handling for the admin dashboard.
//
// Env required in production:
//   ADMIN_PASSWORD        the sign-in password
//   ADMIN_SESSION_SECRET  random string used to sign session cookies
//
// The session is a signed, HttpOnly cookie — nothing sensitive is readable by
// page scripts, and the signature means it can't be forged without the secret.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE = 'nrg_admin';
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const secret = () => process.env.ADMIN_SESSION_SECRET || '';

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time string compare that tolerates differing lengths. */
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // still burn a comparison so failures cost the same
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function issueToken() {
  const payload = `${Date.now() + TTL_MS}.${randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || !secret()) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  const exp = Number(payload.split('.')[0]);
  return Number.isFinite(exp) && Date.now() < exp;
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${TTL_MS / 1000}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=0`);
}

/** Wraps a handler so it only runs for a valid session. */
export function requireSession(handler) {
  return async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Admin is not configured on this deployment.', code: 'not_configured' });
    }
    if (!verifyToken(readCookie(req))) {
      return res.status(401).json({ error: 'Not signed in', code: 'unauthorized' });
    }
    return handler(req, res);
  };
}

export function isConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}
