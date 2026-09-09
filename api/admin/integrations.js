// Reports which marketing sources are wired up, and exactly what each one still
// needs. Nothing here fabricates metrics: a platform is "connected" only when
// its credentials are actually present in the environment.
//
// Each variable carries enough metadata for the admin to render a real form —
// label, hint, whether it is a secret, and a prefill where the value is already
// known. The endpoint reports whether a variable is set; it never returns the
// value itself, and it never accepts one: these functions read process.env,
// which is fixed at deploy time, so credentials are collected in the browser
// and handed to whoever manages the hosting environment.

import { requireSession } from './_auth.js';

const SITE = 'https://www.nrg-energia.com/';

const PLATFORMS = [
  {
    id: 'search-console',
    name: 'Google Search Console',
    metrics: 'Clicks, impressions, CTR, average position, top queries and pages',
    fields: [
      { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', label: 'Chiave del service account', secret: true, multiline: true,
        hint: 'Il contenuto completo del file JSON scaricato da Google Cloud, incollato qui per intero.' },
      { key: 'GSC_SITE_URL', label: 'Proprietà in Search Console', prefill: SITE,
        hint: 'Per una proprietà di dominio usa invece sc-domain:nrg-energia.com' },
    ],
    steps: [
      'Enable the Search Console API in Google Cloud Console',
      'Create a service account and download its JSON key',
      "In Search Console, add the service account's email as a property user",
      'Add GOOGLE_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to the Vercel environment',
    ],
    effort: 'about 15 minutes, no approval needed',
  },
  {
    id: 'pagespeed',
    name: 'PageSpeed Insights',
    metrics: 'Lighthouse SEO, performance, accessibility and Core Web Vitals per page',
    fields: [
      { key: 'PAGESPEED_API_KEY', label: 'Chiave API', secret: true, placeholder: 'AIza…',
        hint: 'Legge solo pagine pubbliche: non serve OAuth.' },
    ],
    steps: [
      'In Google Cloud Console, enable the "PageSpeed Insights API"',
      'Create an API key — it only reads public pages, so no OAuth is needed',
      'Add PAGESPEED_API_KEY to the environment',
    ],
    effort: 'about 5 minutes, no approval; 25,000 requests a day free',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    metrics: 'Views, watch time, subscribers, traffic sources',
    fields: [
      { key: 'YOUTUBE_API_KEY', label: 'Chiave API', secret: true, placeholder: 'AIza…' },
      { key: 'YOUTUBE_CHANNEL_ID', label: 'ID del canale', placeholder: 'UC…',
        hint: 'YouTube Studio → Impostazioni → Canale → Avanzate.' },
    ],
    steps: [
      'Enable the YouTube Data API v3 in the same Google Cloud project',
      'Create an API key (public channel stats need no OAuth)',
      'Add YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID to the environment',
    ],
    effort: 'about 10 minutes; private analytics would additionally need OAuth',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    metrics: 'Page followers, post impressions, engagement rate',
    fields: [
      { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Access token', secret: true },
      { key: 'LINKEDIN_ORG_ID', label: 'ID dell’organizzazione', placeholder: '1234567',
        hint: 'Il numero nell’indirizzo della pagina aziendale in modalità amministratore.' },
    ],
    steps: [
      'Create an app on the LinkedIn Developer Platform, verified against the company page',
      'Request the Community Management API product (LinkedIn reviews this)',
      'Generate an access token for the organisation and store it',
      'Add LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_ID to the environment',
    ],
    effort: 'days to weeks — LinkedIn must approve the API access',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    metrics: 'Page reach, impressions, engagement, referral traffic',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Token della Pagina', secret: true, shared: true,
        hint: 'Token di lunga durata. Lo stesso valore vale anche per Instagram.' },
      { key: 'FACEBOOK_PAGE_ID', label: 'ID della Pagina', placeholder: '1234567890',
        hint: 'Pagina Facebook → Informazioni → ID pagina.' },
    ],
    steps: [
      'Create a Meta app in the Meta for Developers console',
      'Link the Facebook Page to a Business account',
      'Request pages_read_engagement and read_insights, then submit for App Review',
      'Generate a long-lived Page access token',
    ],
    effort: 'days to weeks — Meta App Review required for insights',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    metrics: 'Reach, profile views, follower growth, post insights',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Token della Pagina', secret: true, shared: true,
        hint: 'Lo stesso token usato per Facebook: compilandone uno si compila l’altro.' },
      { key: 'INSTAGRAM_ACCOUNT_ID', label: 'ID account Instagram Business', placeholder: '17841400000000000',
        hint: 'Si legge dal Graph API Explorer sulla Pagina collegata.' },
    ],
    steps: [
      'Convert the Instagram account to a Business or Creator account',
      'Connect it to the Facebook Page above',
      'Use the same Meta app and request instagram_basic + instagram_manage_insights',
      'Add INSTAGRAM_ACCOUNT_ID to the environment',
    ],
    effort: 'days to weeks — shares the Meta App Review above',
  },
];

export default requireSession(async function handler(req, res) {
  const platforms = PLATFORMS.map((p) => {
    const fields = p.fields.map((f) => ({ ...f, set: Boolean(process.env[f.key]) }));
    const missing = fields.filter((f) => !f.set).map((f) => f.key);
    return { ...p, fields, env: fields.map((f) => f.key), connected: missing.length === 0, missing };
  });
  return res.status(200).json({
    platforms,
    connectedCount: platforms.filter((p) => p.connected).length,
  });
});
