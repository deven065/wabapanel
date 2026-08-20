const crypto = require('crypto');
const Integration = require('../models/Integration');
const axios = require('axios');
const Template = require('../models/Template');
const Contact = require('../models/Contact');
const WhatsAppService = require('../services/whatsappService');
const { LEAD_SOURCES, getEffectivePresets, submitPresetTemplate } = require('../services/integrationAutomation');

const getIntegrations = async (req, res) => {
  try {
    const integrations = await Integration.find({ workspace: req.workspace._id });
    const safe = integrations.map(i => {
      const obj = i.toObject();
      if (obj.config.apiKey) obj.config.apiKey = '****' + obj.config.apiKey.slice(-4);
      if (obj.config.apiSecret) obj.config.apiSecret = '****' + obj.config.apiSecret.slice(-4);
      if (obj.config.webhookSecret) obj.config.webhookSecret = '****' + obj.config.webhookSecret.slice(-4);
      return obj;
    });
    res.json({ success: true, data: safe });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Shopify Admin API only works on the *.myshopify.com host. Strip protocol/path so a
// full URL like "https://www.rangrachna.in/" doesn't produce a broken "https://https://.../admin" request.
const shopHost = (s) => String(s || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

const connectIntegration = async (req, res) => {
  try {
    const { type, config } = req.body;
    if (type === 'shopify' && config && config.storeUrl) config.storeUrl = shopHost(config.storeUrl);
    let integration = await Integration.findOne({ workspace: req.workspace._id, type });
    if (!integration) {
      integration = new Integration({ workspace: req.workspace._id, type, config, connected: true });
    } else {
      if (config.apiKey && !config.apiKey.startsWith('****')) integration.config.apiKey = config.apiKey;
      if (config.apiSecret && !config.apiSecret.startsWith('****')) integration.config.apiSecret = config.apiSecret;
      if (config.webhookSecret && !config.webhookSecret.startsWith('****')) integration.config.webhookSecret = config.webhookSecret;
      if (config.webhookUrl) integration.config.webhookUrl = config.webhookUrl;
      if (config.storeUrl) integration.config.storeUrl = config.storeUrl;
      if (config.sheetId) integration.config.sheetId = config.sheetId;
      if (config.calendarId) integration.config.calendarId = config.calendarId;
      if (config.measurementId) integration.config.measurementId = config.measurementId;
      if (config.instanceUrl) integration.config.instanceUrl = config.instanceUrl;
      if (config.apiDomain) integration.config.apiDomain = config.apiDomain;
      if (config.companyDomain) integration.config.companyDomain = config.companyDomain;
      if (config.clientId) integration.config.clientId = config.clientId;
      if (config.merchantId) integration.config.merchantId = config.merchantId;
      if (config.saltIndex) integration.config.saltIndex = config.saltIndex;
      if (config.endpointUrl) integration.config.endpointUrl = config.endpointUrl;
      if (config.model) integration.config.model = config.model;
      integration.connected = true;
    }

    // Test the connection
    let testResult = { success: true, message: 'Connected' };
    try {
      testResult = await testIntegrationConnection(type, integration.config);
    } catch (err) {
      testResult = { success: false, message: err.message };
    }

    if (!testResult.success) {
      // Invalid credentials must not leave a stale "connected" state
      if (!integration.isNew) {
        integration.connected = false;
        try { await integration.save(); } catch (e) {}
      }
      return res.status(400).json({ success: false, message: 'Connection test failed: ' + testResult.message });
    }

    await integration.save();
    const safe = integration.toObject();
    if (safe.config.apiKey) safe.config.apiKey = '****' + safe.config.apiKey.slice(-4);
    if (safe.config.apiSecret) safe.config.apiSecret = '****' + safe.config.apiSecret.slice(-4);
    res.json({ success: true, data: safe, message: testResult.message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const disconnectIntegration = async (req, res) => {
  try {
    const integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });
    integration.connected = false;
    await integration.save();
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSyncSettings = async (req, res) => {
  try {
    const integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });
    Object.assign(integration.syncSettings, req.body);
    await integration.save();
    res.json({ success: true, data: integration });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const triggerSync = async (req, res) => {
  try {
    const integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type, connected: true });
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not connected' });

    const Contact = require('../models/Contact');
    const contacts = await Contact.find({ workspace: req.workspace._id }).limit(1000).lean();

    let syncResult = { synced: 0, message: '' };

    switch (integration.type) {
      case 'google-sheets':
        syncResult = await syncToGoogleSheets(integration, contacts);
        break;
      case 'webhook':
      case 'pabbly':
      case 'n8n':
      case 'ifttt':
      case 'bitrix24':
        syncResult = await syncToWebhook(integration, contacts);
        break;
      case 'hubspot':
        syncResult = await syncToHubSpot(integration, contacts);
        break;
      case 'mailchimp':
        syncResult = await syncToMailchimp(integration, contacts);
        break;
      case 'pipedrive':
        syncResult = await syncToPipedrive(integration, contacts);
        break;
      case 'zoho-crm':
        syncResult = await syncToZohoCRM(integration, contacts);
        break;
      case 'salesforce':
        syncResult = await syncToSalesforce(integration, contacts);
        break;
      case 'shopify':
        syncResult = await syncFromShopify(integration, req.workspace._id);
        break;
      case 'woocommerce':
        syncResult = await syncFromWooCommerce(integration, req.workspace._id);
        break;
      default:
        syncResult = { synced: 0, message: 'Sync not yet implemented for ' + integration.type };
    }

    integration.stats.totalSynced += syncResult.synced;
    integration.stats.lastSyncAt = new Date();
    await integration.save();

    res.json({ success: true, data: syncResult });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Integration sync implementations

function apiErr(e, fallback) {
  const status = e.response?.status;
  const provMsg = e.response?.data?.message || e.response?.data?.error?.message
    || e.response?.data?.error || e.response?.data?.[0]?.message || e.response?.data?.fault?.faultstring;
  if (status === 401 || status === 403) return `${fallback} (auth rejected)`;
  if (provMsg) return `${fallback}: ${typeof provMsg === 'string' ? provMsg : JSON.stringify(provMsg)}`;
  if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') return `${fallback} (could not reach provider — check URL)`;
  return fallback;
}

async function testIntegrationConnection(type, config) {
  switch (type) {
    case 'google-sheets':
      if (!config.apiKey) throw new Error('API Key required');
      return { success: true, message: 'Google Sheets connected (Service Account key saved)' };
    case 'google-calendar':
      if (!config.apiKey || !config.calendarId) throw new Error('Service Account key and Calendar ID required');
      return { success: true, message: 'Google Calendar connected' };
    case 'shopify': {
      if (!config.storeUrl || !config.apiKey) throw new Error('Store URL and API Key required');
      const host = shopHost(config.storeUrl);
      if (!/\.myshopify\.com$/i.test(host)) {
        throw new Error('Shopify — use your *.myshopify.com store URL (not your custom domain), e.g. your-store.myshopify.com');
      }
      if (!/^shpat_/.test(config.apiKey)) {
        throw new Error('Shopify — use the Admin API access token (starts with shpat_) from your custom app, not the API secret key (shpss_)');
      }
      try {
        await axios.get(`https://${host}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': config.apiKey }, timeout: 12000
        });
        return { success: true, message: 'Shopify store connected' };
      } catch (e) { throw new Error(apiErr(e, 'Shopify — check Store URL & Admin API access token')); }
    }
    case 'woocommerce':
      if (!config.storeUrl || !config.apiKey || !config.apiSecret) throw new Error('Store URL, Consumer Key and Consumer Secret required');
      try {
        const wcUrl = String(config.storeUrl).replace(/\/$/, '');
        await axios.get(`${wcUrl}/wp-json/wc/v3/products?per_page=1`, {
          params: { consumer_key: config.apiKey, consumer_secret: config.apiSecret }, timeout: 12000
        });
        return { success: true, message: 'WooCommerce store connected' };
      } catch (e) { throw new Error(apiErr(e, 'WooCommerce — check Store URL & API keys (REST API enabled?)')); }
    case 'hubspot':
      if (!config.apiKey) throw new Error('API Key required');
      try {
        await axios.get('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
          headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'HubSpot connected' };
      } catch (e) { throw new Error(apiErr(e, 'HubSpot — invalid private app token')); }
    case 'mailchimp':
      if (!config.apiKey) throw new Error('API Key required');
      const dc = config.apiKey.split('-').pop();
      if (!dc || dc === config.apiKey) throw new Error('Mailchimp key must end with a data center suffix like -us21');
      try {
        await axios.get(`https://${dc}.api.mailchimp.com/3.0/`, {
          headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'Mailchimp connected' };
      } catch (e) { throw new Error(apiErr(e, 'Mailchimp — invalid API key')); }
    case 'razorpay':
      if (!config.apiKey || !config.apiSecret) throw new Error('Key ID and Secret required');
      try {
        await axios.get('https://api.razorpay.com/v1/items?count=1', {
          auth: { username: config.apiKey, password: config.apiSecret }, timeout: 12000
        });
        return { success: true, message: 'Razorpay connected' };
      } catch (e) { throw new Error(apiErr(e, 'Razorpay — invalid Key ID / Secret')); }
    case 'stripe':
      if (!config.apiKey) throw new Error('Secret Key required');
      try {
        await axios.get('https://api.stripe.com/v1/balance', {
          headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'Stripe connected' };
      } catch (e) { throw new Error(apiErr(e, 'Stripe — invalid secret key')); }
    case 'google-analytics':
      if (!config.measurementId) throw new Error('Measurement ID required');
      return { success: true, message: 'Google Analytics configured' };
    case 'webhook':
      if (!config.webhookUrl) throw new Error('Webhook URL required');
      return { success: true, message: 'Webhook URL saved' };
    case 'zapier':
    case 'make':
    case 'pabbly':
    case 'n8n':
    case 'ifttt':
    case 'bitrix24':
      if (!config.webhookUrl) throw new Error('Webhook URL required');
      return { success: true, message: 'Webhook URL connected' };
    case 'salesforce':
      if (!config.instanceUrl || !config.apiKey) throw new Error('Instance URL and Access Token required');
      try {
        await axios.get(`${String(config.instanceUrl).replace(/\/$/, '')}/services/data/v59.0/limits`, {
          headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'Salesforce connected' };
      } catch (e) { throw new Error(apiErr(e, 'Salesforce — check Instance URL & access token')); }
    case 'zoho-crm':
      if (!config.apiKey) throw new Error('OAuth Access Token required');
      try {
        const zBase = (config.apiDomain && String(config.apiDomain).startsWith('http')) ? config.apiDomain.replace(/\/$/, '') : 'https://www.zohoapis.com';
        await axios.get(`${zBase}/crm/v3/settings/modules`, {
          headers: { Authorization: `Zoho-oauthtoken ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'Zoho CRM connected' };
      } catch (e) { throw new Error(apiErr(e, 'Zoho CRM — token invalid/expired or wrong API domain')); }
    case 'pipedrive':
      if (!config.apiKey) throw new Error('API Token required');
      try {
        const pHost = config.companyDomain ? `https://${String(config.companyDomain).replace(/^https?:\/\//, '').replace(/\.pipedrive\.com.*$/, '')}.pipedrive.com` : 'https://api.pipedrive.com';
        await axios.get(`${pHost}/api/v1/users/me?api_token=${encodeURIComponent(config.apiKey)}`, { timeout: 12000 });
        return { success: true, message: 'Pipedrive connected' };
      } catch (e) { throw new Error(apiErr(e, 'Pipedrive — invalid API token')); }
    case 'paypal':
      if (!config.clientId || !config.apiSecret) throw new Error('Client ID and Secret required');
      return { success: true, message: 'PayPal connected' };
    case 'paytm':
      if (!config.merchantId || !config.apiSecret) throw new Error('Merchant ID and Key required');
      return { success: true, message: 'Paytm connected' };
    case 'phonepe':
      if (!config.merchantId || !config.apiSecret) throw new Error('Merchant ID and Salt Key required');
      return { success: true, message: 'PhonePe connected' };
    case 'cashfree':
      if (!config.clientId || !config.apiSecret) throw new Error('App ID and Secret Key required');
      return { success: true, message: 'Cashfree connected' };
    case 'paystack':
      if (!config.apiKey) throw new Error('Secret Key required');
      try {
        await axios.get('https://api.paystack.co/transaction?perPage=1', {
          headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000
        });
        return { success: true, message: 'Paystack connected' };
      } catch (e) { throw new Error(apiErr(e, 'Paystack — invalid secret key')); }
    case 'mercadopago':
      if (!config.apiKey) throw new Error('Access Token required');
      try {
        await axios.get(`https://api.mercadopago.com/users/me?access_token=${encodeURIComponent(config.apiKey)}`, { timeout: 12000 });
        return { success: true, message: 'Mercado Pago connected' };
      } catch (e) { throw new Error(apiErr(e, 'Mercado Pago — invalid access token')); }
    case 'openai':
      if (!config.apiKey && !config.endpointUrl) throw new Error('API Key or Custom Endpoint URL required');
      return { success: true, message: 'AI provider connected' };
    case 'calendly':
      if (!config.apiKey) throw new Error('API Key required');
      return { success: true, message: 'Calendly connected' };
    default:
      return { success: true, message: 'Connected' };
  }
}

async function syncToWebhook(integration, contacts) {
  const url = integration.config.webhookUrl;
  if (!url) return { synced: 0, message: 'No webhook URL configured' };
  try {
    await axios.post(url, { event: 'contacts_sync', contacts: contacts.map(c => ({
      name: c.name, phone: c.phone, email: c.email, tags: c.tags,
    })), timestamp: new Date().toISOString() }, { timeout: 10000 });
    return { synced: contacts.length, message: `${contacts.length} contacts sent to webhook` };
  } catch (err) {
    return { synced: 0, message: 'Webhook failed: ' + err.message };
  }
}

async function syncToGoogleSheets(integration, contacts) {
  const { apiKey, sheetId } = integration.config || {};
  if (!apiKey || !sheetId) throw new Error('Service Account JSON & Sheet ID required');
  try {
    const sheets = require('../services/googleSheets');
    const n = await sheets.exportContacts(integration.config, contacts);
    return { synced: n, message: `${n} contacts exported to your Google Sheet` };
  } catch (e) {
    throw new Error('Sheets export failed: ' + (e.response?.data?.error?.message || e.message));
  }
}

async function syncToHubSpot(integration, contacts) {
  const apiKey = integration.config.apiKey;
  let synced = 0;
  for (const contact of contacts.slice(0, 100)) {
    try {
      await axios.post('https://api.hubapi.com/crm/v3/objects/contacts', {
        properties: { firstname: contact.name?.split(' ')[0] || '', lastname: contact.name?.split(' ').slice(1).join(' ') || '', phone: contact.phone, email: contact.email || '' }
      }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
      synced++;
    } catch { /* skip duplicates */ }
  }
  return { synced, message: `${synced} contacts synced to HubSpot` };
}

async function syncToMailchimp(integration, contacts) {
  const apiKey = integration.config.apiKey;
  const dc = apiKey.split('-').pop();
  let synced = 0;
  try {
    const listsRes = await axios.get(`https://${dc}.api.mailchimp.com/3.0/lists?count=1`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const listId = listsRes.data.lists?.[0]?.id;
    if (listId) {
      const members = contacts.filter(c => c.email).slice(0, 100).map(c => ({
        email_address: c.email, status: 'subscribed',
        merge_fields: { FNAME: c.name?.split(' ')[0] || '', LNAME: c.name?.split(' ').slice(1).join(' ') || '', PHONE: c.phone || '' }
      }));
      if (members.length) {
        await axios.post(`https://${dc}.api.mailchimp.com/3.0/lists/${listId}`, {
          members, update_existing: true
        }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
        synced = members.length;
      }
    }
  } catch { /* handle error */ }
  return { synced, message: `${synced} contacts synced to Mailchimp` };
}

async function syncToPipedrive(integration, contacts) {
  const { apiKey, companyDomain } = integration.config || {};
  if (!apiKey) throw new Error('API Token required');
  const host = companyDomain ? `https://${String(companyDomain).replace(/^https?:\/\//, '').replace(/\.pipedrive\.com.*$/, '')}.pipedrive.com` : 'https://api.pipedrive.com';
  let synced = 0;
  for (const contact of contacts.slice(0, 100)) {
    try {
      await axios.post(`${host}/api/v1/persons?api_token=${encodeURIComponent(apiKey)}`, {
        name: contact.name || contact.phone,
        phone: contact.phone ? [{ value: contact.phone, primary: true }] : [],
        email: contact.email ? [{ value: contact.email, primary: true }] : [],
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      synced++;
    } catch { /* skip duplicates/errors */ }
  }
  return { synced, message: `${synced} contacts synced to Pipedrive` };
}

async function syncToZohoCRM(integration, contacts) {
  const { apiKey, apiDomain } = integration.config || {};
  if (!apiKey) throw new Error('OAuth Access Token required');
  const base = (apiDomain && String(apiDomain).startsWith('http')) ? apiDomain.replace(/\/$/, '') : 'https://www.zohoapis.com';
  let synced = 0;
  const batch = contacts.filter(c => c.phone || c.email).slice(0, 100);
  for (let i = 0; i < batch.length; i += 100) {
    const slice = batch.slice(i, i + 100);
    try {
      await axios.post(`${base}/crm/v3/Contacts`, {
        data: slice.map(c => ({
          Last_Name: c.name || c.phone || 'Unknown',
          Phone: c.phone || '',
          Email: c.email || '',
        })),
        trigger: [],
      }, { headers: { Authorization: `Zoho-oauthtoken ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 });
      synced += slice.length;
    } catch (err) {
      throw new Error('Zoho sync failed (token may be expired): ' + (err.response?.data?.message || err.message));
    }
  }
  return { synced, message: `${synced} contacts synced to Zoho CRM` };
}

async function syncToSalesforce(integration, contacts) {
  const { apiKey, instanceUrl } = integration.config || {};
  if (!apiKey || !instanceUrl) throw new Error('Instance URL and Access Token required');
  const base = String(instanceUrl).replace(/\/$/, '');
  let synced = 0;
  for (const contact of contacts.slice(0, 100)) {
    try {
      await axios.post(`${base}/services/data/v59.0/sobjects/Contact`, {
        LastName: contact.name || contact.phone || 'Unknown',
        FirstName: contact.name?.split(' ')[0] || '',
        Phone: contact.phone || '',
        Email: contact.email || '',
      }, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 12000 });
      synced++;
    } catch (err) {
      if (err.response?.status === 401) throw new Error('Salesforce token expired/invalid — refresh the access token');
      /* skip other per-record errors */
    }
  }
  return { synced, message: `${synced} contacts synced to Salesforce` };
}

async function syncFromShopify(integration, workspaceId) {
  const { storeUrl, apiKey } = integration.config;
  const Contact = require('../models/Contact');
  let synced = 0;
  try {
    const res = await axios.get(`https://${shopHost(storeUrl)}/admin/api/2024-01/customers.json?limit=100`, {
      headers: { 'X-Shopify-Access-Token': apiKey }
    });
    for (const customer of (res.data.customers || [])) {
      const phone = customer.phone || customer.default_address?.phone;
      if (phone) {
        await Contact.findOneAndUpdate(
          { workspace: workspaceId, phone: phone.replace(/[^0-9+]/g, '') },
          { name: `${customer.first_name} ${customer.last_name}`.trim(), email: customer.email, $addToSet: { tags: 'shopify' } },
          { upsert: true }
        );
        synced++;
      }
    }
  } catch { /* handle error */ }
  return { synced, message: `${synced} Shopify customers synced` };
}

async function syncFromWooCommerce(integration, workspaceId) {
  const { storeUrl, apiKey, apiSecret } = integration.config;
  const Contact = require('../models/Contact');
  let synced = 0;
  try {
    const res = await axios.get(`${storeUrl}/wp-json/wc/v3/customers?per_page=100`, {
      auth: { username: apiKey, password: apiSecret }
    });
    for (const customer of (res.data || [])) {
      const phone = customer.billing?.phone;
      if (phone) {
        await Contact.findOneAndUpdate(
          { workspace: workspaceId, phone: phone.replace(/[^0-9+]/g, '') },
          { name: `${customer.first_name} ${customer.last_name}`.trim(), email: customer.email, $addToSet: { tags: 'woocommerce' } },
          { upsert: true }
        );
        synced++;
      }
    }
  } catch { /* handle error */ }
  return { synced, message: `${synced} WooCommerce customers synced` };
}

// @GET /api/integrations/:type/setup — webhook URL + recommended templates + automation config
const getIntegrationSetup = async (req, res) => {
  try {
    const type = req.params.type;
    const base = process.env.BACKEND_URL || 'https://wabapanel.com';
    const wsId = req.workspace._id;

    let integrationDoc = await Integration.findOne({ workspace: wsId, type });
    if (!integrationDoc) integrationDoc = new Integration({ workspace: wsId, type, connected: true, config: {} });
    if (!integrationDoc.webhookSecret) {
      integrationDoc.webhookSecret = crypto.randomBytes(12).toString('hex');
      await integrationDoc.save();
    }
    const key = `?key=${integrationDoc.webhookSecret}`;

    let webhookUrl = '';
    if (LEAD_SOURCES.includes(type) && type !== 'facebook-leads') webhookUrl = `${base}/api/ext/lead/${wsId}/${type}${key}`;
    else if (type === 'facebook-leads') webhookUrl = `${base}/api/webhook/facebook-leads`;
    else if (type === 'shopify') webhookUrl = `${base}/api/ext/shopify/${wsId}${key}`;
    else if (type === 'shiprocket') webhookUrl = `${base}/api/ext/shiprocket/${wsId}${key}`;
    else if (type === 'woocommerce') webhookUrl = `${base}/api/ext/woocommerce/${wsId}${key}`;

    const integration = integrationDoc.toObject();
    const presets = getEffectivePresets(type, integration);
    const names = presets.map(p => p.name);
    let existing = await Template.find({ workspace: wsId, name: { $in: names } }).lean();

    // Refresh pending template statuses from Meta
    const pending = existing.filter(t => t.status === 'pending' && t.metaTemplateId);
    if (pending.length && req.workspace.whatsapp?.isConnected && req.workspace.whatsapp.accessToken) {
      try {
        const wa = new WhatsAppService(req.workspace.whatsapp.accessToken, req.workspace.whatsapp.phoneNumberId);
        const metaRes = await wa.getTemplates(200, req.workspace.whatsapp.wabaId || req.workspace.whatsapp.businessAccountId);
        const metaByName = {};
        (metaRes?.data || []).forEach(t => { metaByName[t.name] = t; });
        for (const t of pending) {
          const m = metaByName[t.name];
          if (!m) continue;
          const newStatus = String(m.status || '').toLowerCase();
          if (['approved', 'rejected', 'disabled'].includes(newStatus) && newStatus !== t.status) {
            await Template.updateOne({ _id: t._id }, { status: newStatus, rejectionReason: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : '' });
          }
        }
        existing = await Template.find({ workspace: wsId, name: { $in: names } }).lean();
      } catch (e) {
        console.error('[IntegrationSetup] Meta status refresh failed:', e.message);
      }
    }

    const byName = {};
    existing.forEach(t => { byName[t.name] = t; });

    res.json({
      success: true,
      data: {
        webhookUrl,
        verifyToken: type === 'facebook-leads' ? (process.env.FB_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || '') : '',
        templates: presets.map(p => ({
          ...p,
          status: byName[p.name]?.status || 'not_submitted',
          rejectionReason: byName[p.name]?.rejectionReason || '',
        })),
        automations: integration?.automations || {},
        connected: integration?.connected || false,
        stats: integration?.stats || {},
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/integrations/:type/templates/:presetKey/submit — 1-click Meta approval submit
const submitIntegrationTemplate = async (req, res) => {
  try {
    const integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type }).lean();
    const preset = getEffectivePresets(req.params.type, integration).find(p => p.key === req.params.presetKey);
    if (!preset) return res.status(404).json({ success: false, message: 'Template preset not found' });
    const tpl = await submitPresetTemplate(req.workspace, preset);
    const submitted = tpl.status === 'approved' || !!tpl.metaTemplateId;
    res.json({
      success: true,
      data: { name: tpl.name, status: tpl.status, rejectionReason: tpl.rejectionReason },
      message: tpl.status === 'approved' ? 'Template already approved'
        : submitted ? 'Submitted to Meta for approval — usually approved within minutes'
        : (tpl.rejectionReason || 'Saved — connect WhatsApp to submit for approval'),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/integrations/:type/automation — toggle per-event auto-send
const updateAutomation = async (req, res) => {
  try {
    const { event, enabled, templateName } = req.body;
    if (!event) return res.status(400).json({ success: false, message: 'event is required' });
    let integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) {
      integration = new Integration({ workspace: req.workspace._id, type: req.params.type, connected: true, config: {} });
    }
    const automations = { ...(integration.automations || {}) };
    automations[event] = {
      enabled: enabled !== undefined ? !!enabled : (automations[event]?.enabled || false),
      templateName: templateName !== undefined ? templateName : (automations[event]?.templateName || ''),
    };
    integration.automations = automations;
    integration.markModified('automations');
    await integration.save();
    res.json({ success: true, data: integration.automations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/integrations/leads/all — combined leads from every source (contacts tagged 'lead')
const getAllLeads = async (req, res) => {
  try {
    const { page = 1, limit = 25, source = '', search = '' } = req.query;
    const query = { workspace: req.workspace._id, tags: 'lead' };
    if (source) query.tags = { $all: ['lead', source] };
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const [items, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).select('name phone email tags createdAt').lean(),
      Contact.countDocuments(query),
    ]);
    res.json({ success: true, data: { items, total, page: Number(page), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/integrations/:type/templates/:presetKey — edit a template's label/body
const updateIntegrationTemplate = async (req, res) => {
  try {
    const { label, body, headerType, headerText, headerImage, buttons } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ success: false, message: 'Template body is required' });
    let integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) integration = new Integration({ workspace: req.workspace._id, type: req.params.type, connected: true, config: {} });

    const preset = getEffectivePresets(req.params.type, integration).find(p => p.key === req.params.presetKey);
    if (!preset) return res.status(404).json({ success: false, message: 'Template not found' });

    const existing = await Template.findOne({ workspace: req.workspace._id, name: preset.name });
    if (existing && existing.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Approved template cannot be edited — add a new custom template instead' });
    }

    const extras = headerType !== undefined || buttons !== undefined
      ? { headerType: headerType || 'none', headerText: headerText || '', headerImage: headerImage || '', buttons: Array.isArray(buttons) ? buttons.slice(0, 3) : [] }
      : {};
    if (preset.custom) {
      const customs = (integration.customTemplates || []).map(c => c.key === preset.key ? { ...c, label: label || c.label, body: String(body), ...extras } : c);
      integration.customTemplates = customs;
      integration.markModified('customTemplates');
    } else {
      const overrides = { ...(integration.templateOverrides || {}) };
      overrides[preset.key] = { label: label || preset.label, body: String(body), ...extras };
      integration.templateOverrides = overrides;
      integration.markModified('templateOverrides');
    }
    if (existing) { existing.body = String(body); await existing.save(); }
    await integration.save();
    res.json({ success: true, message: 'Template updated — submit for approval when ready' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/integrations/:type/templates — add a custom template for an event
const addIntegrationTemplate = async (req, res) => {
  try {
    const { event, label, body, headerType, headerText, headerImage, buttons } = req.body;
    if (!event || !body || !String(body).trim()) return res.status(400).json({ success: false, message: 'event and body are required' });
    let integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) integration = new Integration({ workspace: req.workspace._id, type: req.params.type, connected: true, config: {} });

    const ts = Date.now();
    const type = req.params.type.replace(/[^a-z0-9]/g, '_');
    const basePreset = getEffectivePresets(req.params.type, integration).find(p => p.event === event);
    const entry = {
      key: `custom_${ts}`,
      event,
      eventLabel: basePreset?.eventLabel || event,
      name: `${type}_custom_${ts}`,
      label: label || 'My Template',
      body: String(body),
      variables: [],
      headerType: headerType || 'none',
      headerText: headerText || '',
      headerImage: headerImage || '',
      buttons: Array.isArray(buttons) ? buttons.slice(0, 3) : [],
    };
    integration.customTemplates = [...(integration.customTemplates || []), entry];
    integration.markModified('customTemplates');
    await integration.save();
    res.json({ success: true, data: entry, message: 'Template added — submit for approval when ready' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/integrations/:type/templates/:presetKey — remove a custom template
const deleteIntegrationTemplate = async (req, res) => {
  try {
    const integration = await Integration.findOne({ workspace: req.workspace._id, type: req.params.type });
    if (!integration) return res.status(404).json({ success: false, message: 'Integration not found' });
    const customs = integration.customTemplates || [];
    const target = customs.find(c => c.key === req.params.presetKey);
    if (!target) return res.status(400).json({ success: false, message: 'Only custom templates can be deleted' });
    integration.customTemplates = customs.filter(c => c.key !== req.params.presetKey);
    integration.markModified('customTemplates');
    const automations = { ...(integration.automations || {}) };
    Object.keys(automations).forEach(ev => {
      if (automations[ev]?.templateName === target.name) automations[ev] = { ...automations[ev], enabled: false, templateName: '' };
    });
    integration.automations = automations;
    integration.markModified('automations');
    await integration.save();
    res.json({ success: true, message: 'Template removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getIntegrations, connectIntegration, disconnectIntegration, updateSyncSettings, triggerSync, getIntegrationSetup, submitIntegrationTemplate, updateAutomation, updateIntegrationTemplate, addIntegrationTemplate, deleteIntegrationTemplate, getAllLeads };
