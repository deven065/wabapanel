// Server-side AI voice bridge.
// Terminates the WhatsApp/Meta WebRTC call on the server (werift) and bridges
// its Opus 48k audio to an OpenAI Realtime WebSocket session (PCM16 24k).
// The OpenAI leg is a plain WebSocket: no ICE/consent/WebRTC lifetime limits.
const { RTCPeerConnection, MediaStreamTrack, RtpPacket, RtpHeader } = require('werift');
let OpusEncoder = null;
try { ({ OpusEncoder } = require('@discordjs/opus')); } catch { /* optional: AI voice calling disabled without native opus */ }
const WebSocket = require('ws');
const axios = require('axios');

const GRAPH = 'https://graph.facebook.com/v21.0';
const { TOOL_DEFINITIONS, executeTool } = require('./callTools');
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';

// active bridges keyed by Meta callId
const bridges = new Map();

const opusPT = (sdp) => {
  const m = (sdp || '').match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  return m ? parseInt(m[1], 10) : 111;
};

// Look up a saved contact's name by phone so the AI can greet the customer personally.
async function lookupContactName(workspaceId, phone) {
  try {
    const d = String(phone || '').replace(/[^0-9]/g, '');
    if (!workspaceId || !d) return '';
    const Contact = require('../models/Contact');
    const c = await Contact.findOne({ workspace: workspaceId, phone: { $in: [d, d.slice(-10), '91' + d.slice(-10)] } }).select('name').lean();
    return (c && c.name) ? String(c.name).trim() : '';
  } catch { return ''; }
}

