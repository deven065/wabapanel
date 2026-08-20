// Step-by-step setup guides for credential-based integrations.
// Shown in-app (Connect modal) and used to generate a downloadable PDF.
// Keep each `steps` entry short and action-oriented (A-Z), `keysUrl` = where to get the keys.

export interface IntegrationGuide {
  steps: string[];
  keysUrl?: string;
  note?: string;
}

export const INTEGRATION_GUIDES: Record<string, IntegrationGuide> = {
  'google-calendar': {
    keysUrl: 'https://console.cloud.google.com/',
    steps: [
      'Google Cloud Console → create/select a project.',
      'APIs & Services → Library → enable "Google Calendar API".',
      'APIs & Services → Credentials → Create credentials → Service account → create it.',
      'Open the service account → Keys → Add key → JSON → download the file.',
      'In Google Calendar → your calendar → Settings → Share with the service account email (Make changes to events).',
      'Copy the Calendar ID from calendar Settings ("Integrate calendar").',
      'Paste the full JSON here in "Service Account JSON Key" and the Calendar ID, then Connect.',
    ],
  },
  'google-sheets': {
    keysUrl: 'https://console.cloud.google.com/',
    steps: [
      'Google Cloud Console → create/select a project.',
      'APIs & Services → Library → enable "Google Sheets API".',
      'Credentials → Create credentials → Service account → open it → Keys → Add key → JSON → download.',
      'Open the downloaded JSON and copy the "client_email" value (it ends with ...iam.gserviceaccount.com — this is NOT your Gmail).',
      'Open your Google Sheet → Share → paste that service account (client_email) → give Editor access → Send. (Sharing with your own Gmail will NOT work.)',
      'Copy the Sheet ID from the URL: docs.google.com/spreadsheets/d/<SHEET_ID>/edit',
      'Paste the JSON and Sheet ID here, then Connect. If you get "caller does not have permission", the sheet is not shared with the client_email above.',
    ],
  },
  shopify: {
    keysUrl: 'https://admin.shopify.com/',
    steps: [
      'Shopify admin → Settings → Apps and sales channels → Develop apps.',
      'Click "Allow custom app development" (one-time), then "Create an app".',
      'Open the app → Configuration → Admin API integration → enable scopes: read_orders, read_customers, read_products.',
      'API credentials tab → Install app → reveal the "Admin API access token" (starts with shpat_).',
      'Store URL = your *.myshopify.com domain (NOT your custom domain like www.yoursite.com).',
      'Paste the myshopify Store URL and the shpat_ token here, then Connect.',
    ],
    note: 'Use the Admin API access token (shpat_...), not the API secret key (shpss_). Store URL must be the *.myshopify.com host.',
  },
  woocommerce: {
    keysUrl: '',
    steps: [
      'WordPress admin → WooCommerce → Settings → Advanced → REST API.',
      'Click "Add key" → Description any → Permissions: Read → Generate API key.',
      'Copy the Consumer key (ck_...) and Consumer secret (cs_...).',
      'Store URL = your site root, e.g. https://yourstore.com (WooCommerce/WordPress must be reachable).',
      'Paste Store URL, Consumer Key and Consumer Secret here, then Connect.',
    ],
    note: 'Pretty permalinks must be enabled (Settings → Permalinks) so the /wp-json REST API works.',
  },
  hubspot: {
    keysUrl: 'https://app.hubspot.com/',
    steps: [
      'HubSpot → Settings (gear) → Integrations → Private Apps.',
      'Create a private app → Scopes → enable crm.objects.contacts (read/write).',
      'Create the app → copy the access token (starts with pat-).',
      'Paste the token here, then Connect.',
    ],
  },
  mailchimp: {
    keysUrl: 'https://admin.mailchimp.com/account/api/',
    steps: [
      'Mailchimp → Account → Extras → API keys.',
      'Create a key and copy it — it ends with a data-center suffix like -us21.',
      'Paste the full key (including the -usXX part) here, then Connect.',
    ],
    note: 'The key MUST include its data center suffix (e.g. ...-us21), otherwise it will not connect.',
  },
  razorpay: {
    keysUrl: 'https://dashboard.razorpay.com/app/keys',
    steps: [
      'Razorpay Dashboard → Settings → API Keys → Generate Key.',
      'Copy the Key ID (rzp_live_... or rzp_test_...) and Key Secret (shown once).',
      'Paste Key ID and Key Secret here, then Connect.',
      '(Optional) For payment auto-delivery add a webhook in Razorpay → Settings → Webhooks.',
    ],
  },
  stripe: {
    keysUrl: 'https://dashboard.stripe.com/apikeys',
    steps: [
      'Stripe Dashboard → Developers → API keys.',
      'Copy the Secret key (sk_live_... or sk_test_...).',
      'Paste the Secret key here, then Connect.',
    ],
  },
  'google-analytics': {
    keysUrl: 'https://analytics.google.com/',
    steps: [
      'Google Analytics → Admin → Data Streams → open your web stream.',
      'Copy the Measurement ID (G-XXXXXXXXXX).',
      'Paste it here, then Connect.',
    ],
  },
  webhook: {
    steps: [
      'Get the URL on your server that should receive events.',
      'Paste it here as the Webhook URL, then Connect.',
      'We will POST JSON payloads to this URL on panel events.',
    ],
  },
  zapier: {
    keysUrl: 'https://zapier.com/app/zaps',
    steps: [
      'Zapier → Create Zap → Trigger: "Webhooks by Zapier" → Catch Hook.',
      'Copy the custom webhook URL Zapier gives you.',
      'Paste it here, then Connect.',
    ],
  },
  make: {
    keysUrl: 'https://www.make.com/',
    steps: [
      'Make → new scenario → add "Webhooks → Custom webhook" module.',
      'Copy the generated webhook URL.',
      'Paste it here, then Connect.',
    ],
  },
  pabbly: {
    keysUrl: 'https://connect.pabbly.com/',
    steps: [
      'Pabbly Connect → new workflow → Trigger: Webhook.',
      'Copy the webhook URL.',
      'Paste it here, then Connect.',
    ],
  },
  n8n: {
    steps: [
      'n8n → new workflow → add a "Webhook" node → copy its Production URL.',
      'Paste it here, then Connect.',
    ],
  },
  ifttt: {
    keysUrl: 'https://ifttt.com/maker_webhooks',
    steps: [
      'IFTTT → Webhooks service → Documentation → copy your key.',
      'Build the URL: https://maker.ifttt.com/trigger/{event}/with/key/{your_key}',
      'Paste it here, then Connect.',
    ],
  },
  calendly: {
    keysUrl: 'https://calendly.com/integrations/api_webhooks',
    steps: [
      'Calendly → Integrations → API & Webhooks → Personal access tokens.',
      'Generate a token and copy it.',
      'Paste it here, then Connect.',
    ],
  },
  salesforce: {
    keysUrl: 'https://login.salesforce.com/',
    steps: [
      'Salesforce → Setup → App Manager → New Connected App (enable OAuth).',
      'Generate/obtain an OAuth access token for the API user.',
      'Instance URL = https://yourorg.my.salesforce.com',
      'Paste Instance URL and Access Token here, then Connect.',
    ],
  },
  'zoho-crm': {
    keysUrl: 'https://api-console.zoho.com/',
    steps: [
      'Zoho API Console → Self Client → generate an OAuth access token with ZohoCRM scope.',
      'API Domain = https://www.zohoapis.com (or .in / .eu for your region).',
      'Paste the Access Token and API Domain here, then Connect.',
    ],
  },
  pipedrive: {
    keysUrl: 'https://app.pipedrive.com/settings/api',
    steps: [
      'Pipedrive → Settings → Personal preferences → API → copy your API token.',
      'Company Domain = the part before .pipedrive.com (e.g. "yourcompany").',
      'Paste the API token and Company Domain here, then Connect.',
    ],
  },
  bitrix24: {
    steps: [
      'Bitrix24 → Developer resources → Other → Inbound webhook.',
      'Give it CRM permissions and copy the generated URL.',
      'Paste it here, then Connect.',
    ],
  },
  paypal: {
    keysUrl: 'https://developer.paypal.com/dashboard/applications/live',
    steps: [
      'PayPal Developer Dashboard → Apps & Credentials → Live → Create App.',
      'Copy the Client ID and Client Secret.',
      'Paste Client ID and Client Secret here, then Connect.',
    ],
  },
  paytm: {
    keysUrl: 'https://dashboard.paytm.com/',
    steps: [
      'Paytm Business Dashboard → Developer Settings → API Keys.',
      'Copy the Merchant ID (MID) and Merchant Key.',
      'Paste MID and Merchant Key here, then Connect.',
    ],
  },
  phonepe: {
    keysUrl: 'https://business.phonepe.com/',
    steps: [
      'PhonePe Business → Developer settings.',
      'Copy the Merchant ID, Salt Key and Salt Index.',
      'Paste all three here, then Connect.',
    ],
  },
  cashfree: {
    keysUrl: 'https://merchant.cashfree.com/merchants/developers',
    steps: [
      'Cashfree Dashboard → Developers → API Keys.',
      'Copy the App ID and Secret Key.',
      'Paste App ID and Secret Key here, then Connect.',
    ],
  },
  paystack: {
    keysUrl: 'https://dashboard.paystack.com/#/settings/developers',
    steps: [
      'Paystack Dashboard → Settings → API Keys & Webhooks.',
      'Copy the Secret Key (sk_live_...).',
      'Paste it here, then Connect.',
    ],
  },
  mercadopago: {
    keysUrl: 'https://www.mercadopago.com/developers/panel',
    steps: [
      'Mercado Pago Developers → your app → Credentials.',
      'Copy the Access Token (APP_USR-...).',
      'Paste it here, then Connect.',
    ],
  },
  openai: {
    keysUrl: 'https://platform.openai.com/api-keys',
    steps: [
      'OpenAI Platform → API keys → Create new secret key → copy it (sk-...).',
      'Paste the API key here.',
      '(Optional) For a custom GPT server, add the Endpoint URL and Model, then Connect.',
    ],
  },
};
