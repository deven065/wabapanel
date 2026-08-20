const path = require('path');
const fs = require('fs');

// WhatsApp by QR channel (unofficial, WhatsApp Web protocol via Baileys).
// One socket per workspace. Includes a safety engine: warm-up daily caps,
// human-like random delays and typing presence to reduce ban risk.

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'wa_sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Warm-up schedule: max outbound messages per day since first connect.
const WARMUP_CAPS = [25, 40, 60, 90, 130, 180, 250, 350, 450, 600, 750, 900, 1000, 1000];
const MIN_DELAY_MS = 5000;
const MAX_DELAY_MS = 15000;

const sessions = new Map(); // workspaceId -> { sock, status, qr, phone, queue, sending }

function getState(workspaceId) {
  const id = String(workspaceId);
  if (!sessions.has(id)) sessions.set(id, { sock: null, status: 'disconnected', qr: null, phone: '', queue: [], sending: false, lidMap: {}, nameMap: {}, groupMap: {}, msgStore: new Map() });
  return sessions.get(id);
}

function dayCap(warmupStartedAt) {
  if (!warmupStartedAt) return WARMUP_CAPS[0];
  const days = Math.floor((Date.now() - new Date(warmupStartedAt).getTime()) / 86400000);
  return WARMUP_CAPS[Math.min(days, WARMUP_CAPS.length - 1)];
}

// --- Bad-MAC / decrypt-failure loop breaker ---
// A corrupt QR signal session keeps failing to decrypt incoming messages
// (Baileys marks them CIPHERTEXT and asks the phone for resends). Left alone
// this pins a CPU core and floods logs. When failures cross a threshold within
// a short window we clear ONLY this workspace's signal keys and ask the user to
// re-scan. Chat history, contacts and other channels are never touched, and a
// healthy session (which resets the counter on every successful connect) never
// trips this.
const DECRYPT_FAIL_LIMIT = 30;
const DECRYPT_FAIL_WINDOW_MS = 2 * 60 * 1000;

async function resetSessionForRescan(id, state) {
  if (state.rescanResetting) return;
  state.rescanResetting = true;
  console.log(`[waQr:${id}] decrypt-failure loop (x${state.decryptFailCount}) — clearing session keys, re-scan needed`);
  try { if (state.sock) { try { state.sock.ev.removeAllListeners(); } catch (e) { /* noop */ } try { state.sock.end(); } catch (e) { /* noop */ } } } catch (e) { /* noop */ }
  state.sock = null;
  state.status = 'rescan_needed';
  state.qr = null;
  state.decryptFailCount = 0;
  state.decryptFailFirst = 0;
  try { fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true }); } catch (e) { /* noop */ }
  try {
    const Workspace = require('../models/Workspace');
    await Workspace.findByIdAndUpdate(id, { 'waQr.status': 'rescan_needed' }).catch(() => {});
  } catch (e) { /* noop */ }
  if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'rescan_needed', message: 'Session error - please re-scan the QR code' });
  setTimeout(() => { state.rescanResetting = false; startSession(id).catch(() => {}); }, 3000);
}

function noteDecryptFailure(id, state) {
  const now = Date.now();
  if (!state.decryptFailFirst || now - state.decryptFailFirst > DECRYPT_FAIL_WINDOW_MS) {
    state.decryptFailFirst = now;
    state.decryptFailCount = 0;
  }
  state.decryptFailCount = (state.decryptFailCount || 0) + 1;
  if (now - (state.decryptFailLastLog || 0) > 15000) {
    state.decryptFailLastLog = now;
    console.log(`[waQr:${id}] decrypt failure x${state.decryptFailCount} in window`);
  }
  if (state.decryptFailCount >= DECRYPT_FAIL_LIMIT && !state.rescanResetting) {
    resetSessionForRescan(id, state).catch(() => {});
  }
}

