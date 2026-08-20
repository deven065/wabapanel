const cron = require('node-cron');

function renderVars(text, contact) {
  const name = contact.name || contact.profileName || '';
  const first = name.split(' ')[0] || '';
  return String(text || '')
    .replace(/\{first_name\}/g, first)
    .replace(/\{last_name\}/g, name.split(' ').slice(1).join(' '))
    .replace(/\{full_name\}/g, name)
    .replace(/\{phone_number\}/g, contact.phone || '');
}

function unitToMs(value, unit) {
  const v = Number(value) || 1;
  if (unit === 'minutes') return v * 60 * 1000;
  if (unit === 'hours') return v * 60 * 60 * 1000;
  return v * 24 * 60 * 60 * 1000;
}

// Generate a single follow-up message by reading the conversation history + a user-defined prompt.
async function generateAiFollowup(workspace, conv, contact, prompt) {
  const AISettings = require('../models/AISettings');
  const Message = require('../models/Message');
  const aiService = require('./aiService');
  const { resolveAiCreds } = require('./aiResolver');

  const ai = await AISettings.findOne({ workspace: workspace._id }).lean();
  const creds = await resolveAiCreds(workspace, ai);
  if (!creds || !creds.apiKey) return null;

  const msgs = await Message.find({ conversation: conv._id }).sort({ createdAt: -1 }).limit(40)
    .select('direction text body type').lean();
  msgs.reverse();
  const transcript = msgs.map((m) => {
    const who = m.direction === 'outbound' ? 'Business' : 'Customer';
    let t = (m.text || m.body || '').replace(/\s+/g, ' ').trim();
    if (!t && m.type) t = `[${m.type}]`;
    return `${who}: ${t}`.slice(0, 300);
  }).join('\n') || '(no messages)';

  const sys = `You are a WhatsApp business assistant writing a short follow-up to a customer who has gone quiet.
"Business" = our side, "Customer" = the lead. Follow this instruction from the business owner:
${prompt || 'Politely re-engage the customer and move the conversation forward.'}
Rules: Write ONE short WhatsApp message only (no preamble, no quotes, no explanation). Use the same language the customer uses. If details were requested earlier and are still missing, ask only for what is still missing.`;
  const opts = {
    model: creds.azureDeployment || creds.model,
    azureEndpoint: creds.azureEndpoint, azureDeployment: creds.azureDeployment,
    azureApiVersion: creds.azureApiVersion, temperature: 0.5, maxTokens: 300,
  };
  const r = await aiService.chat(creds.provider, creds.apiKey, [
    { role: 'system', content: sys },
    { role: 'user', content: `Customer: ${contact.name || 'NA'} (${contact.phone || ''})\n\nCHAT:\n${transcript}\n\nWrite the follow-up message now.` },
  ], opts);
  return String(r.content || '').trim().slice(0, 900) || null;
}