// Connect the OpenAI Realtime API over WebSocket. Returns an object shaped
// like the old WebRTC leg so callers keep working:
//   localTrack.writeRtp(rtp) -> customer Opus 48k RTP in (decoded to PCM16 24k)
//   onAiRtp(rtp)             -> AI audio out as Opus 48k RTP packets
//   pc.close() / pc.connectionState, context._dc.send(json)
async function connectOpenAI({ apiKey, instructions, greeting, voice, onAiRtp, context, azure, customerName }) {
  let ws;
  if (azure && azure.endpoint && azure.deployment) {
    // Azure OpenAI realtime, authenticated with an `api-key` header. Accept either a
    // bare resource endpoint or a full realtime URL pasted from the Azure portal.
    const raw = String(azure.endpoint).trim();
    let url;
    if (/\/realtime/i.test(raw)) {
      url = raw.replace(/^https?:\/\//i, 'wss://');
      if (!/[?&](deployment|model)=/i.test(url)) {
        url += (url.includes('?') ? '&' : '?') + 'deployment=' + encodeURIComponent(azure.deployment);
      }
    } else {
      const host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const apiVersion = azure.apiVersion || '2024-10-01-preview';
      url = 'wss://' + host + '/openai/realtime?api-version=' + apiVersion + '&deployment=' + encodeURIComponent(azure.deployment);
    }
    ws = new WebSocket(url, { headers: { 'api-key': apiKey } });
  } else {
    const rtModel = (context?.agent?.aiModel || '').includes('realtime') || context?.agent?.aiModel === 'gpt-realtime' ? context.agent.aiModel : REALTIME_MODEL;
    ws = new WebSocket('wss://api.openai.com/v1/realtime?model=' + rtModel, {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
  }
  const dc = {
    send: (s) => { if (ws.readyState === WebSocket.OPEN) ws.send(s); },
    get readyState() { return ws.readyState === WebSocket.OPEN ? 'open' : 'closed'; },
  };
  if (context) context._dc = dc;

  // AI audio out: PCM16 24k deltas -> Opus (24k input, libopus resamples
  // internally with proper filtering) -> RTP (48k clock, 960 ts/20ms).
  const encoder = new OpusEncoder(24000, 1);
  try { encoder.applyEncoderCTL(4002, 64000); } catch {} // OPUS_SET_BITRATE
  const OUT_SSRC = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  let outSeq = Math.floor(Math.random() * 30000);
  let outTs = Math.floor(Math.random() * 1000000) >>> 0;
  let outBuf = Buffer.alloc(0);
  const pushAiAudio = (b64) => {
    const pcm24 = Buffer.from(b64, 'base64');
    outBuf = outBuf.length ? Buffer.concat([outBuf, pcm24]) : pcm24;
    const FRAME = 480 * 2; // 20ms @24k mono s16
    while (outBuf.length >= FRAME) {
      const frame = outBuf.subarray(0, FRAME);
      outBuf = outBuf.subarray(FRAME);
      let payload;
      try { payload = encoder.encode(frame); } catch { continue; }
      outSeq = (outSeq + 1) & 0xffff; outTs = (outTs + 960) >>> 0;
      const pkt = new RtpPacket(new RtpHeader({ ssrc: OUT_SSRC, payloadType: 111, sequenceNumber: outSeq, timestamp: outTs }), payload);
      try { onAiRtp(pkt); } catch {}
    }
  };
  const clearAiAudio = () => { outBuf = Buffer.alloc(0); };

  // Customer audio in: Opus RTP -> decode straight to PCM16 24k (libopus
  // resamples internally) -> input_audio_buffer.append
  const decoder = new OpusEncoder(24000, 1);
  let inBatch = [];
  let inFlushTimer = null;
  const flushIn = () => {
    if (!inBatch.length) return;
    const buf = Buffer.concat(inBatch); inBatch = [];
    dc.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: buf.toString('base64') }));
  };
  const localTrack = {
    writeRtp: (rtp) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Full-duplex: always forward the caller's audio to the model so its
      // server VAD can hear the caller and barge in even while the AI speaks.
      let pcm24;
      try { pcm24 = decoder.decode(rtp.payload); } catch { return; }
      inBatch.push(pcm24);
      if (inBatch.length >= 3) flushIn(); // ~60ms batches
      else {
        clearTimeout(inFlushTimer);
        inFlushTimer = setTimeout(flushIn, 80);
      }
    },
  };

  const pingTimer = setInterval(() => { try { if (ws.readyState === WebSocket.OPEN) ws.ping(); } catch {} }, 15000);
  const pc = {
    close: () => { clearInterval(pingTimer); try { ws.close(); } catch {} },
    get connectionState() { return ws.readyState === WebSocket.OPEN ? 'connected' : 'closed'; },
    connectionStateChange: { subscribe: () => {} },
  };
  ws.on('close', (code, reason) => { clearInterval(pingTimer); console.log('[AI Call] OpenAI ws closed', code, String(reason || '').slice(0, 120)); });
  ws.on('error', (e) => console.log('[AI Call] OpenAI ws error:', e.message));

  ws.on("message", async (raw) => {
    try {
      const ev = JSON.parse(raw.toString());
      if (ev.type === 'error') console.error('[AI Call] OpenAI error event:', JSON.stringify(ev.error || ev).slice(0, 400));
      if (context) {
        if (ev.type === 'response.created') {
          context._responseActive = true;
          // Clear input buffer when AI starts responding (for external voice - text mode)
          if (context.externalSpeaker) {
            context._aiSpeaking = true;
          }
        }
        if (ev.type === 'response.done') {
          context._responseActive = false;
          context._lastResponseDone = Date.now();
          const hasContent = (ev.response?.output || []).length > 0;
          if (hasContent) context._lastContentResponse = Date.now();
          // Clear echo buffer after response (for external voice and native)
          setTimeout(() => {
            context._aiSpeaking = false;
          }, 500);
        }
        if (ev.type === 'input_audio_buffer.speech_started' && !context.externalSpeaker) { context._lastSpeechDetected = Date.now(); console.log('[AI Call] vad: speech_started'); }
        if (ev.type === 'input_audio_buffer.speech_stopped') console.log('[AI Call] vad: speech_stopped');
      }
      if ((ev.type === 'response.output_audio.delta' || ev.type === 'response.audio.delta') && ev.delta) {
        if (context) context._aiSpeaking = true;
        pushAiAudio(ev.delta);
      }
      if (ev.type === 'input_audio_buffer.speech_started') {
        // Caller barged in: drop any queued AI audio immediately.
        clearAiAudio();
        try { context?.onBargeIn?.(); } catch {}
      }
      if (ev.type === 'error') { console.log('[AI Call] OPENAI ERROR:', JSON.stringify(ev).slice(0, 500)); }
      if (/speech_started|speech_stopped|transcription\.(completed|failed)|response\.(done|created)|output_audio_buffer|session\.(created|updated)|rate_limit/.test(ev.type || '')) {
        console.log('[AI Call] evt:', ev.type, /failed|rate_limit/.test(ev.type) ? JSON.stringify(ev).slice(0, 300) : ev.type === 'response.done' ? JSON.stringify({ status: ev.response?.status, details: ev.response?.status_details, out: (ev.response?.output || []).map((o) => o.type + ':' + (o.content || []).map((c) => c.type).join(',')) }).slice(0, 400) : '');
      }
      if (context && context.externalSpeaker) {
        if (ev.type === 'response.output_text.done' || ev.type === 'response.text.done') {
          context.externalSpeaker.flush();
          if (ev.text && context.transcript) context.transcript.push({ role: 'assistant', text: ev.text });
        }
        if (ev.type === 'input_audio_buffer.speech_started' && !context.externalSpeaker) {
          // Caller barged in: stop speaking and drop queued audio.
          context.externalSpeaker.interrupt();
          try { context.onBargeIn?.(); } catch {}
        }
      }
      if (context && context.transcript) {
        // Reset silence keepalive on every response completion
        if (ev.type === 'response.done' || ev.type === 'output_audio_buffer.stopped') {
          clearTimeout(context._silenceTimer);
          context._silenceTimer = setTimeout(() => {
            if (context._responseActive) return;
            try {
              console.log('[AI Call] silence keepalive: prompting caller');
              dc.send(JSON.stringify({ type: 'response.create', response: { instructions: 'The caller has been silent for a while. Gently ask if they are still there or need anything else. Keep it very short (1 sentence).' } }));
            } catch (e) { console.error('[AI Call] keepalive error:', e.message); }
          }, 15000);
        }
        if (ev.type === 'response.output_audio_transcript.done' && ev.transcript) {
          context.transcript.push({ role: 'assistant', text: ev.transcript });
        }
        if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
          context.transcript.push({ role: 'user', text: ev.transcript });
        }
      }
      if (ev.type === 'response.function_call_arguments.done') {
        let result;
        try {
          result = await handleTool(ev.name, JSON.parse(ev.arguments || '{}'), context || {});
        } catch (e) {
          result = { ok: false, error: e.message };
        }
        console.log('[AI Call] tool', ev.name, '->', JSON.stringify(result).slice(0, 200));
        dc.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(result) },
        }));
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch { /* non-JSON */ }
  });
  const baseInstructions = instructions || 'You are a helpful phone assistant. Keep replies short and natural.';
  // Vary the persona slightly per call so cold calls feel human and different, not scripted.
  const CALL_TONES = ['warm and friendly', 'energetic and confident', 'calm, patient and professional', 'cheerful and helpful', 'polite and soft-spoken'];
  const callTone = CALL_TONES[Math.floor(Math.random() * CALL_TONES.length)];
  const nameLine = customerName
    ? `NAME: The customer's name is "${customerName}". Address them by their name naturally at the start and occasionally during the call (don't overuse it).`
    : 'NAME: You do not know the customer\'s name, so address them respectfully as "Sir".';
  const sessionConfig = {
    type: 'realtime',
    instructions: baseInstructions + `

STYLE: Talk exactly like a REAL human on a phone call - NOT like an AI. Sound natural and ${callTone}. Use everyday spoken words and occasional natural fillers, and vary your wording. Keep replies short (1-2 sentences), one question at a time, never monologue or sound scripted. Greet the caller only ONCE at the very start; after that, do NOT greet or welcome them again. Speak ONLY in response to what the caller says - never start a new topic or keep talking on your own. If the caller is silent, stay silent and wait. IMPORTANT: Ignore any echo of your own voice. Only respond to new, distinct human speech that is different from what you just said.

${nameLine}

LANGUAGE: Speak in ENGLISH by default, but with a natural INDIAN accent and a warm, friendly Indian tone - like a real Indian customer-care agent, not an American voice. The moment the customer speaks in another language (Hindi, Hinglish, or any regional language), switch to that same language and continue in it for the rest of the call. Always mirror the customer's language.

SALES: Listen carefully to what the customer actually wants - if they ask for a plan, an appointment, a demo, pricing, or anything else, follow their request and use the right tool to help them right away. Suggest the plan that fits their need. Do NOT pitch the premium agency plan (₹19,999) to everyone - it makes people feel we are expensive. Only bring up the agency plan if the customer specifically asks you to set everything up for them (done-for-you) or asks about that plan directly; otherwise keep it simple and recommend the plan that matches what they need.

TOOLS you can use during the call:
- book_appointment: book an appointment (collect name, date, time, purpose first; confirm details back).
- save_lead: when the caller shows interest in a product/service, save their name, requirement and budget as a lead.
- schedule_callback: if the caller asks to be called later. For a specific date/time pass date+time; for relative requests ("abhi", "2 minute baad", "aadhe ghante baad") pass minutes_from_now instead.
- transfer_to_human: if the caller asks to talk to a human/staff, use this, then tell them the team will call them shortly.
- send_catalog: if the caller asks for the catalog/price list/brochure, send it on WhatsApp.
- send_whatsapp_message: if the caller asks you to send them a link, website, app link, address, price, or any details on WhatsApp, use this to send them a WhatsApp text message right away (you can include links in the message text). Always actually call this tool when they ask you to send something - do not just say you will.
- get_order_status: if the caller asks about their order, look it up by order number (or their phone number).
- create_order: when customer wants to buy/order something, create an order (collect item names, quantities).
- send_payment_reminder: send a payment reminder message on WhatsApp about pending amount.
- qualify_lead: update the customer lead status (hot/warm/cold) and pipeline stage based on conversation.
- schedule_followup: schedule a follow-up WhatsApp message to send after the call.
- collect_feedback: save customer feedback/rating/survey response.
- create_ticket: create a support ticket when customer has a complaint or issue.
Always confirm to the caller after a tool succeeds. Current date/time: ` + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' (IST).',
    ...(context?.externalSpeaker
      ? {
          output_modalities: ['text'],
          audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: 'whisper-1' }, turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true } } },
        }
      : {
          audio: {
            input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: 'whisper-1' }, turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true } },
            output: { format: { type: 'audio/pcm', rate: 24000 }, voice: voice || 'alloy' },
          },
        }),
    tools: [
      {
        type: 'function',
        name: 'book_appointment',
        description: 'Book an appointment for the caller in the business calendar.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Caller name' },
            date: { type: 'string', description: 'Appointment date in YYYY-MM-DD' },
            time: { type: 'string', description: 'Appointment time in 24h HH:MM' },
            purpose: { type: 'string', description: 'Reason for the appointment' },
          },
          required: ['date', 'time'],
        },
      },
      {
        type: 'function',
        name: 'save_lead',
        description: 'Save the caller as a sales lead when they show interest in a product or service.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Caller name' },
            requirement: { type: 'string', description: 'What the caller is interested in / needs' },
            budget: { type: 'string', description: 'Budget mentioned by the caller, if any' },
          },
          required: ['requirement'],
        },
      },
      {
        type: 'function',
        name: 'schedule_callback',
        description: 'Schedule an AI callback. For a specific date/time pass date+time; for relative requests ("abhi", "2 minute baad", "aadhe ghante baad") pass minutes_from_now instead.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Callback date in YYYY-MM-DD' },
            time: { type: 'string', description: 'Callback time in 24h HH:MM (IST)' },
            minutes_from_now: { type: 'number', description: 'Minutes from now (use for relative/immediate requests)' },
            reason: { type: 'string', description: 'What the callback is about' },
          },
        },
      },
      {
        type: 'function',
        name: 'transfer_to_human',
        description: 'Notify the human team that the caller wants to talk to a person. The team will call them back shortly.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Why the caller wants a human' },
          },
        },
      },
      {
        type: 'function',
        name: 'send_catalog',
        description: 'Send the business catalog / price list / brochure to the caller on WhatsApp.',
        parameters: { type: 'object', properties: {} },
      },
      {
        type: 'function',
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp text message to the caller during the call - use when they ask you to send a link, website/app link, address, price, or any details on WhatsApp. The message text can include links.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The exact text (with any links) to send to the caller on WhatsApp' },
          },
          required: ['message'],
        },
      },
      {
        type: 'function',
        name: 'get_order_status',
        description: 'Look up the status of the caller order by order number, or their latest order.',
        parameters: {
          type: 'object',
          properties: {
            order_number: { type: 'string', description: 'Order number mentioned by the caller, if any' },
          },
        },
      },
    ],
    tool_choice: 'auto',
  };
  // Add dynamic tools from callTools module
  sessionConfig.tools.push(...TOOL_DEFINITIONS);

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => { cleanup(); reject(new Error('OpenAI ws connect timeout')); }, 15000);
    const onMsg = (raw) => {
      try {
        const ev = JSON.parse(raw.toString());
        if (ev.type === 'session.updated') { cleanup(); resolve(); }
        else if (ev.type === 'error') { cleanup(); reject(new Error('OpenAI ws error: ' + JSON.stringify(ev.error || ev).slice(0, 300))); }
      } catch {}
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const cleanup = () => { clearTimeout(to); ws.off('message', onMsg); ws.off('error', onErr); };
    ws.on('message', onMsg);
    ws.on('error', onErr);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig })));
  });
  console.log('[AI Call] OpenAI ws connected');
  // Make the AI speak its greeting first (personalised, in English). On a mid-call
  // reconnect the greeting is empty, so it just continues without re-greeting.
  const openingName = customerName ? `address the customer by their name ("${customerName}")` : 'address the customer as "Sir"';
  dc.send(JSON.stringify({
    type: 'response.create',
    response: greeting
      ? { instructions: 'Open the call now in English and ' + openingName + '. Base your opening on this idea but rephrase it naturally (do not read it word-for-word): ' + greeting + ' Keep it to one short sentence.' }
      : {},
  }));

  return { pc, localTrack, oaiPT: 111, ws };
}

