const axios = require('axios');
const Workspace = require('../models/Workspace');
const SystemSettings = require('../models/SystemSettings');
const IgAutoDm = require('../models/IgAutoDm');
const IgAutoDmLog = require('../models/IgAutoDmLog');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const GRAPH = 'https://graph.facebook.com/v21.0';
const IG_SUB_FIELDS = 'messages,messaging_postbacks,messaging_referral,message_reactions,comments,live_comments,mentions';
const PAGE_SUB_FIELDS = 'messages,messaging_postbacks,message_reads,message_reactions';

const webhookCallbackUrl = (settings) => {
  const base = (process.env.BACKEND_URL || process.env.API_URL || settings?.appUrl || '').replace(/\/$/, '');
  return `${base}/api/webhook/whatsapp`;
};
const verifyToken = (settings) => settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';

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

const wsId = (req) => req.workspace?._id;

// ---------- Automations CRUD ----------
const list = async (req, res) => {
  const items = await IgAutoDm.find({ workspace: wsId(req) }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: items });
};

const create = async (req, res) => {
  const body = req.body || {};
  const item = await IgAutoDm.create({ ...body, workspace: wsId(req) });
  res.json({ success: true, data: item });
};

const update = async (req, res) => {
  const body = { ...req.body };
  delete body.workspace; delete body.stats;
  const item = await IgAutoDm.findOneAndUpdate({ _id: req.params.id, workspace: wsId(req) }, body, { new: true });
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
};

const remove = async (req, res) => {
  await IgAutoDm.deleteOne({ _id: req.params.id, workspace: wsId(req) });
  res.json({ success: true });
};

// ---------- Logs / analytics ----------
const logQuery = (req) => {
  const q = { workspace: wsId(req) };
  if (req.query.automation) q.automation = req.query.automation;
  if (req.query.stage) q.stage = req.query.stage;
  if (req.query.trigger) q.trigger = req.query.trigger;
  if (req.query.from || req.query.to) {
    q.createdAt = {};
    if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) q.createdAt.$lte = new Date(`${req.query.to}T23:59:59`);
  }
  const search = String(req.query.q || '').trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ username: rx }, { commentText: rx }, { igUserId: rx }, { error: rx }];
  }
  return q;
};

const logs = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const q = logQuery(req);
  const [items, total] = await Promise.all([
    IgAutoDmLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    IgAutoDmLog.countDocuments(q),
  ]);
  res.json({ success: true, data: items, total, page, pages: Math.ceil(total / limit) });
};

