// Google Search Console — Search Analytics for the marketing dashboard.
//
// Server-to-server via a Google service account (no user OAuth dance):
//   1. Google Cloud Console -> enable the "Search Console API"
//   2. Create a service account, download its JSON key
//   3. In Search Console -> Settings -> Users and permissions, add the service
//      account's client_email as a Full or Restricted user on the property
//   4. Set env: GOOGLE_SERVICE_ACCOUNT_JSON (the whole key file, one line)
//              GSC_SITE_URL (e.g. "https://nrg-energia.it/" or "sc-domain:nrg-energia.it")
//
// Until those exist the endpoint reports configured:false and the dashboard
// shows the setup checklist rather than inventing numbers.

import { createSign } from 'node:crypto';
import { requireSession } from './_auth.js';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url');

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(sa.private_key, 'base64url');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error_description || body.error || 'Token request failed');
  return body.access_token;
}

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default requireSession(async function handler(req, res) {
  const sa = serviceAccount();
  const site = process.env.GSC_SITE_URL;

  if (!sa || !site) {
    return res.status(200).json({
      configured: false,
      missing: [
        !sa ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : null,
        !site ? 'GSC_SITE_URL' : null,
      ].filter(Boolean),
      setup: [
        'Enable the Search Console API in Google Cloud Console',
        'Create a service account and download its JSON key',
        "Add the service account's client_email as a user on the Search Console property",
        'Set GOOGLE_SERVICE_ACCOUNT_JSON and GSC_SITE_URL in the Vercel environment',
      ],
    });
  }

  const days = Math.min(Number(req.query?.days) || 28, 180);
  const dimension = ['query', 'page', 'country', 'device'].includes(req.query?.dimension)
    ? req.query.dimension : 'query';

  try {
    const token = await accessToken(sa);
    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
    const call = (body) => fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: daysAgo(days), endDate: daysAgo(1), ...body }),
    }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || 'Search Console request failed');
      return b.rows || [];
    });

    const [totals, byDate, breakdown] = await Promise.all([
      call({ dimensions: [] }),
      call({ dimensions: ['date'], rowLimit: 200 }),
      call({ dimensions: [dimension], rowLimit: 25 }),
    ]);

    return res.status(200).json({
      configured: true, site, days, dimension,
      totals: totals[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      series: byDate.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      rows: breakdown.map((r) => ({
        key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
      })),
    });
  } catch (err) {
    return res.status(502).json({ configured: true, error: err.message });
  }
});