async function startSession(workspaceId) {
  const id = String(workspaceId);
  const state = getState(id);
  if (state.sock) return state;

  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const pino = require('pino');
  const authDir = path.join(SESSIONS_DIR, id);
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['WabaPanel', 'Chrome', '120.0'],
    syncFullHistory: true,
    // Keep this linked device "offline" so the phone stays the primary receiver.
    // If the desktop advertises itself online, the phone routes messages to it;
    // when the desktop intermittently fails to decrypt, both sides get stuck on
    // "Waiting for this message". Staying offline lets the phone deliver reliably
    // while we still receive messages via messages.upsert.
    markOnlineOnConnect: false,
    // Ask promptly for a resend when an incoming message can't be decrypted.
    retryRequestDelayMs: 250,
    // When a recipient can't decrypt a message their phone asks for a resend;
    // without this the message stays stuck at "Waiting for this message".
    getMessage: async (key) => state.msgStore.get(key?.id)?.message || undefined,
  });
  state.sock = sock;
  state.status = 'connecting';

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection || qr) console.log(`[waQr:${id}] connection=${connection || 'qr'} code=${lastDisconnect?.error?.output?.statusCode || ''}`);
    if (qr) {
      state.qr = qr;
      state.status = 'qr';
      if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'qr' });
    }
    if (connection === 'open') {
      state.qr = null;
      state.status = 'connected';
      state.decryptFailCount = 0;
      state.decryptFailFirst = 0;
      state.rescanResetting = false;
      state.phone = (sock.user?.id || '').split(':')[0].split('@')[0];
      const Workspace = require('../models/Workspace');
      const ws = await Workspace.findById(id);
      if (ws) {
        ws.waQr = ws.waQr || {};
        ws.waQr.enabled = true;
        ws.waQr.status = 'connected';
        ws.waQr.phone = state.phone;
        if (!ws.waQr.warmupStartedAt) ws.waQr.warmupStartedAt = new Date();
        await ws.save();
      }
      if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'connected', phone: state.phone });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      state.sock = null;
      if (code === DisconnectReason.loggedOut) {
        state.status = 'disconnected';
        state.qr = null;
        try { fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true }); } catch (e) { /* noop */ }
        const Workspace = require('../models/Workspace');
        await Workspace.findByIdAndUpdate(id, { 'waQr.enabled': false, 'waQr.status': 'logged_out' }).catch(() => {});
        await purgeQrData(id);
        if (global.io) global.io.to(`workspace:${id}`).emit('waqr:status', { status: 'logged_out' });
      } else {
        state.status = 'reconnecting';
        setTimeout(() => startSession(id).catch(() => {}), 5000);
      }
    }
  });

  // Track LID (anonymous jid) -> phone-number jid mappings, and the
  // phone's saved / profile name so the inbox shows a name, not a number.
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts || []) {
      if (c.lid && c.id && String(c.id).endsWith('@s.whatsapp.net')) state.lidMap[c.lid] = c.id;
      recordContactName(state, c);
    }
  });
  sock.ev.on('contacts.update', (contacts) => {
    for (const c of contacts || []) recordContactName(state, c);
  });
  const recordGroups = (groups) => {
    for (const g of groups || []) { if (g && g.id && g.subject) state.groupMap[g.id] = g.subject; }
  };
  sock.ev.on('groups.upsert', recordGroups);
  sock.ev.on('groups.update', recordGroups);

  // Presence (online / last seen) for open 1:1 chats — QR/Web WhatsApp only.
  sock.ev.on('presence.update', ({ id: jid, presences }) => {
    try {
      if (!global.io || !presences || String(jid).endsWith('@g.us')) return;
      const phone = String(jid).replace(/@.*/, '');
      const pres = presences[jid] || Object.values(presences)[0];
      if (!pres) return;
      const status = pres.lastKnownPresence || '';
      const online = status === 'available' || status === 'composing' || status === 'recording';
      global.io.to(`workspace:${id}`).emit('waqr:presence', { phone, online, status, lastSeen: pres.lastSeen || null });
    } catch (e) { /* noop */ }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const m of messages) {
      if (m && m.messageStubType === 2) { noteDecryptFailure(id, state); continue; } // CIPHERTEXT = failed to decrypt
      try { await handleIncoming(id, m, state); } catch (e) { console.log(`[waQr:${id}] incoming error:`, e.message); }
    }
  });

  // Delivery/read receipts for outbound messages - updates status so the panel
  // shows sent/delivered/read, and logs acks (useful to spot a number that is
  // connected but whose messages never actually deliver, i.e. a restricted number).
  sock.ev.on('messages.update', async (updates) => {
    const STATUS = { 0: 'failed', 1: 'pending', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };
    for (const u of updates || []) {
      const st = u.update && u.update.status;
      if (st === undefined || st === null) continue;
      const label = STATUS[st] || String(st);
      console.log(`[waQr:${id}] ack ${u.key && u.key.id} status=${st}(${label})`);
      try {
        const Message = require('../models/Message');
        const msg = await Message.findOneAndUpdate({ waMessageId: `qr_${u.key && u.key.id}` }, { status: label }, { new: true });
        if (msg && global.io) global.io.to(`workspace:${id}`).emit('message_status', { messageId: msg._id, conversationId: msg.conversation, status: label });
      } catch (e) { /* noop */ }
    }
  });

  // Import existing chats/messages when the account first pairs
  sock.ev.on('messaging-history.set', async (ev) => {
    try {
      for (const c of ev.contacts || []) {
        if (c.lid && c.id && String(c.id).endsWith('@s.whatsapp.net')) state.lidMap[c.lid] = c.id;
        recordContactName(state, c);
      }
      for (const ch of ev.chats || []) {
        const lid = ch.lidJid || (String(ch.id || '').endsWith('@lid') ? ch.id : null);
        const pn = ch.pnJid || null;
        if (lid && pn) state.lidMap[lid] = pn;
        if (String(ch.id || '').endsWith('@g.us') && (ch.name || ch.subject)) state.groupMap[ch.id] = ch.name || ch.subject;
      }
      await importHistory(id, ev.messages || [], state);
    } catch (e) { console.log(`[waQr:${id}] history error:`, e.message); }
  });

  return state;
}