// Build the Meta peer that answers the customer's offer SDP. `onCustomerRtp(rtp)`
// fires for each audio packet from the customer.
async function connectMeta({ offerSdp, onCustomerRtp }) {
  const pc = new RTCPeerConnection();
  patchRouter(pc);
  const localTrack = new MediaStreamTrack({ kind: 'audio' });
  pc.addTransceiver(localTrack, { direction: 'sendrecv' });

  pc.connectionStateChange.subscribe((st) => console.log('[AI Call] Meta pc state:', st));
  pc.onTrack.subscribe((remote) => {
    remote.onReceiveRtp.subscribe((rtp) => { try { onCustomerRtp(rtp); } catch {} });
  });

  await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  return { pc, localTrack, answerSdp: pc.localDescription.sdp, metaPT: opusPT(offerSdp) };
}

// Build the Meta peer for a business-initiated (outbound) call: we generate the
// offer; Meta's answer arrives later via webhook -> completeOutbound().

// WhatsApp (and possibly OpenAI) restart their RTP stream mid-call with a new
// SSRC. werift only routes SSRCs announced in the SDP and silently drops the
// rest, so audio dies mid-call. Route unknown audio SSRCs to the audio
// receiver, creating/binding a track if needed.
function patchRouter(pc) {
  try {
    const router = pc.router;
    const orig = router.routeRtp;
    router.routeRtp = (packet) => {
      const ssrc = packet.header.ssrc;
      if (!router.ssrcTable[ssrc]) {
        const tr = pc.getTransceivers().find((t) => t.kind === 'audio');
        const receiver = tr && tr.receiver;
        if (receiver) {
          let track = receiver.tracks[0];
          if (!track) {
            const { MediaStreamTrack } = require('werift');
            track = new MediaStreamTrack({ kind: 'audio', remote: true });
            tr.addTrack(track); // fires onTrack so our subscriber attaches
          }
          receiver.trackBySSRC[ssrc] = track;
          router.registerRtpReceiver(receiver, ssrc);
          console.log('[AI Call] routed unknown ssrc', ssrc, 'to audio receiver');
        }
      }
      return orig(packet);
    };
  } catch (e) { console.error('[AI Call] patchRouter failed:', e.message); }
}

