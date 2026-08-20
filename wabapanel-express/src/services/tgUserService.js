// Personal Telegram channel (official MTProto API via GramJS).
// Login with phone + OTP (and 2FA password if set); the session string is
// persisted on the workspace so it reconnects after restarts.
const sessions = new Map(); // workspaceId -> { client, status, phone, error, pending }

// Default app credentials for QR login (Telegram Desktop's published credentials);
// can be overridden via env or per-workspace values.
const DEFAULT_API_ID = process.env.TG_API_ID || '2040';
const DEFAULT_API_HASH = process.env.TG_API_HASH || 'b18441a1ff607e10a989891a5462e627';

function getState(workspaceId) {
  const id = String(workspaceId);
  if (!sessions.has(id)) sessions.set(id, { client: null, status: 'disconnected', phone: '', username: '', error: '', pending: {} });
  return sessions.get(id);
}

function waitFor(state, kind) {
  state.status = kind === 'code' ? 'awaiting_code' : 'awaiting_password';
  return new Promise((resolve) => { state.pending[kind] = resolve; });
}

async function buildClient(sessionStr, apiId, apiHash) {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const client = new TelegramClient(new StringSession(sessionStr || ''), Number(apiId), String(apiHash), {
    connectionRetries: 5,
  });
  return client;
}

async function onConnected(workspaceId, state) {
  const Workspace = require('../models/Workspace');
  const me = await state.client.getMe();
  state.status = 'connected';
  state.phone = me.phone || state.phone;
  state.username = me.username || '';
  state.error = '';
  const sessionStr = state.client.session.save();
  await Workspace.findByIdAndUpdate(workspaceId, {
    'tgPersonal.enabled': true,
    'tgPersonal.status': 'connected',
    'tgPersonal.phone': state.phone,
    'tgPersonal.username': state.username,
    'tgPersonal.session': sessionStr,
  });
  attachIncoming(workspaceId, state);
  if (global.io) global.io.to(`workspace:${workspaceId}`).emit('tgpersonal:status', { status: 'connected', phone: state.phone });
  console.log(`[tgUser:${workspaceId}] connected as +${state.phone} @${state.username}`);
}

function attachIncoming(workspaceId, state) {
  if (state.handlerAttached) return;
  state.handlerAttached = true;
  const { NewMessage } = require('telegram/events');
  state.client.addEventHandler(async (event) => {
    try { await handleIncoming(workspaceId, state, event); }
    catch (e) { console.error(`[tgUser:${workspaceId}] incoming error:`, e.message); }
  }, new NewMessage({ incoming: true }));
}

