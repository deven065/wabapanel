// One-click Facebook Page connect for Messenger: exchange the Facebook Login code,
// pick the Page, store its token on the workspace and subscribe it to our webhook.
const axios = require('axios');
const SystemSettings = require('../models/SystemSettings');

const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE_FIELDS = 'messages,messaging_postbacks,message_reads,message_reactions,messaging_handovers';

// The JS SDK sometimes signs the code with the page URL as redirect_uri and sometimes with none,
// so try both before giving up.
async function exchangeCode(appId, appSecret, code, redirectUri) {
  let lastErr;
  for (const uri of ['', redirectUri].filter((u) => u !== undefined)) {
    try {
      const { data } = await axios.get(`${GRAPH}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: uri, code },
        timeout: 15000,
      });
      if (data?.access_token) return data.access_token;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Failed to get access token from Meta');
}

const config = async (req, res) => {
  const settings = await SystemSettings.findOne();
  const appId = settings?.facebook?.appId || '';
  const ws = req.workspace;
  res.json({
    success: true,
    data: {
      appId,
      configId: settings?.facebook?.configId || '',
      oneClick: !!(settings?.facebook?.enableOneClick && appId),
      connected: !!(ws?.metaChat?.fbEnabled && ws?.metaChat?.pageId),
      pageId: ws?.metaChat?.pageId || '',
      pageName: ws?.metaChat?.pageName || '',
    },
  });
};

async function subscribePage(pageId, pageAccessToken) {
  try {
    await axios.post(`${GRAPH}/${pageId}/subscribed_apps`, { subscribed_fields: PAGE_FIELDS },
      { headers: { Authorization: `Bearer ${pageAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 });
  } catch (e) {
    console.error('[FbConnect] page subscribe failed:', e.response?.data?.error?.message || e.message);
  }
  try {
    const settings = await SystemSettings.findOne();
    const appId = settings?.facebook?.appId;
    const appSecret = settings?.facebook?.appSecret;
    if (!appId || !appSecret) return;
    const base = (process.env.BACKEND_URL || process.env.API_URL || '').replace(/\/$/, '');
    await axios.post(`${GRAPH}/${appId}/subscriptions`, null, {
      params: {
        object: 'page',
        callback_url: `${base}/api/webhook/whatsapp`,
        verify_token: settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '',
        fields: PAGE_FIELDS,
        access_token: `${appId}|${appSecret}`,
      },
      timeout: 10000,
    });
  } catch (e) {
    console.error('[FbConnect] app-level subscribe failed:', e.response?.data?.error?.message || e.message);
  }
}

// POST { code } -> if the user manages several Pages, the list is returned so the
// client can call again with { code, pageId } (or { pageId } from a previous list).
const oneClick = async (req, res) => {
  try {
    const { code, pageId, redirectUri } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'Authorization code required' });
    const settings = await SystemSettings.findOne();
    const appId = settings?.facebook?.appId;
    const appSecret = settings?.facebook?.appSecret;
    if (!appId || !appSecret) return res.status(400).json({ success: false, message: 'Facebook app is not configured by the admin.' });

    const userToken = await exchangeCode(appId, appSecret, code, redirectUri);

    const pagesResp = await axios.get(`${GRAPH}/me/accounts`, {
      params: { fields: 'id,name,access_token', access_token: userToken },
      timeout: 15000,
    });
    const pages = pagesResp.data?.data || [];
    if (!pages.length) return res.status(400).json({ success: false, message: 'No Facebook Page found on this account.' });

    const page = pageId ? pages.find((p) => String(p.id) === String(pageId)) : (pages.length === 1 ? pages[0] : null);
    if (!page) {
      return res.json({ success: true, data: { needsPageChoice: true, pages: pages.map((p) => ({ id: p.id, name: p.name })) } });
    }

    const ws = req.workspace;
    ws.metaChat = { ...(ws.metaChat || {}), pageId: String(page.id), pageName: page.name || '', pageAccessToken: page.access_token, fbEnabled: true };
    await ws.save();
    await subscribePage(page.id, page.access_token);
    res.json({ success: true, data: { connected: true, pageId: page.id, pageName: page.name } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }
};

const disconnect = async (req, res) => {
  const ws = req.workspace;
  ws.metaChat = { ...(ws.metaChat || {}), fbEnabled: false };
  await ws.save();
  res.json({ success: true });
};

module.exports = { config, oneClick, disconnect };