// Resolves the contact phone number from a message key. WhatsApp may use
// anonymous LID jids; prefer the real phone-number jid when available.
function resolvePhone(key, lidMap) {
  let jid = key.remoteJid || '';
  if (jid.endsWith('@lid')) jid = key.remoteJidAlt || key.senderPn || (lidMap && lidMap[jid]) || '';
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  const phone = jid.split('@')[0].split(':')[0];
  if (!phone || phone === '0' || phone.length < 7) return null; // skip WhatsApp system accounts
  return phone;
}

// Record a contact's saved (address-book) or profile name from Baileys events.
function recordContactName(state, c) {
  if (!c || !c.id || !String(c.id).endsWith('@s.whatsapp.net')) return;
  const ph = String(c.id).split('@')[0].split(':')[0];
  const nm = c.name || c.notify || c.verifiedName;
  if (ph && nm) state.nameMap[ph] = nm;
}

// Prefer the phone's saved/profile name over the raw number.
function resolveName(phone, pushName, nameMap) {
  return (nameMap && nameMap[phone]) || pushName || `WA ${phone}`;
}

// Group subject name, cached; falls back to a metadata fetch then a short id.
async function getGroupName(sock, groupMap, jid) {
  if (groupMap && groupMap[jid]) return groupMap[jid];
  try {
    const md = sock && (await sock.groupMetadata(jid));
    if (md && md.subject) { groupMap[jid] = md.subject; return md.subject; }
  } catch (e) { /* noop */ }
  return `Group ${String(jid).split('@')[0].slice(-6)}`;
}

function unwrapMsg(msg) {
  if (!msg || typeof msg !== 'object') return msg || {};
  return msg.ephemeralMessage?.message
    || msg.viewOnceMessage?.message
    || msg.viewOnceMessageV2?.message
    || msg.viewOnceMessageV2Extension?.message
    || msg.documentWithCaptionMessage?.message
    || msg.editedMessage?.message
    || msg;
}