async function connectMetaOffer({ onCustomerRtp }) {
  const pc = new RTCPeerConnection();
  patchRouter(pc);
  const localTrack = new MediaStreamTrack({ kind: 'audio' });
  pc.addTransceiver(localTrack, { direction: 'sendrecv' });

  pc.connectionStateChange.subscribe((st) => console.log('[AI Call] Meta pc state:', st));
  pc.onTrack.subscribe((remote) => {
    remote.onReceiveRtp.subscribe((rtp) => { try { onCustomerRtp(rtp); } catch {} });
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  return { pc, localTrack, offerSdp: pc.localDescription.sdp, metaPT: null };
}

// Re-originate RTP instead of passing the source leg's headers through: keep
// our own continuous sequence/timestamp/SSRC. If the source restarts its stream
// (new SSRC / sequence jump, WhatsApp does this mid-call) a passthrough desyncs
// the destination's SRTP state and it silently drops all further audio.
const makeRewriter = (track, getPt) => {
  const st = {
    seq: Math.floor(Math.random() * 30000),
    ts: Math.floor(Math.random() * 1000000) >>> 0,
    lastSrcSsrc: null,
    lastSrcTs: null,
  };
  return (rtp) => {
    try {
      const h = rtp.header;
      let delta = 960; // one 20ms Opus frame @48k
      if (st.lastSrcSsrc === h.ssrc && st.lastSrcTs !== null) {
        const d = (h.timestamp - st.lastSrcTs) >>> 0;
        if (d > 0 && d < 48000 * 5) delta = d;
      }
      st.lastSrcSsrc = h.ssrc;
      st.lastSrcTs = h.timestamp;
      st.ts = (st.ts + delta) >>> 0;
      st.seq = (st.seq + 1) & 0xffff;
      h.payloadType = getPt();
      h.sequenceNumber = st.seq;
      h.timestamp = st.ts;
      h.extension = false;
      h.extensions = [];
      h.csrc = [];
      h.csrcLength = 0;
      track.writeRtp(rtp);
    } catch {}
  };
};

// Execute a tool the AI agent invoked during a call.
// Log an AI-call outbound WhatsApp message into the chat so it is visible in inbox.
async function logCallOutbound(workspaceId, phone, type, text, sendResult) {
  try {
    if (!workspaceId || !phone) return;
    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const digits = String(phone).replace(/[^0-9]/g, '');
    const contact = await Contact.findOne({ workspace: workspaceId, phone: { $in: [digits, digits.slice(-10), '91' + digits.slice(-10)] } });
    if (!contact) return;
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: workspaceId, contact: contact._id },
      { workspace: workspaceId, contact: contact._id, status: 'active',
        lastMessage: { text: text || '[' + type + ']', timestamp: new Date(), direction: 'outbound', type } },
      { upsert: true, new: true }
    );
    const msg = await Message.create({
      workspace: workspaceId,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type,
      text: text || '',
      waMessageId: sendResult?.data?.messages?.[0]?.id || '',
      status: sendResult?.success === false ? 'failed' : 'sent',
      metadata: { source: 'ai_call' },
    });
    if (global.io) global.io.to('workspace:' + workspaceId).emit('new_message', { message: msg, conversationId: conversation._id });
  } catch (e) { console.error('[AI Call] chat log failed:', e.message); }
}

