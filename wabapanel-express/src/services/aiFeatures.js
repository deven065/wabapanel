const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function getSettings(workspaceId) {
  const AISettings = require('../models/AISettings');
  const st = await AISettings.findOne({ workspace: workspaceId }).lean();
  if (!st || !st.apiKey) return null;
  return st;
}

async function chatJSON(st, system, user, maxTokens = 200) {
  const aiService = require('./aiService');
  const r = await aiService.chat(st.provider, st.apiKey, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { model: st.model, temperature: 0, maxTokens, ...aiService.azureOpts(st) });
  const m = (r.content || '').match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// Voice message -> text (OpenAI Whisper). Mutates messageData before save.
async function transcribeInbound({ workspace, msg, messageData }) {
  const st = await getSettings(workspace._id);
  if (!st || !st.features?.voiceToText) return;
  if (st.provider !== 'openai') return; // Whisper needs an OpenAI key
  const mediaId = msg.audio?.id;
  if (!mediaId) return;

  const WhatsAppService = require('./whatsappService');
  const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
  const url = await wa.getMediaUrl(mediaId);
  const buffer = Buffer.from(await wa.downloadMedia(url));

  const dir = path.join(__dirname, '..', '..', 'uploads', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const ext = (msg.audio?.mime_type || '').includes('mpeg') ? 'mp3' : 'ogg';
  const filename = `${mediaId}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  messageData.media.url = `${process.env.BACKEND_URL || "https://api.wabapanel.com"}/uploads/voice/${filename}`;

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', buffer, { filename });
  form.append('model', 'whisper-1');
  const r = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${st.apiKey}` },
    timeout: 30000,
  });
  const text = (r.data?.text || '').trim();
  if (text) {
    messageData.text = text;
    messageData.metadata = { ...(messageData.metadata || {}), transcribed: true };
  }
}

const NON_LATIN = /[\u0400-\u04FF\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;

// Auto-translate non-English inbound text to English. Mutates messageData.
async function translateInbound({ workspace, messageData }) {
  const st = await getSettings(workspace._id);
  if (!st || !st.features?.autoTranslate) return;
  const text = messageData.text || '';
  if (text.length < 2 || !NON_LATIN.test(text)) return;
  const aiService = require('./aiService');
  const r = await aiService.chat(st.provider, st.apiKey, [
    { role: 'system', content: 'Translate the user message to English. Reply with ONLY the translation, nothing else.' },
    { role: 'user', content: text },
  ], { model: st.model, temperature: 0, maxTokens: 300, ...aiService.azureOpts(st) });
  const tr = (r.content || '').trim();
  if (tr) messageData.metadata = { ...(messageData.metadata || {}), translation: tr };
}

// Lead scoring + sentiment (single AI call, throttled). Fire-and-forget.
async function analyzeInbound({ workspace, conversation, contact, io }) {
  const st = await getSettings(workspace._id);
  if (!st) return;
  const doScore = !!st.features?.leadScoring;
  const doSentiment = !!st.features?.sentiment;
  if (!doScore && !doSentiment) return;

  const Contact = require('../models/Contact');
  const fresh = await Contact.findById(contact._id).select('leadScoreAt').lean();
  if (fresh?.leadScoreAt && Date.now() - new Date(fresh.leadScoreAt).getTime() < 5 * 60 * 1000) return;
  await Contact.updateOne({ _id: contact._id }, { leadScoreAt: new Date() });

  const Message = require('../models/Message');
  const recent = await Message.find({ conversation: conversation._id }).sort('-createdAt').limit(15).lean();
  const convoText = recent.reverse().map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text || '[media]'}`).join('\n');

  const AutomationSettings = require('../models/AutomationSettings');
  const ownerAlerts = (await AutomationSettings.findOne({ workspace: workspace._id }).select('ownerAlerts').lean())?.ownerAlerts || {};
  const wantSuggestion = !!(ownerAlerts.enabled && ownerAlerts.onAiSuggestion);

  const out = await chatJSON(st,
    'You analyze WhatsApp business conversations. Reply with ONLY JSON: {"lead":"hot|warm|cold","sentiment":"positive|neutral|negative"' +
    (wantSuggestion ? ',"next_action":"one short action the business should take next, max 15 words, empty string if nothing is needed"' : '') +
    '}. lead=hot if customer shows strong buying intent/urgency, warm if interested, cold if not interested or just browsing.',
    convoText.slice(-4000));
  if (!out) return;
  if (wantSuggestion && out.next_action && String(out.next_action).trim()) {
    require('./ownerNotify').aiSuggestion(workspace._id, contact, String(out.next_action).trim()).catch(() => {});
  }

  const updates = {};
  if (doScore && ['hot', 'warm', 'cold'].includes(out.lead)) {
    const prev = await Contact.findById(contact._id).select('leadScore').lean();
    await Contact.updateOne({ _id: contact._id }, { leadScore: out.lead });
    updates.leadScore = out.lead;
    if (out.lead === 'hot' && prev?.leadScore !== 'hot') {
      require('./ownerNotify').hotLead(workspace._id, contact, { notes: 'AI detected strong buying intent in chat' }).catch(() => {});
    }
  }
  if (doSentiment && ['positive', 'neutral', 'negative'].includes(out.sentiment)) {
    const Conversation = require('../models/Conversation');
    await Conversation.updateOne({ _id: conversation._id }, { sentiment: out.sentiment });
    updates.sentiment = out.sentiment;
  }
  if (io && Object.keys(updates).length) {
    const Conversation = require('../models/Conversation');
    const populatedConv = await Conversation.findById(conversation._id).populate('contact', 'name phone avatar profileName leadScore');
    io.to(`workspace:${workspace._id}`).emit('conversation_updated', populatedConv);
  }
}

// On-demand conversation summary.
async function summarizeConversation({ workspaceId, conversationId }) {
  const st = await getSettings(workspaceId);
  if (!st) throw new Error('AI API key is not set — add a key in AI Settings');
  if (!st.features?.autoSummary) throw new Error('Auto Summary feature is off — enable it in AI Settings > Features');

  const Message = require('../models/Message');
  const recent = await Message.find({ conversation: conversationId }).sort('-createdAt').limit(60).lean();
  const convoText = recent.reverse().map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text || '[media]'}`).join('\n');

  const aiService = require('./aiService');
  const r = await aiService.chat(st.provider, st.apiKey, [
    { role: 'system', content: 'Summarize this WhatsApp business conversation in 3-5 short bullet points (Hinglish ok): what the customer wants, key details discussed, current status, and suggested next action. Be concise.' },
    { role: 'user', content: convoText.slice(-8000) },
  ], { model: st.model, temperature: 0.3, maxTokens: 400, ...aiService.azureOpts(st) });

  const summary = (r.content || '').trim();
  const Conversation = require('../models/Conversation');
  await Conversation.updateOne({ _id: conversationId }, { aiSummary: summary, aiSummaryAt: new Date() });
  return summary;
}