function extractText(raw) {
  const msg = unwrapMsg(raw);
  const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
  if (poll) {
    const opts = (poll.options || []).map((o) => '\u2022 ' + (o.optionName || o.name || o)).filter(Boolean).join('\n');
    return '\uD83D\uDCCA Poll: ' + (poll.name || '') + (opts ? '\n' + opts : '');
  }
  if (msg.locationMessage) {
    const l = msg.locationMessage;
    return '\uD83D\uDCCD Location' + (l.name ? ': ' + l.name : '') + ((l.degreesLatitude || l.degreesLongitude) ? ` (${l.degreesLatitude}, ${l.degreesLongitude})` : '');
  }
  if (msg.liveLocationMessage) return '\uD83D\uDCCD Live location';
  if (msg.contactMessage) return '\uD83D\uDC64 ' + (msg.contactMessage.displayName || 'Contact');
  if (msg.contactsArrayMessage) return '\uD83D\uDC64 ' + ((msg.contactsArrayMessage.contacts || []).map((c) => c.displayName).filter(Boolean).join(', ') || 'Contacts');
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption
    || msg.documentMessage?.caption || msg.documentMessage?.fileName
    || msg.buttonsResponseMessage?.selectedDisplayText || msg.templateButtonReplyMessage?.selectedDisplayText
    || msg.listResponseMessage?.title || '';
}

// Id of a tapped button/list row (native-flow, template or list replies).
function extractButtonId(msg) {
  if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
  if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
  const params = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (params) { try { return JSON.parse(params).id || ''; } catch { return ''; } }
  return '';
}