async function handleIncoming(workspaceId, state, event) {
  const m = event.message;
  if (!m || m.out) return;
  if (!event.isPrivate) return; // personal 1-to-1 chats only
  const sender = await m.getSender();
  if (!sender || sender.className !== 'User' || sender.bot) return;

  const chatId = String(sender.id);
  const name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || `TG ${chatId}`;
  const text = m.message || '';
  const mediaType = m.photo ? 'image' : m.video ? 'video' : m.voice || m.audio ? 'audio' : m.document ? 'document' : null;
  if (!text && !mediaType) return;

  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');

  const contact = await Contact.findOneAndUpdate(
    { workspace: workspaceId, phone: chatId },
    { $set: { name, lastMessageAt: new Date() }, $setOnInsert: { workspace: workspaceId, phone: chatId, source: 'manual' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id, channel: 'telegram_personal' },
    {
      $set: { lastMessage: text || `[${mediaType}]`, lastMessageAt: new Date(), status: 'active' },
      $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'telegram_personal' },
      $inc: { unreadCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const waMessageId = `tgp_${m.id}`;
  if (await Message.findOne({ workspace: workspaceId, waMessageId })) return;
  const message = await Message.create({
    workspace: workspaceId, conversation: conversation._id, contact: contact._id,
    direction: 'inbound', type: mediaType || 'text', text: text || `[${mediaType} received]`,
    waMessageId, status: 'delivered',
    metadata: { source: 'telegram_personal' },
  });
  if (global.io) {
    const populated = await Conversation.findById(conversation._id)
      .populate({ path: 'contact', select: 'name phone avatar profileName' });
    global.io.to(`workspace:${workspaceId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', populated || conversation);
  }
  const Workspace = require('../models/Workspace');
  const workspace = await Workspace.findById(workspaceId);
  if (workspace && text) {
    require('./qrAutomation')
      .processIncoming({ workspace, conversation, contact, phone: chatId, text })
      .catch((e) => console.error(`[tgUser:${workspaceId}] automation error:`, e.message));
  }
}

// QR login: like Telegram Desktop — show a QR, user scans it from
// Telegram app > Settings > Devices > Link Desktop Device.
async function startQrLogin(workspaceId, opts = {}) {
  const id = String(workspaceId);
  const state = getState(id);
  if (state.status === 'connected') return getStatus(id);
  if (state.client) { try { await state.client.disconnect(); } catch { /* noop */ } }

  const apiId = opts.apiId || DEFAULT_API_ID;
  const apiHash = opts.apiHash || DEFAULT_API_HASH;
  const Workspace = require('../models/Workspace');
  await Workspace.findByIdAndUpdate(id, { 'tgPersonal.apiId': String(apiId), 'tgPersonal.apiHash': String(apiHash) });

  state.client = await buildClient('', apiId, apiHash);
  state.status = 'connecting';
  state.error = '';
  state.qr = '';
  state.pending = {};
  state.handlerAttached = false;

  await state.client.connect();
  const QRCode = require('qrcode');
  state.client.signInUserWithQrCode(
    { apiId: Number(apiId), apiHash: String(apiHash) },
    {
      qrCode: async (code) => {
        const token = Buffer.from(code.token).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        state.qr = await QRCode.toDataURL(`tg://login?token=${token}`, { margin: 1, width: 300 });
        state.status = 'qr';
        if (global.io) global.io.to(`workspace:${id}`).emit('tgpersonal:qr', { qr: state.qr });
      },
      password: async () => { state.qr = ''; return waitFor(state, 'password'); },
      onError: (err) => {
        console.error(`[tgUser:${id}] qr login error:`, err.message);
        state.status = 'error';
        state.error = err.message;
        state.qr = '';
        return true;
      },
    }
  ).then(() => onConnected(id, state)).catch((e) => {
    if (state.status !== 'connected') { state.status = 'error'; state.error = e.message; state.qr = ''; }
  });

  // wait briefly so the first QR token is ready
  for (let i = 0; i < 40 && state.status === 'connecting'; i++) await new Promise(r => setTimeout(r, 250));
  return getStatus(id);
}

// Start login: sends the OTP to the user's Telegram/phone.
async function startLogin(workspaceId, { apiId, apiHash, phone }) {
  apiId = apiId || DEFAULT_API_ID;
  apiHash = apiHash || DEFAULT_API_HASH;
  const id = String(workspaceId);
  const state = getState(id);
  if (state.status === 'connected') return getStatus(id);
  if (state.client) { try { await state.client.disconnect(); } catch { /* noop */ } }

  const Workspace = require('../models/Workspace');
  await Workspace.findByIdAndUpdate(id, { 'tgPersonal.apiId': String(apiId), 'tgPersonal.apiHash': String(apiHash), 'tgPersonal.phone': String(phone) });

  state.client = await buildClient('', apiId, apiHash);
  state.phone = String(phone).replace(/[^\d+]/g, '');
  state.status = 'connecting';
  state.error = '';
  state.handlerAttached = false;

  state.client.start({
    phoneNumber: async () => state.phone,
    phoneCode: async () => waitFor(state, 'code'),
    password: async () => waitFor(state, 'password'),
    onError: (err) => {
      console.error(`[tgUser:${id}] login error:`, err.message);
      state.status = 'error';
      state.error = err.message;
      return true; // stop retrying
    },
  }).then(() => onConnected(id, state)).catch((e) => {
    state.status = 'error';
    state.error = e.message;
  });

  // wait briefly so the status reflects 'awaiting_code' once the OTP is sent
  for (let i = 0; i < 40 && state.status === 'connecting'; i++) await new Promise(r => setTimeout(r, 250));
  return getStatus(id);
}

function submitCode(workspaceId, code) {
  const state = getState(workspaceId);
  if (!state.pending.code) throw new Error('No pending code request — click Connect first');
  const resolve = state.pending.code;
  delete state.pending.code;
  state.status = 'verifying';
  resolve(String(code).trim());
}

function submitPassword(workspaceId, password) {
  const state = getState(workspaceId);
  if (!state.pending.password) throw new Error('No pending password request');
  const resolve = state.pending.password;
  delete state.pending.password;
  state.status = 'verifying';
  resolve(String(password));
}

async function getStatus(workspaceId) {
  const state = getState(workspaceId);
  return { status: state.status, phone: state.phone, username: state.username, error: state.error, qr: state.status === 'qr' ? (state.qr || '') : '' };
}

// Resolves a chat target that may be a Telegram user id, a @username, or a phone number.
async function resolveEntity(client, chatId) {
  const bigInt = require('big-integer');
  const raw = String(chatId).trim();
  try { return await client.getInputEntity(raw.startsWith('@') ? raw : bigInt(raw)); } catch { /* try below */ }
  if (/^\+?\d{7,15}$/.test(raw)) {
    const phone = raw.startsWith('+') ? raw : '+' + raw;
    try { return await client.getInputEntity(phone); } catch { /* try below */ }
    const { Api } = require('telegram');
    const res = await client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({ clientId: bigInt(0), phone, firstName: phone, lastName: '' })],
    }));
    if (res.users && res.users.length) return res.users[0];
    throw new Error(`No Telegram account found for ${phone} (the number may not be on Telegram, or its privacy settings hide it)`);
  }
  throw new Error(`Could not find Telegram chat "${raw}"`);
}

