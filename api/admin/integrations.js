// Reports which marketing sources are wired up, and exactly what each one still
// needs. Nothing here fabricates metrics: a platform is "connected" only when
// its credentials are actually present in the environment.

import { requireSession } from './_auth.js';

const PLATFORMS = [
  {
    id: 'search-console',
    name: 'Google Search Console',
    metrics: 'Clicks, impressions, CTR, average position, top queries and pages',
    env: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL'],
    steps: [
      'Enable the Search Console API in Google Cloud Console',
      'Create a service account and download its JSON key',
      "In Search Console, add the service account's email as a property user",
      'Add GOOGLE_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to the Vercel environment',
    ],
    effort: 'about 15 minutes, no approval needed',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    metrics: 'Views, watch time, subscribers, traffic sources',
    env: ['YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID'],
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
    env: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORG_ID'],
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
    env: ['META_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
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
    env: ['META_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID'],
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
    const missing = p.env.filter((k) => !process.env[k]);
    return { ...p, connected: missing.length === 0, missing };
  });
  return res.status(200).json({
    platforms,
    connectedCount: platforms.filter((p) => p.connected).length,
  });
});