async function importHistory(workspaceId, messages, state) {
  const lidMap = state.lidMap;
  const nameMap = state.nameMap;
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  let imported = 0;
  const skips = { group: 0, noPhone: 0, noText: 0, dupe: 0 };
  for (const m of messages) {
    if (imported >= 500) break;
    const jid = m.key?.remoteJid || '';
    if (jid === 'status@broadcast') { skips.group++; continue; }
    const isGroup = jid.endsWith('@g.us');
    let phone, name, contactExtra;
    if (isGroup) {
      phone = jid;
      name = await getGroupName(state.sock, state.groupMap, jid);
      contactExtra = { isGroup: true, waId: jid };
    } else {
      phone = resolvePhone(m.key, lidMap);
      if (!phone) { skips.noPhone++; continue; }
      name = resolveName(phone, m.pushName, nameMap);
      contactExtra = {};
    }
    const msg = m.message || {};
    let text = extractText(msg);
    if (!text) { skips.noText++; continue; }
    if (isGroup && !m.key.fromMe) {
      const sp = String(m.key.participant || m.participant || '').split('@')[0].split(':')[0];
      const sn = resolveName(sp, m.pushName, nameMap);
      if (sn) text = `~${sn}: ${text}`;
    }
    const waMessageId = `qr_${m.key.id}`;
    if (await Message.findOne({ workspace: workspaceId, waMessageId })) { skips.dupe++; continue; }
    const ts = new Date((Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000);
    const contact = await Contact.findOneAndUpdate(
      { workspace: workspaceId, phone },
      { $setOnInsert: { workspace: workspaceId, phone, name, source: 'whatsapp_qr', ...contactExtra } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr' },
      { $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr', status: 'active' }, $max: { lastMessageAt: ts } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const doc = await Message.create({
      workspace: workspaceId, conversation: conversation._id, contact: contact._id,
      direction: m.key.fromMe ? 'outbound' : 'inbound', type: 'text', text,
      waMessageId, status: m.key.fromMe ? 'sent' : 'delivered',
      metadata: { source: 'whatsapp_qr', history: true },
    });
    await Message.updateOne({ _id: doc._id }, { $set: { createdAt: ts } }, { timestamps: false });
    await Conversation.updateOne(
      { _id: conversation._id, $or: [{ lastMessageAt: { $lte: ts } }, { lastMessageAt: null }] },
      { $set: { lastMessage: text.slice(0, 200), lastMessageAt: ts } }
    );
    imported++;
  }
  console.log(`[waQr:${workspaceId}] history import: ${imported} of ${messages.length} messages (skips: ${JSON.stringify(skips)})`);
  if (imported > 0 && global.io) {
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', {});
  }
}

async function handleIncoming(workspaceId, m, state) {
  const lidMap = state.lidMap;
  const nameMap = state.nameMap;
  const jid = m.key.remoteJid || '';
  if (jid === 'status@broadcast') return;
  const isGroup = jid.endsWith('@g.us');
  const outbound = !!m.key.fromMe;
  if (outbound && !isGroup) return; // 1:1 outbound is recorded by the send path
  const phone = isGroup ? jid : resolvePhone(m.key, lidMap);
  if (!phone) { console.log(`[waQr:${workspaceId}] skip incoming, unresolved key:`, JSON.stringify(m.key)); return; }
  const msg = unwrapMsg(m.message || {});
  let text = extractText(msg);
  const buttonId = extractButtonId(msg);
  const mediaType = msg.imageMessage ? 'image' : msg.videoMessage ? 'video' : msg.audioMessage ? 'audio' : msg.documentMessage ? 'document' : msg.stickerMessage ? 'sticker' : null;
  if (!text && !buttonId && !mediaType) return;
  if (isGroup && !outbound && text) {
    const sp = String(m.key.participant || m.participant || '').split('@')[0].split(':')[0];
    const sn = resolveName(sp, m.pushName, nameMap);
    if (sn) text = `~${sn}: ${text}`;
  }

  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const name = isGroup ? await getGroupName(state.sock, state.groupMap, jid) : resolveName(phone, m.pushName, nameMap);
  const hasRealName = name !== `WA ${phone}`;
  let contactUpdate;
  if (isGroup) {
    contactUpdate = { $set: { workspace: workspaceId, phone, name, lastMessageAt: new Date() }, $setOnInsert: { source: 'whatsapp_qr', isGroup: true, waId: jid } };
  } else {
    contactUpdate = hasRealName
      ? { $set: { workspace: workspaceId, phone, name, source: 'whatsapp_qr', lastMessageAt: new Date() } }
      : { $set: { workspace: workspaceId, phone, source: 'whatsapp_qr', lastMessageAt: new Date() }, $setOnInsert: { name } };
  }
  const contact = await Contact.findOneAndUpdate(
    { workspace: workspaceId, phone },
    contactUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // WhatsApp profile photo (DP): only Web/QR exposes it. Fetch once when missing.
  if (!isGroup && !contact.avatar && state.sock) {
    try {
      const ppUrl = await state.sock.profilePictureUrl(`${phone}@s.whatsapp.net`, 'image').catch(() => null);
      if (ppUrl) { contact.avatar = ppUrl; await contact.save(); }
    } catch (e) { /* noop */ }
  }

  const convUpdate = {
    $set: { lastMessage: text || `[${mediaType}]`, lastMessageAt: new Date(), status: 'active' },
    $setOnInsert: { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr' },
  };
  if (!outbound) convUpdate.$inc = { unreadCount: 1 };
  const conversation = await Conversation.findOneAndUpdate(
    { workspace: workspaceId, contact: contact._id, channel: 'whatsapp_qr' },
    convUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const waMessageId = `qr_${m.key.id}`;
  if (await Message.findOne({ workspace: workspaceId, waMessageId })) return;
  const message = await Message.create({
    workspace: workspaceId, conversation: conversation._id, contact: contact._id,
    direction: outbound ? 'outbound' : 'inbound', type: mediaType || 'text', text: text || (buttonId ? '[button reply]' : `[${mediaType} received]`),
    waMessageId, status: outbound ? 'sent' : 'delivered',
    metadata: { source: 'whatsapp_qr' },
  });

  if (global.io) {
    global.io.to(`workspace:${workspaceId}`).emit('new_message', { message, conversationId: conversation._id });
    global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
  }
  if (!outbound) { try { require('../controllers/pushController').notifyWorkspace(workspaceId, { title: (contact && (contact.name || contact.phone)) || 'New message', body: (text || '[media]').slice(0, 120), url: '/client/chat', tag: String(conversation._id) }); } catch (e) { /* noop */ } }
  const Workspace = require('../models/Workspace');
  const workspace = await Workspace.findById(workspaceId);
  if (workspace) {
    if (!outbound) require('./apiWebhookDispatcher').dispatch(workspace, 'message.received', {
      conversation_id: conversation._id, contact_id: contact._id, channel: 'whatsapp_qr', text: text || '',
    }).catch(() => {});
    if (!isGroup && !outbound && (text || buttonId)) {
      // Opt-out / opt-in (STOP / START) first, so an unsubscribing contact gets
      // the confirmation instead of an automation reply.
      let optOutHandled = false;
      try {
        const oo = await require('./optOut').handleInbound({
          workspace,
          contact,
          text: String(text || '').toLowerCase().trim(),
          wa: { sendTextMessage: (to, body) => sendMessage(workspaceId, to, { type: 'text', text: body }) },
        });
        optOutHandled = oo.changed;
        if (oo.changed && global.io) {
          global.io.to(`workspace:${workspaceId}`).emit('conversation_updated', conversation);
        }
      } catch (e) { console.error(`[waQr:${workspaceId}] optOut:`, e.message); }
      if (!optOutHandled) {
        require('./qrAutomation')
          .processIncoming({ workspace, conversation, contact, phone, text, buttonId })
          .catch((e) => console.error(`[waQr:${workspaceId}] automation error:`, e.message));
      }
    }
  }
}

// Safety engine: enforce warm-up daily cap and queue sends with random delays.
async function checkAndCountSend(workspaceId) {
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(workspaceId);
  if (!ws || !ws.waQr?.enabled) throw new Error('WhatsApp by QR is not connected');
  ws.waQr = ws.waQr || {};
  const today = new Date().toISOString().slice(0, 10);
  if (ws.waQr.sentDate !== today) { ws.waQr.sentDate = today; ws.waQr.sentToday = 0; }
  // A custom daily limit (set by the user at their own risk) overrides the warm-up cap
  const cap = ws.waQr.dailyLimit > 0 ? ws.waQr.dailyLimit : dayCap(ws.waQr.warmupStartedAt);
  if ((ws.waQr.sentToday || 0) >= cap) {
    throw new Error(`Daily safety limit reached (${cap} messages). Limit increases automatically as the number warms up.`);
  }
  ws.waQr.sentToday = (ws.waQr.sentToday || 0) + 1;
  await ws.save();
}

function processQueue(workspaceId) {
  const state = getState(workspaceId);
  if (state.sending || state.queue.length === 0) return;
  state.sending = true;
  const job = state.queue.shift();
  const run = async () => {
    try {
      const sock = state.sock;
      if (!sock || state.status !== 'connected') throw new Error('WhatsApp by QR is not connected');
      const jid = String(job.phone).endsWith('@g.us') ? String(job.phone) : (String(job.phone).replace(/\D/g, '') + '@s.whatsapp.net');
      // Human-like: show typing briefly before sending
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) { /* noop */ }
      // Native-flow buttons break delivery on some numbers (recipient sees
      // "Waiting for this message"), so deliver as plain text (numbered
      // options) which works everywhere.
      const result = job.buttonsPayload
        ? await sock.sendMessage(jid, { text: job.buttonsPayload.text })
        : await sock.sendMessage(jid, job.content, job.options || {});
      if (result?.key?.id && result.message) {
        state.msgStore.set(result.key.id, result);
        if (state.msgStore.size > 500) state.msgStore.delete(state.msgStore.keys().next().value);
      }
      job.resolve(result);
    } catch (e) {
      job.reject(e);
    } finally {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
      setTimeout(() => { state.sending = false; processQueue(workspaceId); }, state.queue.length > 0 ? delay : 0);
    }
  };
  run();
}

// Unofficial native-flow buttons (the trick other QR panels use). Renders as
// real tappable buttons on most devices; the numbered-text fallback is already
// part of the body text for devices that don't render it.
async function sendNativeButtons(sock, jid, { text, footer, buttons }) {
  const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
  const msg = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: text || '' }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
          header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: (buttons || []).slice(0, 10).map((b) => ({
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: String(b.title || '').slice(0, 25), id: b.id }),
            })),
          }),
        }),
      },
    },
  }, { userJid: sock.user?.id });
  await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    // "biz" node makes phones render native-flow buttons from non-business accounts
    additionalNodes: [{
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { name: 'quick_reply' } }],
      }],
    }],
  });
  return msg;
}

