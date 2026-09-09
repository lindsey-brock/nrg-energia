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
    id: 'search-console', group: 'direct',
    docs: 'https://search.google.com/search-console',
    name: 'Google Search Console',
    metrics: 'Click, impression, CTR, posizione media, query e pagine principali',
    fields: [
      { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', label: 'Chiave del service account', secret: true, multiline: true,
        placeholder: '{"type":"service_account","project_id":"nrg-energia","client_email":"gsc@nrg-energia.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\\n…"}',
        hint: 'Il contenuto completo del file JSON scaricato da Google Cloud, incollato qui per intero.' },
      { key: 'GSC_SITE_URL', label: 'Proprietà in Search Console', prefill: SITE,
        hint: 'Per una proprietà di dominio usa invece sc-domain:nrg-energia.com' },
    ],
    steps: [
      'Attiva la Search Console API nella Google Cloud Console.',
      'Crea un service account e scarica la sua chiave in formato JSON.',
      'In Search Console apri Impostazioni → Utenti e autorizzazioni e aggiungi l’indirizzo del service account come utente della proprietà.',
      'Imposta GOOGLE_SERVICE_ACCOUNT_JSON e GSC_SITE_URL nell’ambiente del sito.',
    ],
    effort: 'circa 15 minuti, nessuna approvazione necessaria',
  },
  {
    id: 'media', group: 'direct',
    docs: 'https://console.cloudinary.com/settings/api-keys',
    name: 'Libreria immagini',
    metrics: 'Caricamento di foto e video dal pannello, senza passare da un servizio esterno',
    fields: [
      { key: 'CLOUDINARY_CLOUD_NAME', label: 'Nome del cloud', prefill: 'dmegrbq5k',
        hint: 'Si trova in alto nella dashboard del servizio di archiviazione.' },
      { key: 'CLOUDINARY_API_KEY', label: 'Chiave API', secret: true, placeholder: '123456789012345' },
      { key: 'CLOUDINARY_API_SECRET', label: 'Segreto API', secret: true, placeholder: 'abc…' },
    ],
    steps: [
      'Apri le impostazioni dell’account di archiviazione immagini → API Keys.',
      'Copia il nome del cloud, la chiave API e il segreto.',
      'Impostali nell’ambiente del sito: senza di essi la libreria mostra le immagini esistenti ma non permette di caricarne di nuove.',
    ],
    effort: 'circa 5 minuti, nessuna approvazione necessaria',
  },
  {
    id: 'pagespeed', group: 'direct',
    docs: 'https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com',
    name: 'PageSpeed Insights',
    metrics: 'SEO, prestazioni, accessibilità e Core Web Vitals pagina per pagina',
    fields: [
      { key: 'PAGESPEED_API_KEY', label: 'Chiave API', secret: true, placeholder: 'AIzaSyD-…-esempio',
        hint: 'Legge solo pagine pubbliche: non serve OAuth.' },
    ],
    steps: [
      'Nella Google Cloud Console attiva la “PageSpeed Insights API”.',
      'Crea una chiave API: legge solo pagine pubbliche, quindi non serve OAuth.',
      'Imposta PAGESPEED_API_KEY nell’ambiente del sito.',
    ],
    effort: 'circa 5 minuti, nessuna approvazione; 25.000 richieste al giorno gratuite',
  },
  {
    id: 'youtube', group: 'social',
    docs: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    name: 'YouTube',
    metrics: 'Visualizzazioni, tempo di visione, iscritti, sorgenti di traffico',
    fields: [
      { key: 'YOUTUBE_API_KEY', label: 'Chiave API', secret: true, placeholder: 'AIzaSyD-…-esempio' },
      { key: 'YOUTUBE_CHANNEL_ID', label: 'ID del canale', placeholder: 'UCa1b2c3d4e5f6g7h8i9j0k',
        hint: 'YouTube Studio → Impostazioni → Canale → Avanzate.' },
    ],
    steps: [
      'Attiva la YouTube Data API v3 nello stesso progetto Google Cloud.',
      'Crea una chiave API: per le statistiche pubbliche del canale non serve OAuth.',
      'Imposta YOUTUBE_API_KEY e YOUTUBE_CHANNEL_ID nell’ambiente del sito.',
    ],
    effort: 'circa 10 minuti; per i dati privati servirebbe anche OAuth',
  },
  {
    id: 'linkedin', group: 'social',
    docs: 'https://www.linkedin.com/developers/apps',
    name: 'LinkedIn',
    metrics: 'Follower della pagina, impression dei post, tasso di interazione',
    fields: [
      { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Access token', secret: true, placeholder: 'AQV…-esempio' },
      { key: 'LINKEDIN_ORG_ID', label: 'ID dell’organizzazione', placeholder: '1234567',
        hint: 'Il numero nell’indirizzo della pagina aziendale in modalità amministratore.' },
    ],
    steps: [
      'Crea un’app sulla LinkedIn Developer Platform e verificala con la pagina aziendale.',
      'Richiedi il prodotto Community Management API: LinkedIn lo esamina prima di concederlo.',
      'Genera un access token per l’organizzazione e conservalo.',
      'Imposta LINKEDIN_ACCESS_TOKEN e LINKEDIN_ORG_ID nell’ambiente del sito.',
    ],
    effort: 'da giorni a settimane — LinkedIn deve approvare l’accesso alle API',
  },
  {
    id: 'facebook', group: 'social',
    docs: 'https://developers.facebook.com/apps/',
    name: 'Facebook',
    metrics: 'Copertura della pagina, impression, interazioni, traffico in ingresso',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Token della Pagina', secret: true, shared: true,
        hint: 'Token di lunga durata. Lo stesso valore vale anche per Instagram.' },
      { key: 'FACEBOOK_PAGE_ID', label: 'ID della Pagina', placeholder: '1234567890',
        hint: 'Pagina Facebook → Informazioni → ID pagina.' },
    ],
    steps: [
      'Crea un’app Meta nella console Meta for Developers.',
      'Collega la Pagina Facebook a un account Business.',
      'Richiedi i permessi pages_read_engagement e read_insights, poi invia l’app alla App Review.',
      'Genera un access token della Pagina di lunga durata.',
    ],
    effort: 'da giorni a settimane — la App Review di Meta è obbligatoria per gli insight',
  },
  {
    id: 'instagram', group: 'social',
    docs: 'https://developers.facebook.com/apps/',
    name: 'Instagram',
    metrics: 'Copertura, visite al profilo, crescita dei follower, insight dei post',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Token della Pagina', secret: true, shared: true,
        hint: 'Lo stesso token usato per Facebook: compilandone uno si compila l’altro.' },
      { key: 'INSTAGRAM_ACCOUNT_ID', label: 'ID account Instagram Business', placeholder: '17841400000000000',
        hint: 'Si legge dal Graph API Explorer sulla Pagina collegata.' },
    ],
    steps: [
      'Converti l’account Instagram in un account Business o Creator.',
      'Collegalo alla Pagina Facebook configurata sopra.',
      'Usa la stessa app Meta e richiedi i permessi instagram_basic e instagram_manage_insights.',
      'Imposta INSTAGRAM_ACCOUNT_ID nell’ambiente del sito.',
    ],
    effort: 'da giorni a settimane — condivide la App Review di Meta qui sopra',
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
