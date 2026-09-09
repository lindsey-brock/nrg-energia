// Italian → English draft translation for the editor.
//
// Runs server-side because the API key must not reach the browser. DeepL is the
// default (strong on Italian, generous free tier); set DEEPL_API_KEY to enable.
//
// Tags are protected so inline markup (<strong>, &rsquo;) survives the round trip.
import { requireSession } from './_auth.js';

const endpoint = () => (process.env.DEEPL_API_KEY || '').endsWith(':fx')
  ? 'https://api-free.deepl.com/v2/translate'
  : 'https://api.deepl.com/v2/translate';

export default requireSession(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.DEEPL_API_KEY;
  if (!key) {
    return res.status(200).json({
      configured: false,
      missing: ['DEEPL_API_KEY'],
      setup: [
        'Create an account at deepl.com/pro-api (the free tier covers 500,000 characters a month)',
        'Copy the authentication key',
        'Add DEEPL_API_KEY to the environment',
      ],
    });
  }

  const texts = req.body?.texts;
  if (!Array.isArray(texts) || !texts.length) {
    return res.status(400).json({ error: 'Expected { texts: [ … ] }' });
  }
  if (texts.length > 60) {
    return res.status(400).json({ error: 'Too many segments in one request (max 60)' });
  }

  try {
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: texts,
        source_lang: 'IT',
        target_lang: 'EN',
        tag_handling: 'html',          // keeps <strong> etc. intact
        preserve_formatting: true,
      }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.message || `DeepL returned ${r.status}`);
    return res.status(200).json({
      configured: true,
      translations: body.translations.map((t) => t.text),
    });
  } catch (err) {
    return res.status(502).json({ configured: true, error: err.message });
  }
});