// Public send API. Returns the Baileys send result.
async function sendMessage(workspaceId, phone, { type = 'text', text, media, buttons, footer, contextMessageId, contextFromMe, contextText }) {
  const id = String(workspaceId);
  const state = getState(id);
  if (!state.sock || state.status !== 'connected') throw new Error('WhatsApp by QR is not connected (scan the QR on the Channels page)');
  await checkAndCountSend(id);

  let content;
  if (type === 'image') content = { image: { url: media.url }, caption: media.caption || text || '' };
  else if (type === 'video') content = { video: { url: media.url }, caption: media.caption || text || '' };
  else if (type === 'audio') content = { audio: { url: media.url }, mimetype: 'audio/mp4' };
  else if (type === 'document') content = { document: { url: media.url }, fileName: media.filename || 'document', caption: media.caption || '' };
  else content = { text: text || '' };

  const options = {};
  if (contextMessageId) {
    const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
    options.quoted = { key: { remoteJid: jid, fromMe: !!contextFromMe, id: contextMessageId }, message: { conversation: contextText || '' } };
  }
  return new Promise((resolve, reject) => {
    if (type === 'buttons') state.queue.push({ phone, buttonsPayload: { text: text || '', footer: footer || '', buttons: buttons || [] }, resolve, reject });
    else state.queue.push({ phone, content, options, resolve, reject });
    processQueue(id);
  });
}