async function handleTool(name, args, ctx) {
  if (name === 'book_appointment') {
    if (!ctx.workspaceId) return { ok: false, error: 'no workspace context' };
    const Appointment = require('../models/Appointment');
    const Contact = require('../models/Contact');
    const digits = (ctx.phone || '').replace(/[^0-9]/g, '');
    const contact = digits
      ? await Contact.findOne({ workspace: ctx.workspaceId, phone: { $in: [digits, digits.slice(-10), '91' + digits.slice(-10)] } })
      : null;
    const time = args.time || '10:00';
    const [hh, mm] = time.split(':').map(Number);
    const endMin = (hh * 60 + (mm || 0) + 30) % 1440;
    const endTime = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
    const appt = await Appointment.create({
      workspace: ctx.workspaceId,
      title: args.purpose || 'Appointment (AI call)',
      contact: contact?._id,
      contactName: args.name || contact?.name || '',
      contactPhone: digits,
      date: new Date(args.date),
      startTime: time,
      endTime,
      notes: 'Booked by AI calling agent',
      metadata: { source: 'ai_call' },
    });
    // Send the customer a WhatsApp confirmation with Confirm/Reschedule/Cancel buttons.
    if (ctx.accessToken && ctx.phoneNumberId && digits) {
      try {
        const WhatsAppService = require('./whatsappService');
        const wa = new WhatsAppService(ctx.accessToken, ctx.phoneNumberId);
        const dStr = new Date(args.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
        const apptBody = 'Your appointment has been booked!' + String.fromCharCode(10, 10) + (appt.title || 'Appointment') + String.fromCharCode(10) + 'Date: ' + dStr + String.fromCharCode(10) + 'Time: ' + time + ' (IST)';
        const apptRes = await wa.sendInteractiveMessage(digits, {
          type: 'button',
          body: { text: apptBody },
        action: { buttons: [
            { type: 'reply', reply: { id: 'appt_confirm_' + appt._id, title: 'Confirm' } },
            { type: 'reply', reply: { id: 'appt_reschedule_' + appt._id, title: 'Reschedule' } },
            { type: 'reply', reply: { id: 'appt_cancel_' + appt._id, title: 'Cancel' } },
          ] },
        });
        await logCallOutbound(ctx.workspaceId, digits, 'interactive', apptBody, apptRes);
      } catch (e) { console.error('[AI Call] appt buttons send failed:', e.message); }
    }
    return { ok: true, appointment_id: String(appt._id), date: args.date, time, name: args.name || contact?.name || '' };
  }
  const digits = (ctx.phone || '').replace(/[^0-9]/g, '');
  const findContact = async () => {
    if (!digits || !ctx.workspaceId) return null;
    const Contact = require('../models/Contact');
    return Contact.findOne({ workspace: ctx.workspaceId, phone: { $in: [digits, digits.slice(-10), '91' + digits.slice(-10)] } });
  };

  if (name === 'save_lead') {
    if (!ctx.workspaceId) return { ok: false, error: 'no workspace context' };
    const Pipeline = require('../models/Pipeline');
    const contact = await findContact();
    let p = await Pipeline.findOne({ workspace: ctx.workspaceId, status: 'active' });
    if (!p) p = await Pipeline.create({ workspace: ctx.workspaceId, name: 'Leads', stages: [{ id: 'new', name: 'New', order: 0 }] });
    const stage = p.stages[0]?.id || 'new';
    const budget = parseFloat(String(args.budget || '').replace(/[^0-9.]/g, '')) || 0;
    p.deals.push({
      title: (args.name || contact?.name || digits) + ' — ' + (args.requirement || 'AI call lead'),
      value: budget,
      contact: contact?._id,
      stage,
      notes: 'Source: AI call\n' + (args.requirement || '') + (args.budget ? '\nBudget: ' + args.budget : ''),
    });
    await p.save();
    console.log('[AI Call] lead saved:', args.requirement);
    return { ok: true, lead_saved: true };
  }

  if (name === 'schedule_callback') {
    if (!ctx.workspaceId || !digits) return { ok: false, error: 'no context' };
    const ScheduledCall = require('../models/ScheduledCall');
    let at;
    if (args.minutes_from_now !== undefined && args.minutes_from_now !== null) {
      const mins = Math.max(0, Number(args.minutes_from_now) || 0);
      at = new Date(Date.now() + mins * 60000);
    } else {
      at = new Date((args.date || '') + 'T' + (args.time || '10:00') + ':00+05:30');
    }
    if (isNaN(at.getTime()) || at.getTime() < Date.now() - 60000) return { ok: false, error: 'invalid or past date/time' };
    // Reschedule if an AI callback is already pending for this number (avoid duplicates).
    const pendingCall = await ScheduledCall.findOne({ workspace: ctx.workspaceId, phone: digits, type: 'ai_callback', status: 'pending' }).sort('-createdAt');
    if (pendingCall) { pendingCall.at = at; if (args.reason) pendingCall.reason = args.reason; await pendingCall.save(); }
    else { await ScheduledCall.create({ workspace: ctx.workspaceId, phone: digits, at, reason: args.reason || '', type: 'ai_callback' }); }
    try {
      const cbContact = await findContact();
      if (cbContact) {
        const ContactNote = require('../models/ContactNote');
        const cbText = 'Callback requested by customer (auto)' + (args.reason ? ' - ' + args.reason : '');
        const cbExisting = await ContactNote.findOne({ workspace: ctx.workspaceId, contact: cbContact._id, contacted: { $ne: true }, text: { $regex: '^Callback requested by customer' } }).sort('-createdAt');
        if (cbExisting) { cbExisting.remindAt = at; cbExisting.text = cbText; cbExisting.reminderSent = false; await cbExisting.save(); }
        else { await ContactNote.create({ workspace: ctx.workspaceId, contact: cbContact._id, text: cbText, remindAt: at, contacted: false, notifyCustomer: false }); }
        const Contact = require('../models/Contact');
        await Contact.findByIdAndUpdate(cbContact._id, { callStatus: 'callback' });
      }
    } catch (e) { /* noop: reminder is best-effort */ }
    console.log('[AI Call] callback scheduled for', at.toISOString());
    return { ok: true, scheduled_at: at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' };
  }

  if (name === 'cancel_callback') {
    if (!ctx.workspaceId || !digits) return { ok: false, error: 'no context' };
    const ScheduledCall = require('../models/ScheduledCall');
    await ScheduledCall.updateMany({ workspace: ctx.workspaceId, phone: digits, type: 'ai_callback', status: 'pending' }, { $set: { status: 'done', note: 'Cancelled by customer' } });
    let cbCancelled = 0;
    try {
      const cbContact = await findContact();
      if (cbContact) {
        const ContactNote = require('../models/ContactNote');
        const cbRemark = 'Customer ne callback cancel karwa di' + (args.reason ? ' - ' + args.reason : '');
        const cbNotes = await ContactNote.find({ workspace: ctx.workspaceId, contact: cbContact._id, contacted: { $ne: true }, text: { $regex: '^Callback requested by customer' } });
        for (const cbN of cbNotes) { cbN.contacted = true; cbN.reminderSent = true; cbN.contactedRemark = cbRemark; await cbN.save(); cbCancelled++; }
        const Contact = require('../models/Contact');
        await Contact.findByIdAndUpdate(cbContact._id, { callStatus: '' });
      }
    } catch (e) { /* noop */ }
    console.log('[AI Call] callback cancelled for', digits, 'notes:', cbCancelled);
    return { ok: true, cancelled: cbCancelled };
  }

  if (name === 'transfer_to_human') {
    if (!ctx.workspaceId) return { ok: false, error: 'no workspace context' };
    const ScheduledCall = require('../models/ScheduledCall');
    await ScheduledCall.create({ workspace: ctx.workspaceId, phone: digits, at: new Date(), reason: args.reason || 'Customer asked to talk to a human', type: 'human_callback' });
    try {
      global._io?.to('workspace:' + ctx.workspaceId).emit('human_transfer_request', { phone: digits, reason: args.reason || '' });
    } catch {}
    require('./ownerNotify').humanRequested(ctx.workspaceId, digits, args.reason).catch(() => {});
    console.log('[AI Call] human transfer requested by', digits);
    return { ok: true, message: 'Team has been notified and will call the customer shortly.' };
  }

  if (name === 'send_catalog') {
    const url = ctx.agent?.catalogUrl;
    if (!url) return { ok: false, error: 'No catalog is configured. Tell the caller you will share it later.' };
    if (!ctx.accessToken || !ctx.phoneNumberId || !digits) return { ok: false, error: 'no whatsapp context' };
    const WhatsAppService = require('./whatsappService');
    const wa = new WhatsAppService(ctx.accessToken, ctx.phoneNumberId);
    const isImage = /\.(png|jpe?g|webp)(\?|$)/i.test(url);
    const r = await wa.sendMediaMessage(digits, isImage ? 'image' : 'document', url, 'Catalog / Price list');
    if (!r?.success) return { ok: false, error: 'send failed' };
    await logCallOutbound(ctx.workspaceId, digits, isImage ? 'image' : 'document', 'Catalog / Price list', r);
    console.log('[AI Call] catalog sent to', digits);
    return { ok: true, sent: true };
  }

  if (name === 'send_whatsapp_message') {
    const message = String(args.message || '').trim();
    if (!message) return { ok: false, error: 'no message text provided' };
    if (!ctx.accessToken || !ctx.phoneNumberId || !digits) return { ok: false, error: 'no whatsapp context' };
    const WhatsAppService = require('./whatsappService');
    const wa = new WhatsAppService(ctx.accessToken, ctx.phoneNumberId);
    const r = await wa.sendTextMessage(digits, message);
    if (!r?.success) return { ok: false, error: 'send failed' };
    await logCallOutbound(ctx.workspaceId, digits, 'text', message, r);
    console.log('[AI Call] send_whatsapp_message sent to', digits);
    return { ok: true, sent: true };
  }

  if (name === 'get_order_status') {
    if (!ctx.workspaceId) return { ok: false, error: 'no workspace context' };
    const Order = require('../models/Order');
    let order = null;
    if (args.order_number) {
      const esc = String(args.order_number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      order = await Order.findOne({ workspace: ctx.workspaceId, orderNumber: new RegExp('^' + esc + '$', 'i') });
    }
    if (!order) {
      const contact = await findContact();
      if (contact) order = await Order.findOne({ workspace: ctx.workspaceId, contact: contact._id }).sort('-createdAt');
    }
    if (!order) return { ok: false, error: 'order not found' };
    return {
      ok: true,
      order_number: order.orderNumber,
      status: order.status,
      payment_status: order.paymentStatus,
      total: order.totalAmount + ' ' + order.currency,
      items: order.items.map(i => i.name + ' x' + i.quantity),
    };
  }

  // Handle callTools module tools (create_order, send_payment_reminder, qualify_lead, schedule_followup, collect_feedback, create_ticket)
  if (['create_order', 'send_payment_reminder', 'qualify_lead', 'schedule_followup', 'collect_feedback', 'create_ticket'].includes(name)) {
    try {
      const result = await executeTool(name, args, ctx);
      return JSON.parse(result);
    } catch (e) {
      console.error('[AI Call] callTool error:', name, e.message);
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: 'unknown tool: ' + name };
}

// The AI leg delivers audio in bursts (faster than realtime). Relaying those
// packets straight to the phone overruns its jitter buffer and the voice breaks
// up. Pace them out at the Opus frame interval (20ms) instead.
async function recordingEnabled(workspaceId) {
  try {
    const AISettings = require('../models/AISettings');
    const ai = await AISettings.findOne({ workspace: workspaceId }).select('callRecording').lean();
    return ai?.callRecording?.enabled !== false;
  } catch { return true; }
}

function makePacer(send) {
  const FRAME = 20;          // Opus frame interval (ms)
  const MAX_BACKLOG = 3000;  // the WS leg delivers audio in large bursts; keep up to ~60s queued
  const q = [];
  let timer = null;
  let nextAt = 0;
  const tick = () => {
    const now = Date.now();
    // Send every packet whose slot has passed; if the timer fired late we
    // catch up by flushing several at once so playback never runs slow.
    while (q.length && now >= nextAt) {
      const pkt = q.shift();
      try { send(pkt); } catch {}
      nextAt += FRAME;
    }
    if (!q.length && timer) { clearInterval(timer); timer = null; }
  };
  const pacer = (rtp) => {
    q.push(rtp);
    if (q.length > MAX_BACKLOG) q.splice(0, q.length - MAX_BACKLOG);
    if (!timer) {
      nextAt = Date.now();
      timer = setInterval(tick, 5);
    }
  };
  pacer.stop = () => { if (timer) { clearInterval(timer); timer = null; } q.length = 0; };
  return pacer;
}

// Attach an external TTS speaker (ElevenLabs/Sarvam/Cartesia) when the agent is
// configured for one; returns null to use OpenAI's built-in voice.
function maybeExternalSpeaker(agent, pace) {
  try {
    const provider = agent?.voiceProvider;
    if (!['elevenlabs', 'sarvam', 'cartesia'].includes(provider)) return null;
    const apiKey = agent?.voiceApiKey || agent?.voiceConfig?.apiKey;
    if (!apiKey) return null;
    const voiceId = agent?.voiceId || '';
    if (!voiceId && provider !== 'sarvam') {
      console.error('[AI Call] external voice: missing voiceId for', provider, '- using OpenAI voice');
      return null;
    }
    const { createSpeaker } = require('./externalVoice');
    const speaker = createSpeaker({ provider, apiKey, voiceId, onRtp: pace });
    if (!speaker) { console.log('[AI Call] external voice init returned null, using OpenAI voice'); return null; }
    console.log('[AI Call] external voice pipeline active:', provider);
    return speaker;
  } catch (e) {
    console.error('[AI Call] external voice init failed:', e.message);
    return null;
  }
}

// Start an AI voice bridge for an inbound call.
async function startInbound({ apiKey, callId, offerSdp, instructions, greeting, voice, accessToken, phoneNumberId, workspaceId, from, agent, azure }) {
  if (bridges.has(callId)) return { ok: true, already: true };

  let meta, oai, toAi, toMeta;
  let recorder = null;
  try {
    if (await recordingEnabled(workspaceId)) recorder = require('./callRecorder').createRecorder(callId);
  } catch (e) { console.error('[Call Rec] init failed:', e.message); }
  // Meta leg first so we know its Opus PT before relaying AI audio.
  meta = await connectMeta({
    offerSdp,
    onCustomerRtp: (rtp) => {
      context.rtpIn++;
      try { recorder && recorder.addCustomer(rtp); } catch {}
      if (oai && toAi) toAi(rtp);
    },
  });

  const pace = makePacer((rtp) => { context.rtpOut++; context._lastAiOut = Date.now(); try { recorder && recorder.addAi(rtp); } catch {} if (toMeta) toMeta(rtp); });
  const context = { workspaceId, phone: from, transcript: [], rtpIn: 0, rtpOut: 0, accessToken, phoneNumberId, agent, _speechActive: false, _dc: null, _lastResponseDone: Date.now(), _lastContentResponse: Date.now(), _lastSpeechDetected: Date.now() };
  context.recorder = recorder;
  const customerName = await lookupContactName(workspaceId, from);
  context.externalSpeaker = maybeExternalSpeaker(agent, pace);
  context.onBargeIn = () => { if (!context.externalSpeaker) { try { pace.stop(); } catch {} } };
  context.statTimer = setInterval(() => {
    console.log(`[AI Call] rtp last5s customer->ai=${context.rtpIn} ai->customer=${context.rtpOut}`);
    const customerAudio = context.rtpIn > 10;
    const aiSilent = context.rtpOut < 5;
    context.rtpIn = 0; context.rtpOut = 0;
    const now = Date.now();
    const sinceLast = now - (context._lastContentResponse || context._lastResponseDone || now);
    const sinceVAD = now - (context._lastSpeechDetected || now);
    if (!aiSilent) context._watchdogFired = 0;
    // Hard recovery: watchdog fired but AI still dead 8s later -> rebuild the OpenAI leg
    if (customerAudio && aiSilent && context._watchdogFired && now - context._watchdogFired > 8000 && !context._reconnecting) {
      context._reconnecting = true;
      context._watchdogFired = 0;
      console.log('[AI Call] reconnecting OpenAI leg (AI unresponsive)');
      (async () => {
        try {
          try { oai.pc.close(); } catch {}
          const convo = (context.transcript || []).slice(-12).map(t => t.role + ': ' + t.text).join('\n');
          const newOai = await connectOpenAI({
            apiKey,
            azure,
            instructions: (instructions || '') + (convo ? '\n\nCALL IN PROGRESS - conversation so far (continue naturally, do NOT restart or re-greet):\n' + convo : ''),
            greeting: '',
            voice,
            customerName,
            onAiRtp: pace,
            context,
          });
          oai = newOai;
          toAi = makeRewriter(oai.localTrack, () => oai.oaiPT);
          for (const b of bridges.values()) { if (b.context === context) b.oai = newOai; }
          context._lastContentResponse = Date.now();
          context._lastSpeechDetected = Date.now();
          console.log('[AI Call] OpenAI leg reconnected');
        } catch (e) {
          console.error('[AI Call] reconnect failed:', e.message);
        } finally { context._reconnecting = false; }
      })();
    }
    // Watchdog 1: if customer audio flowing but AI silent for >10s and no active response, force
    else if (customerAudio && aiSilent && !context._responseActive && sinceLast > 10000 && context._dc && !context._reconnecting) {
      console.log('[AI Call] watchdog: AI silent ' + Math.round(sinceLast/1000) + 's, forcing response');
      try {
        context._dc.send(JSON.stringify({ type: 'response.create' }));
        context._lastContentResponse = now; // prevent rapid re-fire
        context._watchdogFired = now;
      } catch (e) { console.error('[AI Call] watchdog error:', e.message); }
    }
    // Watchdog 2: VAD recovery - if VAD hasn't fired in 20s but customer audio present
    if (customerAudio && sinceVAD > 20000 && !context._responseActive && context._dc) {
      console.log('[AI Call] VAD recovery: no speech_started in ' + Math.round(sinceVAD/1000) + 's, refreshing session + forcing response');
      try {
        // Refresh session to re-init VAD
        context._dc.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true } } } } }));
        context._dc.send(JSON.stringify({ type: 'response.create' }));
        context._lastSpeechDetected = now;
      } catch (e) { console.error('[AI Call] VAD recovery error:', e.message); }
    }
  }, 5000);
  oai = await connectOpenAI({
    apiKey, azure, instructions, greeting, voice, customerName,
    onAiRtp: pace,
    context,
  });

  toAi = makeRewriter(oai.localTrack, () => oai.oaiPT);
  toMeta = makeRewriter(meta.localTrack, () => meta.metaPT);

  // Hand our SDP answer to Meta so it connects to us (not the browser).
  await axios.post(
    `${GRAPH}/${phoneNumberId}/calls`,
    { messaging_product: 'whatsapp', call_id: callId, action: 'accept', session: { sdp_type: 'answer', sdp: meta.answerSdp } },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );

  bridges.set(callId, { meta, oai, pace, context, apiKey, accessToken, phoneNumberId, startedAt: Date.now() });
  return { ok: true };
}

