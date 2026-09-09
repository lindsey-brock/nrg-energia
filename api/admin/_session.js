import { verifyToken, readCookie, isConfigured } from './_auth.js';

export default async function handler(req, res) {
  return res.status(200).json({
    configured: isConfigured(),
    authenticated: isConfigured() && verifyToken(readCookie(req)),
  });
}