const exportLogs = async (req, res) => {
  const items = await IgAutoDmLog.find(logQuery(req)).sort({ createdAt: -1 }).limit(10000).lean();
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Trigger', 'Username', 'IG User ID', 'Comment', 'Stage', 'Attempts', 'Error'].join(',')];
  for (const it of items) {
    rows.push([it.createdAt?.toISOString() || '', it.trigger || '', it.username || '', it.igUserId || '',
      it.commentText || '', it.stage || '', it.attempts || 0, it.error || ''].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="instagram-auto-dm-logs.csv"');
  res.send(rows.join('\n'));
};

// ---------- Fetch recent IG media (for the "specific post/reel" picker) ----------
const media = async (req, res) => {
  try {
    const ws = req.workspace;
    const mc = ws.metaChat || {};
    if (!mc.igAccountId || !mc.pageAccessToken) {
      return res.status(400).json({ success: false, message: 'Instagram is not connected yet.' });
    }
    const { data } = await axios.get(`${GRAPH}/${mc.igAccountId}/media`, {
      params: {
        fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
        limit: 40,
        access_token: mc.pageAccessToken,
      },
      timeout: 15000,
    });
    res.json({ success: true, data: data.data || [] });
  } catch (err) {
    res.status(400).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }
};

// ---------- Connect ----------
const connectConfig = async (req, res) => {
  const settings = await SystemSettings.findOne();
  const appId = settings?.facebook?.appId || '';
  const configId = settings?.instagram?.configId || '';
  const oneClick = !!(settings?.instagram?.enableOneClick && appId);
  const manual = settings?.instagram?.enableManual !== false;
  const ws = req.workspace;
  res.json({
    success: true,
    data: {
      appId, configId, oneClick, manual,
      connected: !!(ws?.metaChat?.igEnabled && ws?.metaChat?.igAccountId),
      igAccountId: ws?.metaChat?.igAccountId || '',
      version: 'v21.0',
    },
  });
};

async function subscribeIg(pageId, pageAccessToken) {
  const status = { pageSubscribed: false, appSubscribed: false, pageError: '', appError: '', checkedAt: new Date() };
  // Page-level: forward this Page/IG messaging + comments to our app.
  try {
    await axios.post(`${GRAPH}/${pageId}/subscribed_apps`,
      { subscribed_fields: PAGE_SUB_FIELDS },
      { headers: { Authorization: `Bearer ${pageAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    status.pageSubscribed = true;
  } catch (e) {
    status.pageError = e.response?.data?.error?.message || e.message;
    console.error('[IgAutoDm] page subscribe failed:', status.pageError);
  }
  // App-level: subscribe the "instagram" object with comment + message fields so our webhook receives them.
  try {
    const settings = await SystemSettings.findOne();
    const fbAppId = settings?.facebook?.appId;
    const fbAppSecret = settings?.facebook?.appSecret;
    if (!fbAppId || !fbAppSecret) {
      status.appError = 'Facebook App ID / App Secret are not configured by the admin, so Instagram comment webhooks cannot be enabled.';
    } else {
      await axios.post(`${GRAPH}/${fbAppId}/subscriptions`, null, {
        params: { object: 'instagram', callback_url: webhookCallbackUrl(settings), verify_token: verifyToken(settings), fields: IG_SUB_FIELDS, access_token: `${fbAppId}|${fbAppSecret}` },
        timeout: 10000,
      });
      status.appSubscribed = true;
    }
  } catch (e) {
    status.appError = e.response?.data?.error?.message || e.message;
    console.error('[IgAutoDm] app-level IG subscribe failed:', status.appError);
  }
  return status;
}

async function saveIgToWorkspace(ws, pageId, pageAccessToken) {
  let igAccountId = '';
  try {
    const { data } = await axios.get(`${GRAPH}/${pageId}`, {
      params: { fields: 'instagram_business_account,connected_instagram_account', access_token: pageAccessToken },
      timeout: 10000,
    });
    igAccountId = data?.instagram_business_account?.id || data?.connected_instagram_account?.id || '';
  } catch (e) {
    console.error('[IgAutoDm] IG account resolve failed:', e.response?.data?.error?.message || e.message);
  }
  const status = await subscribeIg(pageId, pageAccessToken);
  ws.metaChat = { ...(ws.metaChat || {}), pageId: String(pageId), pageAccessToken, igAccountId: String(igAccountId || ''), igEnabled: true, igSubscribeStatus: status };
  ws.markModified('metaChat');
  await ws.save();
  return igAccountId;
}

// One-click: exchange the FB Login code, find the Page + linked IG account, store + subscribe.
const connectOneClick = async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Authorization code required' });
    const settings = await SystemSettings.findOne();
    const appId = settings?.facebook?.appId;
    const appSecret = settings?.facebook?.appSecret;
    if (!appId || !appSecret) return res.status(400).json({ success: false, message: 'Instagram app not configured by admin.' });

    const userToken = await exchangeCode(appId, appSecret, code, redirectUri);

    const pagesResp = await axios.get(`${GRAPH}/me/accounts`, {
      params: { fields: 'id,name,access_token,instagram_business_account', access_token: userToken },
      timeout: 15000,
    });
    const pages = pagesResp.data?.data || [];
    const page = pages.find((p) => p.instagram_business_account) || pages[0];
    if (!page) return res.status(400).json({ success: false, message: 'No Facebook Page found. Link your Instagram to a Facebook Page first.' });

    const igAccountId = await saveIgToWorkspace(req.workspace, page.id, page.access_token);
    if (!igAccountId) return res.status(400).json({ success: false, message: 'No Instagram Business account is linked to your Page.' });
    res.json({ success: true, data: { connected: true, igAccountId, pageName: page.name } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }
};

// Manual: vendor pastes a Page ID + Page access token.
const connectManual = async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body;
    if (!pageId || !pageAccessToken) return res.status(400).json({ success: false, message: 'Page ID and Page access token are required.' });
    const igAccountId = await saveIgToWorkspace(req.workspace, pageId, pageAccessToken);
    if (!igAccountId) return res.status(400).json({ success: false, message: 'Could not find an Instagram Business account linked to this Page.' });
    res.json({ success: true, data: { connected: true, igAccountId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }
};

const disconnect = async (req, res) => {
  const ws = req.workspace;
  ws.metaChat = { ...(ws.metaChat || {}), igEnabled: false };
  await ws.save();
  res.json({ success: true });
};

// ---------- Connection diagnostics ----------
// Tells the client exactly why comments/DMs are not arriving instead of failing silently.
const diagnose = async (req, res) => {
  const ws = req.workspace;
  const mc = ws?.metaChat || {};
  const settings = await SystemSettings.findOne();
  const checks = [];
  const add = (key, label, ok, detail) => checks.push({ key, label, ok, detail: detail || '' });

  add('appCredentials', 'Facebook App ID & Secret configured', !!(settings?.facebook?.appId && settings?.facebook?.appSecret),
    settings?.facebook?.appId ? '' : 'Ask your administrator to set them in Admin - One Click Signup.');
  add('verifyToken', 'Webhook verify token set', !!verifyToken(settings), '');
  add('callbackUrl', 'Webhook callback URL', !!webhookCallbackUrl(settings).startsWith('http'), webhookCallbackUrl(settings));
  add('pageConnected', 'Facebook Page connected', !!mc.pageId, mc.pageId ? `Page ID ${mc.pageId}` : '');
  add('igAccount', 'Instagram professional account linked', !!mc.igAccountId, mc.igAccountId ? `IG ID ${mc.igAccountId}` : 'Link the Instagram account to your Facebook Page.');

  if (mc.pageId && mc.pageAccessToken) {
    try {
      const { data } = await axios.get(`${GRAPH}/${mc.pageId}/subscribed_apps`, { params: { access_token: mc.pageAccessToken }, timeout: 10000 });
      const fields = (data?.data || []).flatMap((a) => a.subscribed_fields || []);
      add('pageSubscription', 'Page subscribed to this app', fields.length > 0, fields.join(', '));
    } catch (e) {
      add('pageSubscription', 'Page subscribed to this app', false, e.response?.data?.error?.message || e.message);
    }
  } else {
    add('pageSubscription', 'Page subscribed to this app', false, 'Connect a Page first.');
  }

  if (settings?.facebook?.appId && settings?.facebook?.appSecret) {
    try {
      const { data } = await axios.get(`${GRAPH}/${settings.facebook.appId}/subscriptions`, {
        params: { access_token: `${settings.facebook.appId}|${settings.facebook.appSecret}` }, timeout: 10000,
      });
      const ig = (data?.data || []).find((s) => s.object === 'instagram');
      const fields = (ig?.fields || []).map((f) => f.name || f);
      add('appSubscription', 'App subscribed to Instagram webhooks', fields.includes('comments'), fields.join(', ') || 'No Instagram subscription found.');
    } catch (e) {
      add('appSubscription', 'App subscribed to Instagram webhooks', false, e.response?.data?.error?.message || e.message);
    }
  } else {
    add('appSubscription', 'App subscribed to Instagram webhooks', false, 'App ID / Secret missing.');
  }

  res.json({ success: true, data: { checks, ok: checks.every((c) => c.ok), lastSubscribe: mc.igSubscribeStatus || null } });
};

// Retry the webhook subscription without reconnecting the account.
const resubscribe = async (req, res) => {
  const ws = req.workspace;
  const mc = ws?.metaChat || {};
  if (!mc.pageId || !mc.pageAccessToken) {
    return res.status(400).json({ success: false, message: 'Connect a Facebook Page first.' });
  }
  const status = await subscribeIg(mc.pageId, mc.pageAccessToken);
  ws.metaChat = { ...mc, igSubscribeStatus: status };
  ws.markModified('metaChat');
  await ws.save();
  res.json({ success: status.pageSubscribed && status.appSubscribed, data: status, message: status.pageError || status.appError || 'Webhook subscription refreshed.' });
};

// Pull the existing Instagram threads (including message requests) into the inbox, because
// webhooks only cover what arrives after the account was connected.
const syncChats = async (req, res) => {
  const ws = req.workspace;
  const mc = ws?.metaChat || {};
  if (!mc.pageId || !mc.pageAccessToken) {
    return res.status(400).json({ success: false, message: 'Connect Instagram first.' });
  }

  const token = mc.pageAccessToken;
  const igId = String(mc.igAccountId || '');
  let threads = 0;
  let imported = 0;

  try {
    for (const folder of ['inbox', 'page_done', 'other']) {
      let url = `${GRAPH}/${mc.pageId}/conversations`;
      let params = {
        platform: 'instagram',
        folder,
        fields: 'participants,messages.limit(20){id,created_time,from,message}',
        limit: 10,
        access_token: token,
      };

      while (url) {
        let data;
        try {
          ({ data } = await axios.get(url, { params, timeout: 20000 }));
        } catch (e) {
          // Not every folder exists for every Page.
          break;
        }

        for (const thread of data?.data || []) {
          threads += 1;
          const other = (thread.participants?.data || []).find((p) => String(p.id) !== igId);
          if (!other) continue;

          const contact = await Contact.findOneAndUpdate(
            { workspace: ws._id, phone: String(other.id) },
            {
              $setOnInsert: { workspace: ws._id, phone: String(other.id), source: 'instagram', channel: 'instagram', countryCode: '' },
              ...(other.username || other.name ? { $set: { name: other.username || other.name } } : {}),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          const msgs = (thread.messages?.data || []).slice().reverse();
          const conversation = await Conversation.findOneAndUpdate(
            { workspace: ws._id, contact: contact._id },
            { workspace: ws._id, contact: contact._id, status: 'active', channel: 'instagram' },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          for (const m of msgs) {
            const direction = String(m.from?.id) === igId ? 'outbound' : 'inbound';
            const text = m.message || '[media]';
            const r = await Message.updateOne(
              { workspace: ws._id, waMessageId: m.id },
              {
                $setOnInsert: {
                  workspace: ws._id, conversation: conversation._id, contact: contact._id,
                  direction, type: 'text', text, status: 'delivered',
                  createdAt: m.created_time ? new Date(m.created_time) : new Date(),
                  metadata: { channel: 'instagram', source: 'instagram_sync' },
                },
              },
              { upsert: true }
            );
            if (r.upsertedCount) imported += 1;
          }

          const last = msgs[msgs.length - 1];
          if (last) {
            await Conversation.updateOne({ _id: conversation._id }, {
              lastMessage: {
                text: last.message || '[media]',
                timestamp: last.created_time ? new Date(last.created_time) : new Date(),
                direction: String(last.from?.id) === igId ? 'outbound' : 'inbound',
                type: 'text',
              },
            });
          }
        }

        url = data?.paging?.next || '';
        params = undefined;
      }
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.response?.data?.error?.message || err.message });
  }

  res.json({ success: true, data: { threads, imported }, message: `${threads} chats checked, ${imported} messages imported.` });
};

module.exports = {
  list, create, update, remove, logs, exportLogs, media,
  connectConfig, connectOneClick, connectManual, disconnect,
  diagnose, resubscribe, syncChats,
};