async function send(workspaceId, chatId, { type = 'text', text, media }) {
  const id = String(workspaceId);
  const state = getState(id);
  if (!state.client || state.status !== 'connected') throw new Error('Personal Telegram is not connected (connect it on the Channels page)');
  const entity = await resolveEntity(state.client, chatId);
  if (['image', 'video', 'audio', 'document'].includes(type) && media?.url) {
    const axios = require('axios');
    const { CustomFile } = require('telegram/client/uploads');
    const r = await axios.get(media.url, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(r.data);
    const name = media.filename || media.url.split('/').pop().split('?')[0] || 'file';
    const file = new CustomFile(name, buf.length, '', buf);
    const sent = await state.client.sendFile(entity, { file, caption: media.caption || text || '', forceDocument: type === 'document' });
    return { id: sent.id };
  }
  const sent = await state.client.sendMessage(entity, { message: text || '' });
  return { id: sent.id };
}

async function disconnect(workspaceId) {
  const id = String(workspaceId);
  const state = getState(id);
  if (state.client) {
    try { await state.client.invoke(new (require('telegram').Api.auth.LogOut)()); } catch { /* noop */ }
    try { await state.client.disconnect(); } catch { /* noop */ }
  }
  sessions.delete(id);
  const Workspace = require('../models/Workspace');
  await Workspace.findByIdAndUpdate(id, { 'tgPersonal.enabled': false, 'tgPersonal.status': 'disconnected', 'tgPersonal.session': '' });
}

// Reconnect saved sessions on server start.
async function restoreAll() {
  const Workspace = require('../models/Workspace');
  const list = await Workspace.find({ 'tgPersonal.enabled': true, 'tgPersonal.session': { $ne: '' } }).select('tgPersonal');
  for (const ws of list) {
    const id = String(ws._id);
    try {
      const state = getState(id);
      if (state.client) continue;
      state.client = await buildClient(ws.tgPersonal.session, ws.tgPersonal.apiId, ws.tgPersonal.apiHash);
      state.phone = ws.tgPersonal.phone || '';
      state.status = 'connecting';
      await state.client.connect();
      if (await state.client.isUserAuthorized()) await onConnected(id, state);
      else {
        state.status = 'disconnected';
        await Workspace.findByIdAndUpdate(id, { 'tgPersonal.enabled': false, 'tgPersonal.status': 'logged_out' });
      }
    } catch (e) { console.error(`[tgUser:${id}] restore failed:`, e.message); }
  }
}

module.exports = { startLogin, startQrLogin, submitCode, submitPassword, getStatus, send, disconnect, restoreAll };
