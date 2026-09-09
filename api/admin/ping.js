// Diagnostic: a plain function in this directory, to confirm nested api/ routes
// deploy. Remove once the admin API is confirmed reachable.
export default function handler(req, res) {
  res.status(200).json({ ok: true, from: 'api/admin/ping.js' });
}