async function getStatus(workspaceId) {
  const id = String(workspaceId);
  const state = getState(id);
  let qrDataUrl = null;
  if (state.qr) {
    const QRCode = require('qrcode');
    qrDataUrl = await QRCode.toDataURL(state.qr, { width: 280, margin: 1 });
  }
  const Workspace = require('../models/Workspace');
  const ws = await Workspace.findById(id).lean();
  const waQr = (ws && ws.waQr) || {};
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = waQr.sentDate === today ? (waQr.sentToday || 0) : 0;
  return {
    status: state.status,
    phone: state.phone || waQr.phone || '',
    qr: qrDataUrl,
    warmupStartedAt: waQr.warmupStartedAt || null,
    warmupDay: waQr.warmupStartedAt ? Math.min(Math.floor((Date.now() - new Date(waQr.warmupStartedAt).getTime()) / 86400000) + 1, WARMUP_CAPS.length) : 1,
    warmupTotalDays: WARMUP_CAPS.length,
    todayCap: waQr.dailyLimit > 0 ? waQr.dailyLimit : dayCap(waQr.warmupStartedAt),
    customLimit: waQr.dailyLimit || 0,
    sentToday,
  };
}

// Permanently delete all QR-channel data (chats, messages, contacts) for a
// workspace. Called only on a real logout / manual disconnect — never on a
// transient reconnect — so a brief network drop never wipes data. Contacts that
// still have a conversation on any other channel (Cloud API, etc.) are kept.
async function purgeQrData(workspaceId) {
  const mongoose = require('mongoose');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  const Contact = require('../models/Contact');
  try {
    const convs = await Conversation.find({ workspace: workspaceId, channel: 'whatsapp_qr' }).select('_id contact').lean();
    if (!convs.length) return;
    const convIds = convs.map(c => c._id);
    const contactIds = [...new Set(convs.map(c => c.contact && String(c.contact)).filter(Boolean))]
      .map(s => new mongoose.Types.ObjectId(s));
    const msgRes = await Message.deleteMany({ workspace: workspaceId, conversation: { $in: convIds } });
    await Conversation.deleteMany({ _id: { $in: convIds } });
    let contactsDeleted = 0;
    for (const cid of contactIds) {
      const remaining = await Conversation.countDocuments({ workspace: workspaceId, contact: cid });
      if (remaining === 0) { await Contact.deleteOne({ _id: cid, workspace: workspaceId }); contactsDeleted++; }
    }
    console.log(`[waQr:${workspaceId}] purged QR data on disconnect: conversations=${convIds.length} messages=${msgRes.deletedCount || 0} contacts=${contactsDeleted}`);
  } catch (e) {
    console.error(`[waQr:${workspaceId}] purgeQrData failed:`, e.message);
  }
}