// New multi-step + AI win-back engine. Runs only when steps[] or aiEnabled is configured.
async function runWinbackSequence(st, wb, workspace, wa) {
  const Conversation = require('../models/Conversation');

  // Official-time gate: outside the chosen window we send nothing this run.
  if (wb.sendWindowMode === 'window') {
    const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date());
    const start = wb.sendStart || '09:00';
    const end = wb.sendEnd || '18:00';
    if (hhmm < start || hhmm > end) return;
  }

  const steps = (Array.isArray(wb.steps) ? wb.steps : []).slice(0, 5)
    .map((s) => ({ delayMs: unitToMs(s.delayValue, s.delayUnit), message: String(s.message || '') }));
  const totalManual = steps.length;
  const aiEnabled = !!wb.aiEnabled;
  const aiMax = Math.max(0, Number(wb.aiMaxFollowups) || 0);
  const aiGapMs = unitToMs(wb.aiGapValue, wb.aiGapUnit);
  if (!totalManual && !(aiEnabled && aiMax > 0)) return;

  // A conversation must have been quiet at least as long as the first follow-up delay to be a candidate.
  const firstDelayMs = totalManual ? steps[0].delayMs : aiGapMs;
  const cutoff = new Date(Date.now() - firstDelayMs);

  const convs = await Conversation.find({
    workspace: st.workspace,
    $or: [{ channel: { $exists: false } }, { channel: 'whatsapp' }],
    'lastMessage.timestamp': { $lt: cutoff },
  }).populate('contact', 'name phone status').sort({ winbackAt: 1 }).limit(200);

  const now = Date.now();
  for (const conv of convs) {
    const c = conv.contact;
    if (!c || !c.phone || c.status === 'blocked') continue;

    let step = conv.winbackStep || 0;
    let aiCount = conv.winbackAiCount || 0;
    const lastTs = conv.lastMessage?.timestamp ? new Date(conv.lastMessage.timestamp).getTime() : 0;
    const lastAt = conv.winbackAt ? new Date(conv.winbackAt).getTime() : 0;

    // Stop-on-reply / re-engagement: customer replied after our last follow-up → restart the sequence.
    if ((step > 0 || aiCount > 0) && conv.lastMessage?.direction === 'inbound' && lastAt && lastTs > lastAt) {
      conv.winbackStep = 0; conv.winbackAiCount = 0; conv.winbackAt = null;
      await conv.save();
      continue;
    }

    const sessionOpen = conv.windowExpiresAt && new Date(conv.windowExpiresAt) > new Date();
    let text = null;
    if (step < totalManual) {
      const ref = step === 0 ? lastTs : lastAt;
      if (!ref || now < ref + steps[step].delayMs) continue;
      text = renderVars(steps[step].message, c);
    } else if (aiEnabled && aiCount < aiMax) {
      const ref = lastAt || lastTs;
      if (!ref || now < ref + aiGapMs) continue;
      if (sessionOpen) {
        try { text = await generateAiFollowup(workspace, conv, c, wb.aiPrompt); }
        catch (e) { console.error('[Winback] AI gen failed:', c.phone, e.message); continue; }
        if (!text) continue;
      }
    } else {
      continue; // sequence complete
    }

    try {
      if (sessionOpen && text) {
        await wa.sendTextMessage(c.phone, text);
      } else if (wb.templateName) {
        await wa.sendTemplateMessage(c.phone, wb.templateName, wb.templateLanguage || 'en', []);
      } else {
        // Window closed and no approved template → wait (back off, do not advance).
        conv.winbackAt = new Date();
        await conv.save();
        continue;
      }
      console.log('[Winback] step sent to', c.phone);
    } catch (e) {
      console.error('[Winback] send failed:', c.phone, e.message);
    }
    if (step < totalManual) conv.winbackStep = step + 1;
    else conv.winbackAiCount = aiCount + 1;
    conv.winbackAt = new Date();
    await conv.save();
  }
}

async function runWishes() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Contact = require('../models/Contact');
  const Workspace = require('../models/Workspace');
  const WhatsAppService = require('./whatsappService');

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (now.getHours() < 9 || now.getHours() >= 21) return;
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  const allSettings = await AutomationSettings.find({
    $or: [{ 'wishes.birthdayEnabled': true }, { 'wishes.anniversaryEnabled': true }],
  }).lean();

  for (const st of allSettings) {
    try {
      const workspace = await Workspace.findById(st.workspace);
      if (!workspace || !workspace.whatsapp?.isConnected) continue;
      const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);

      const jobs = [];
      if (st.wishes?.birthdayEnabled) jobs.push(['birthday', 'lastBirthdayWish', st.wishes.birthdayMessage || 'Happy Birthday {first_name}! 🎂🎉', st.wishes.birthdayStickerUrl || '']);
      if (st.wishes?.anniversaryEnabled) jobs.push(['anniversary', 'lastAnniversaryWish', st.wishes.anniversaryMessage || 'Happy Anniversary {first_name}! 💐', st.wishes.anniversaryStickerUrl || '']);

      for (const [field, marker, message, stickerUrl] of jobs) {
        const contacts = await Contact.find({
          workspace: st.workspace,
          [field]: { $ne: null },
          [marker]: { $ne: year },
          status: 'active',
        }).limit(2000).lean();
        for (const c of contacts) {
          const d = new Date(c[field]);
          if (d.getMonth() !== month || d.getDate() !== day) continue;
          try {
            await wa.sendTextMessage(c.phone, renderVars(message, c));
            if (stickerUrl) await wa.sendMediaMessage(c.phone, 'sticker', stickerUrl, '');
            await Contact.updateOne({ _id: c._id }, { [marker]: year });
            console.log(`[Wisher] ${field} wish sent to ${c.phone}`);
          } catch (e) {
            console.error('[Wisher] send failed:', c.phone, e.message);
            await Contact.updateOne({ _id: c._id }, { [marker]: year });
          }
        }
      }
    } catch (e) {
      console.error('[Wisher] workspace error:', e.message);
    }
  }
}