// Start an AI voice bridge for an outbound (business-initiated) call.
// We send our offer to Meta; the answer comes back via webhook -> completeOutbound().
async function startOutbound({ apiKey, to, instructions, greeting, voice, accessToken, phoneNumberId, workspaceId, agent, azure }) {
  let meta, oai, toAi, toMeta;
  const context = { workspaceId, phone: to, transcript: [], rtpIn: 0, rtpOut: 0, accessToken, phoneNumberId, agent, _speechActive: false, _dc: null, _lastResponseDone: Date.now(), _lastContentResponse: Date.now(), _lastSpeechDetected: Date.now() };
  const customerName = await lookupContactName(workspaceId, to);
  context.statTimer = setInterval(() => {
    console.log(`[AI Call] rtp last5s customer->ai=${context.rtpIn} ai->customer=${context.rtpOut}`);
    const customerAudio = context.rtpIn > 10;
    const aiSilent = context.rtpOut < 5;
    context.rtpIn = 0; context.rtpOut = 0;
    const now = Date.now();
    const sinceLast = now - (context._lastContentResponse || context._lastResponseDone || now);
    const sinceVAD = now - (context._lastSpeechDetected || now);
    if (!aiSilent) context._watchdogFired = 0;
    // Hard recovery: watchdog fired but AI still dead 8s later -> rebuild the OpenAI leg
    if (customerAudio && aiSilent && context._watchdogFired && now - context._watchdogFired > 8000 && !context._reconnecting) {
      context._reconnecting = true;
      context._watchdogFired = 0;
      console.log('[AI Call] reconnecting OpenAI leg (AI unresponsive)');
      (async () => {
        try {
          try { oai.pc.close(); } catch {}
          const convo = (context.transcript || []).slice(-12).map(t => t.role + ': ' + t.text).join('\n');
          const newOai = await connectOpenAI({
            apiKey,
            azure,
            instructions: (instructions || '') + (convo ? '\n\nCALL IN PROGRESS - conversation so far (continue naturally, do NOT restart or re-greet):\n' + convo : ''),
            greeting: '',
            voice,
            customerName,
            onAiRtp: pace,
            context,
          });
          oai = newOai;
          toAi = makeRewriter(oai.localTrack, () => oai.oaiPT);
          for (const b of bridges.values()) { if (b.context === context) b.oai = newOai; }
          context._lastContentResponse = Date.now();
          context._lastSpeechDetected = Date.now();
          console.log('[AI Call] OpenAI leg reconnected');
        } catch (e) {
          console.error('[AI Call] reconnect failed:', e.message);
        } finally { context._reconnecting = false; }
      })();
    }
    // Watchdog 1: if customer audio flowing but AI silent for >10s and no active response, force
    else if (customerAudio && aiSilent && !context._responseActive && sinceLast > 10000 && context._dc && !context._reconnecting) {
      console.log('[AI Call] watchdog: AI silent ' + Math.round(sinceLast/1000) + 's, forcing response');
      try {
        context._dc.send(JSON.stringify({ type: 'response.create' }));
        context._lastContentResponse = now; // prevent rapid re-fire
        context._watchdogFired = now;
      } catch (e) { console.error('[AI Call] watchdog error:', e.message); }
    }
    // Watchdog 2: VAD recovery - if VAD hasn't fired in 20s but customer audio present
    if (customerAudio && sinceVAD > 20000 && !context._responseActive && context._dc) {
      console.log('[AI Call] VAD recovery: no speech_started in ' + Math.round(sinceVAD/1000) + 's, refreshing session + forcing response');
      try {
        // Refresh session to re-init VAD
        context._dc.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true } } } } }));
        context._dc.send(JSON.stringify({ type: 'response.create' }));
        context._lastSpeechDetected = now;
      } catch (e) { console.error('[AI Call] VAD recovery error:', e.message); }
    }
  }, 5000);
  const pace = makePacer((rtp) => { context.rtpOut++; context._lastAiOut = Date.now(); try { context.recorder && context.recorder.addAi(rtp); } catch {} if (meta && meta.metaPT && toMeta) toMeta(rtp); });
  context.externalSpeaker = maybeExternalSpeaker(agent, pace);
  context.onBargeIn = () => { if (!context.externalSpeaker) { try { pace.stop(); } catch {} } };
  oai = await connectOpenAI({
    apiKey, azure, instructions, greeting, voice, customerName,
    onAiRtp: pace,
    context,
  });

  meta = await connectMetaOffer({
    onCustomerRtp: (rtp) => {
      context.rtpIn++;
      try { context.recorder && context.recorder.addCustomer(rtp); } catch {}
      if (oai && toAi) toAi(rtp);
    },
  });
  toAi = makeRewriter(oai.localTrack, () => oai.oaiPT);
  toMeta = makeRewriter(meta.localTrack, () => meta.metaPT);

  const callRes = await axios.post(
    `${GRAPH}/${phoneNumberId}/calls`,
    { messaging_product: 'whatsapp', to, action: 'connect', session: { sdp_type: 'offer', sdp: meta.offerSdp } },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  const callId = callRes.data?.calls?.[0]?.id;
  if (!callId) {
    try { meta.pc.close(); } catch {}
    try { oai.pc.close(); } catch {}
    throw new Error('Call API did not return a call id');
  }

  try {
    if (await recordingEnabled(workspaceId)) context.recorder = require('./callRecorder').createRecorder(callId);
  } catch (e) { console.error('[Call Rec] init failed:', e.message); }
  bridges.set(callId, { meta, oai, pace, context, apiKey, accessToken, phoneNumberId, outboundPending: true, startedAt: Date.now() });
  return { ok: true, callId, to };
}