// Auto ticket on complaint keywords (no AI call needed).
async function maybeCreateTicket({ workspace, conversation, contact, text, io }) {
  const AISettings = require('../models/AISettings');
  const st = await AISettings.findOne({ workspace: workspace._id }).lean();
  if (!st || !st.features?.autoTicket) return;
  const lower = (text || '').toLowerCase();
  if (!lower) return;
  const kw = (st.features.ticketKeywords || []).find((k) => k && lower.includes(k.toLowerCase()));
  if (!kw) return;
  const Ticket = require('../models/Ticket');
  const existing = await Ticket.findOne({ workspace: workspace._id, conversation: conversation._id, status: 'open' });
  if (existing) return;
  const t = await Ticket.create({
    workspace: workspace._id,
    contact: contact._id,
    conversation: conversation._id,
    subject: (text || '').slice(0, 150),
    keyword: kw,
  });
  if (io) io.to(`workspace:${workspace._id}`).emit('ticket_created', t);
}

// Converts raw s16le PCM to an mp3 in /uploads/voice and returns its absolute URL.
function pcmToMp3(pcm, rate) {
  const { execFileSync } = require('child_process');
  const dir = path.join(__dirname, '..', '..', 'uploads', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const base = `ai_${Date.now()}`;
  const raw = path.join(dir, base + '.pcm');
  fs.writeFileSync(raw, pcm);
  execFileSync('ffmpeg', ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, '-b:a', '64k', path.join(dir, base + '.mp3')]);
  fs.unlinkSync(raw);
  return `${process.env.BACKEND_URL || "https://api.wabapanel.com"}/uploads/voice/${base}.mp3`;
}

// AI text -> voice note. Uses the AI-calling agent's voice (ElevenLabs/Sarvam/Cartesia)
// when selected in AI Settings, otherwise OpenAI TTS. Returns an absolute mp3 URL, or null.
async function textToSpeech(workspaceId, text) {
  const st = await getSettings(workspaceId);
  if (!st) return null;
  if ((st.features?.voiceReplyVoice || 'openai') === 'calling_agent') {
    try {
      const AICallingAgent = require('../models/AICallingAgent');
      const agent = await AICallingAgent.findOne({
        workspace: workspaceId,
        voiceProvider: { $in: ['elevenlabs', 'sarvam', 'cartesia'] },
        'voiceConfig.apiKey': { $ne: '' },
      }).sort({ isDefault: -1, updatedAt: -1 });
      if (agent) {
        const { TTS } = require('./externalVoice');
        const { pcm, rate } = await TTS[agent.voiceProvider]({ apiKey: agent.voiceConfig.apiKey, voiceId: agent.voiceId, text: String(text).slice(0, 3000) });
        return pcmToMp3(pcm, rate);
      }
    } catch (e) { console.error('[AI Voice] agent voice failed, falling back to OpenAI:', e.message); }
  }
  if (st.provider !== 'openai' || !st.apiKey) return null;
  const r = await axios.post('https://api.openai.com/v1/audio/speech',
    { model: 'gpt-4o-mini-tts', voice: 'coral', input: String(text).slice(0, 4000), response_format: 'mp3', instructions: 'Speak in exactly the same language as the input text, do not translate. If the text is Hindi or Hinglish, speak natural conversational Hindi with a clear Indian accent, pronouncing Hindi words correctly. Warm, friendly, unhurried customer-support tone.' },
    { headers: { Authorization: `Bearer ${st.apiKey}` }, responseType: 'arraybuffer', timeout: 60000 });
  const dir = path.join(__dirname, '..', '..', 'uploads', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `ai_${Date.now()}.mp3`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(r.data));
  return `${process.env.BACKEND_URL || "https://api.wabapanel.com"}/uploads/voice/${filename}`;
}

module.exports = { transcribeInbound, translateInbound, analyzeInbound, summarizeConversation, maybeCreateTicket, textToSpeech };