async function runWinback() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const Workspace = require('../models/Workspace');
  const WhatsAppService = require('./whatsappService');

  const nowHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const allSettings = await AutomationSettings.find({ 'winback.enabled': true }).lean();
  for (const st of allSettings) {
    try {
      const wb = st.winback || {};
      const useNew = (Array.isArray(wb.steps) && wb.steps.length > 0) || (wb.aiEnabled && (Number(wb.aiMaxFollowups) || 0) > 0);
      const workspace = await Workspace.findById(st.workspace);
      if (!workspace || !workspace.whatsapp?.isConnected) continue;
      const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
      if (useNew) { await runWinbackSequence(st, wb, workspace, wa); continue; }
      // ---- legacy single-step path (unchanged for existing configs) ----
      if (!wb.templateName && !wb.presetName && !wb.customMessage) continue;
      const unit = wb.unit || 'days';
      // Day-based winback fires once daily at sendHour (unchanged). Hour/minute-based checks every run.
      if (unit === 'days' && (wb.sendHour ?? 11) !== nowHour) continue;
      const unitMs = unit === 'minutes' ? 60 * 1000 : unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const amount = Number(wb.amount) || Number(wb.days) || 15;
      const cutoff = new Date(Date.now() - amount * unitMs);
      let preset = null;
      if (wb.presetName) {
        const PresetMessage = require('../models/PresetMessage');
        preset = await PresetMessage.findOne({ workspace: st.workspace, name: wb.presetName }).lean();
      }
      const convs = await Conversation.find({
        workspace: st.workspace,
        $or: [{ channel: { $exists: false } }, { channel: 'whatsapp' }],
        'lastMessage.timestamp': { $lt: cutoff },
        $and: [{ $or: [{ winbackAt: null }, { winbackAt: { $lt: cutoff } }] }],
      }).populate('contact', 'name phone status').limit(50);
      for (const conv of convs) {
        const c = conv.contact;
        if (!c || !c.phone || c.status === 'blocked') continue;
        const sessionOpen = conv.windowExpiresAt && new Date(conv.windowExpiresAt) > new Date();
        try {
          let result;
          if (sessionOpen && wb.customMessage) {
            result = await wa.sendTextMessage(c.phone, renderVars(wb.customMessage, c));
          } else if (sessionOpen && preset && preset.body) {
            result = await wa.sendTextMessage(c.phone, renderVars(preset.body, c));
          } else if (wb.templateName) {
            // Outside the 24h window (or no session content) → approved template only.
            result = await wa.sendTemplateMessage(c.phone, wb.templateName, wb.templateLanguage || 'en', []);
          } else {
            continue; // window closed and no template → cannot message
          }
          if (result?.success !== false) console.log('[Winback] sent to', c.phone);
        } catch (e) { console.error('[Winback] send failed:', c.phone, e.message); }
        conv.winbackAt = new Date();
        await conv.save();
      }
    } catch (e) { console.error('[Winback] workspace error:', e.message); }
  }
}

function start() {
  cron.schedule('*/5 * * * *', () => runWinback().catch((e) => console.error('[Winback]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('10 * * * *', () => runWishes().catch((e) => console.error('[Wisher] error:', e.message)), { timezone: 'Asia/Kolkata' });
  setTimeout(() => runWishes().catch(() => {}), 30000);
}

module.exports = { start };