// Complete an outbound bridge once Meta's SDP answer arrives via webhook.
// Returns true if this callId was an AI outbound bridge (so the webhook should
// not also hand the answer to the browser).
async function completeOutbound(callId, answerSdp) {
  const b = bridges.get(callId);
  if (!b || !b.outboundPending) return false;
  b.outboundPending = false;
  b.meta.metaPT = opusPT(answerSdp);
  await b.meta.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  return true;
}

// After the call ends, generate an AI summary of the conversation and send it
// to the caller on WhatsApp (also saved into the panel chat).
async function sendCallSummary(b) {
  const t = b.context?.transcript || [];
  if (!t.length || !b.accessToken || !b.phoneNumberId || !b.context?.phone) return;
  // Agent-level toggle: skip the customer summary message when turned off.
  if (b.context?.agent && b.context.agent.callSummaryEnabled === false) return;
  const aiService = require('../services/aiService');
  const AISettings = require('../models/AISettings');
  // Use the workspace CHAT AI (e.g. Azure OpenAI) for the summary, not the realtime voice key.
  const chatAi = await AISettings.findOne({ workspace: b.context.workspaceId }).lean();
  if (!chatAi?.apiKey) return;
  const convoText = t.map(x => (x.role === 'user' ? 'Customer: ' : 'Agent: ') + x.text).join('\n');
  const r = await aiService.chat(chatAi.provider || 'openai', chatAi.apiKey, [
    { role: 'system', content: 'You summarize phone calls. Write a short, friendly WhatsApp message for the customer summarizing what was discussed on the call just now. Write it in the SAME language and script the customer actually spoke on the call: if they spoke English, write in English; if Hindi, write in Hindi; match their language. Begin with a short heading in that same language (e.g. in English: "Summary of our call:"). Include any appointment/decision details. Keep it under 120 words. No preamble.' },
    { role: 'user', content: convoText },
  ], { model: chatAi.model || 'gpt-4o-mini', maxTokens: 300, ...aiService.azureOpts(chatAi) });
  const summary = r?.content?.trim();
  if (!summary) return;
  require('./ownerNotify').callSummary(b.context.workspaceId, b.context.phone, summary).catch(() => {});
  const WhatsAppService = require('./whatsappService');
  const wa = new WhatsAppService(b.accessToken, b.phoneNumberId);
  const sendResult = await wa.sendTextMessage(b.context.phone, summary);
  if (!sendResult?.success) return;
  try {
    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const digits = b.context.phone.replace(/[^0-9]/g, '');
    const contact = await Contact.findOne({ workspace: b.context.workspaceId, phone: { $in: [digits, digits.slice(-10), '91' + digits.slice(-10)] } });
    if (!contact) return;
    const conversation = await Conversation.findOne({ workspace: b.context.workspaceId, contact: contact._id });
    if (!conversation) return;
    await Message.create({
      workspace: b.context.workspaceId,
      conversation: conversation._id,
      contact: contact._id,
      direction: 'outbound',
      type: 'text',
      text: summary,
      waMessageId: sendResult.data?.messages?.[0]?.id || '',
      status: 'sent',
      metadata: { source: 'ai_call_summary' },
    });
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: { text: summary, timestamp: new Date(), direction: 'outbound', type: 'text' },
    });
    // CRM: keep the call summary + transcript on the contact profile.
    const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const note = '\n\n[AI Call ' + stamp + ']\n' + summary + '\n--- Transcript ---\n' + convoText;
    contact.notes = ((contact.notes || '') + note).slice(-20000);
    await contact.save();
  } catch (e) { console.error('[AI Call] summary save failed:', e.message); }
  // Optional follow-up message configured on the agent.
  try {
    const follow = b.context?.agent?.followUpMessage;
    if (follow) {
      const WhatsAppService2 = require('./whatsappService');
      const wa2 = new WhatsAppService2(b.accessToken, b.phoneNumberId);
      const fr = await wa2.sendTextMessage(b.context.phone, follow);
      await logCallOutbound(b.context.workspaceId, b.context.phone, 'text', follow, fr);
    }
  } catch (e) { console.error('[AI Call] follow-up failed:', e.message); }
}