async function disconnect(workspaceId) {
  const id = String(workspaceId);
  const state = getState(id);
  try { if (state.sock) await state.sock.logout(); } catch (e) { /* noop */ }
  try { if (state.sock) state.sock.end(); } catch (e) { /* noop */ }
  state.sock = null;
  state.status = 'disconnected';
  state.qr = null;
  try { fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true }); } catch (e) { /* noop */ }
  const Workspace = require('../models/Workspace');
  await Workspace.findByIdAndUpdate(id, { 'waQr.enabled': false, 'waQr.status': 'disconnected' }).catch(() => {});
  await purgeQrData(id);
}

// Set a custom daily send limit (0 = automatic warm-up schedule).
async function setDailyLimit(workspaceId, limit) {
  const Workspace = require('../models/Workspace');
  const value = Math.max(0, Math.min(2000, parseInt(limit, 10) || 0));
  await Workspace.findByIdAndUpdate(workspaceId, { 'waQr.dailyLimit': value });
  return value;
}

// Restart the socket without logging out. WhatsApp re-delivers messages
// received while the server was offline, like reopening WhatsApp Web.
async function syncSession(workspaceId) {
  const id = String(workspaceId);
  const state = getState(id);
  try { if (state.sock) state.sock.end(); } catch (e) { /* noop */ }
  state.sock = null;
  state.status = 'reconnecting';
  return startSession(id);
}

// Restore sessions for previously-connected workspaces on boot.
async function restoreAll() {
  const Workspace = require('../models/Workspace');
  const list = await Workspace.find({ 'waQr.enabled': true }).select('_id').lean();
  for (const ws of list) {
    const authDir = path.join(SESSIONS_DIR, String(ws._id));
    if (fs.existsSync(authDir)) startSession(String(ws._id)).catch(() => {});
  }
}

async function subscribePresence(workspaceId, phone) {
  const id = String(workspaceId);
  const state = getState(id);
  if (!state.sock || state.status !== 'connected') return false;
  const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
  try { await state.sock.presenceSubscribe(jid); return true; } catch (e) { return false; }
}

async function sendReaction(workspaceId, phone, targetId, emoji, fromMe) {
  const id = String(workspaceId);
  const state = getState(id);
  if (!state.sock || state.status !== 'connected') {
    throw new Error('WhatsApp by QR is not connected (scan the QR on the Channels page)');
  }
  const jid = String(phone).includes('@') ? phone : (String(phone).replace(/\D/g, '') + '@s.whatsapp.net');
  return state.sock.sendMessage(jid, { react: { text: emoji || '', key: { remoteJid: jid, fromMe: !!fromMe, id: targetId } } });
}

module.exports = { startSession, sendMessage, sendReaction, subscribePresence, getStatus, disconnect, restoreAll, syncSession, setDailyLimit };