function stop(callId) {
  const b = bridges.get(callId);
  if (!b) return;
  try {
    const rec = b.context?.recorder;
    if (rec) {
      b.context.recorder = null;
      rec.stop().then((url) => {
        if (url) require('../models/CallSession').findOneAndUpdate({ callId }, { recordingUrl: url }).exec();
      }).catch((e) => console.error('[Call Rec] finalize failed:', e.message));
    }
  } catch {}
  try { b.context?.externalSpeaker?.close?.(); } catch {}
  try { b.pace?.stop?.(); } catch {}
  try { if (b.context?.statTimer) clearInterval(b.context.statTimer); } catch {}
  try { b.meta?.pc?.close(); } catch {}
  try { b.oai?.pc?.close(); } catch {}
  bridges.delete(callId);
  sendCallSummary(b).catch(e => console.error('[AI Call] summary failed:', e.message));
  if (b.context?._callFailed) require('./ownerNotify').aiCallFailed(b.context.workspaceId, b.context.phone, b.context._callError || 'unknown').catch(() => {});
}


// Start an AI voice bridge using Groq+Sarvam (budget pipeline, no OpenAI).
async function startInboundGroq({ callId, offerSdp, instructions, greeting, accessToken, phoneNumberId, workspaceId, from, agent }) {
  if (bridges.has(callId)) return { ok: true, already: true };
  const { GroqBridge } = require('./groqBridge');

  let recorder = null;
  try {
    if (await recordingEnabled(workspaceId)) recorder = require('./callRecorder').createRecorder(callId);
  } catch (e) { console.error('[Call Rec] init failed:', e.message); }

  const groqApiKey = agent?.groqApiKey || '';
  const sarvamApiKey = agent?.voiceApiKey || agent?.voiceConfig?.apiKey || '';
  const voiceId = agent?.voiceId || 'priya';

  if (!groqApiKey) { console.error('[AI Call][Groq] No Groq API key'); return { ok: false, error: 'Missing Groq API key' }; }
  if (!sarvamApiKey) { console.error('[AI Call][Groq] No Sarvam API key'); return { ok: false, error: 'Missing Sarvam API key' }; }

  const context = { workspaceId, phone: from, transcript: [], rtpIn: 0, rtpOut: 0, accessToken, phoneNumberId, agent };

  let toMeta = null;
  const pace = makePacer((rtp) => { context.rtpOut++; context._lastAiOut = Date.now(); try { recorder && recorder.addAi(rtp); } catch {} if (toMeta) toMeta(rtp); });

  const bridge = new GroqBridge({
    groqApiKey,
    sarvamApiKey,
    voiceId,
    instructions: instructions || agent?.prompt || '',
    greeting: greeting || agent?.greeting || '',
    onRtp: pace,
    workspaceId,
    phone: from,
    accessToken,
    phoneNumberId,
  });

  const meta = await connectMeta({
    offerSdp,
    onCustomerRtp: (rtp) => {
      context.rtpIn++;
      try { recorder && recorder.addCustomer(rtp); } catch {}
      bridge.feedCustomerRtp(rtp);
    },
  });

  toMeta = makeRewriter(meta.localTrack, () => meta.metaPT);

  // Accept the call
  const acceptUrl = GRAPH + '/' + phoneNumberId + '/calls';
  await axios.post(
    acceptUrl,
    { messaging_product: 'whatsapp', call_id: callId, action: 'accept', session: { sdp_type: 'answer', sdp: meta.answerSdp } },
    { headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' } }
  );

  context.statTimer = setInterval(() => {
    console.log('[AI Call][Groq] rtp last5s customer->ai=' + context.rtpIn + ' ai->customer=' + context.rtpOut);
    context.rtpIn = 0; context.rtpOut = 0;
  }, 5000);

  const cleanup = () => {
    if (context.statTimer) clearInterval(context.statTimer);
    bridge.close();
    try { meta.pc.close(); } catch {}
    try { recorder && recorder.stop(); } catch {}
    bridges.delete(callId);
  };

  meta.pc.connectionStateChange.subscribe(s => {
    console.log('[AI Call][Groq] Meta pc state:', s);
    if (['closed', 'disconnected', 'failed'].includes(s)) cleanup();
  });

  bridges.set(callId, { meta, pace, context, bridge, cleanup, startedAt: Date.now() });
  console.log('[AI Call][Groq] Bridge started for ' + from + ' - voice: ' + voiceId);
  return { ok: true };
}

module.exports = { startInbound, startInboundGroq, startOutbound, completeOutbound, stop, connectOpenAI, connectMeta, connectMetaOffer, handleTool, _bridges: bridges };
