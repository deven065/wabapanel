// External voice pipeline for AI calls.
// The OpenAI Realtime session runs text-only (it still listens to the caller's
// audio); assistant text is streamed here, synthesized with the configured TTS
// provider (ElevenLabs / Sarvam / Cartesia), resampled to 48k, Opus-encoded and
// emitted as RTP packets toward the WhatsApp leg.
const { RtpPacket, RtpHeader } = require('werift');
let OpusEncoder = null;
try { ({ OpusEncoder } = require('@discordjs/opus')); } catch { /* optional: AI voice calling disabled without native opus */ }

const FRAME = 960; // 20ms @ 48k mono

// s16le mono PCM resample (linear interpolation)
function resampleTo48k(pcm, srcRate) {
  if (srcRate === 48000) return pcm;
  const src = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const outLen = Math.floor(src.length * 48000 / srcRate);
  const out = new Int16Array(outLen);
  const ratio = srcRate / 48000;
  // 4-point cubic (Hermite) interpolation for better audio quality
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = src[Math.max(idx - 1, 0)];
    const s1 = src[idx] || 0;
    const s2 = src[Math.min(idx + 1, src.length - 1)];
    const s3 = src[Math.min(idx + 2, src.length - 1)];
    // Hermite interpolation
    const c0 = s1;
    const c1 = 0.5 * (s2 - s0);
    const c2 = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3;
    const c3 = 0.5 * (s3 - s0) + 1.5 * (s1 - s2);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(((c3 * frac + c2) * frac + c1) * frac + c0)));
  }
  return Buffer.from(out.buffer);
}

async function ttsElevenLabs({ apiKey, voiceId, text }) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      signal: ac.signal,
    });
    clearTimeout(tm);
    if (!r.ok) throw new Error('ElevenLabs TTS ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return { pcm: Buffer.from(await r.arrayBuffer()), rate: 24000 };
  } catch (e) { clearTimeout(tm); throw e; }
}

// Speakers supported by Sarvam's bulbul:v3 model. A voiceId left over from another
// provider (e.g. OpenAI's "marin") would otherwise make Sarvam reject the request.
const SARVAM_V3_SPEAKERS = ['aditya', 'ritu', 'ashutosh', 'priya', 'neha', 'rahul', 'pooja', 'rohan',
  'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit', 'roopa',
  'kabir', 'aayan', 'shubh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani', 'gokul', 'vijay',
  'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali', 'niharika'];

async function ttsSarvam({ apiKey, voiceId, text }) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 8000);
  const speaker = SARVAM_V3_SPEAKERS.includes((voiceId || '').toLowerCase())
    ? voiceId.toLowerCase() : 'priya';
  try {
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, model: 'bulbul:v3',
        speaker,
        target_language_code: 'hi-IN',
        speech_sample_rate: 48000,
      }),
      signal: ac.signal,
    });
    clearTimeout(tm);
    if (!r.ok) throw new Error('Sarvam TTS ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const body = await r.json();
    const wav = Buffer.from(body.audios?.[0] || '', 'base64');
    if (wav.length <= 44) throw new Error('Sarvam TTS returned empty audio');
    return { pcm: wav.subarray(44), rate: 48000 };
  } catch (e) { clearTimeout(tm); throw e; }
}

async function ttsCartesia({ apiKey, voiceId, text }) {
  const r = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2024-06-10', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: text,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24000 },
      language: 'hi',
    }),
  });
  if (!r.ok) throw new Error('Cartesia TTS ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return { pcm: Buffer.from(await r.arrayBuffer()), rate: 24000 };
}

const TTS = { elevenlabs: ttsElevenLabs, sarvam: ttsSarvam, cartesia: ttsCartesia };

// Creates a speaker: feed(textDelta), flush(), interrupt(), close().
// onRtp(rtpPacket) receives 20ms Opus RTP packets (paced downstream).
function createSpeaker({ provider, apiKey, voiceId, onRtp }) {
  const tts = TTS[provider];
  if (!tts) throw new Error('unknown voice provider: ' + provider);
  const encoder = new OpusEncoder(48000, 1);
  try { encoder.setBitrate(48000); } catch {} // 48kbps for clear voice
  let seq = Math.floor(Math.random() * 30000);
  let ts = Math.floor(Math.random() * 1000000) >>> 0;
  const ssrc = Math.floor(Math.random() * 0xffffffff) >>> 0;
  let pending = '';        // text not yet sent to TTS
  let gen = 0;             // bumped on interrupt: cancels in-flight synthesis
  let queue = Promise.resolve();

  const emitPcm48 = (pcm48) => {
    let leftover = state.leftover ? Buffer.concat([state.leftover, pcm48]) : pcm48;
    let off = 0;
    while (leftover.length - off >= FRAME * 2) {
      const frame = leftover.subarray(off, off + FRAME * 2);
      off += FRAME * 2;
      let payload;
      try { payload = encoder.encode(frame); } catch { continue; }
      ts = (ts + FRAME) >>> 0;
      seq = (seq + 1) & 0xffff;
      const pkt = new RtpPacket(new RtpHeader({
        payloadType: 111, sequenceNumber: seq, timestamp: ts, ssrc, marker: false,
      }), payload);
      try { onRtp(pkt); } catch {}
    }
    state.leftover = leftover.subarray(off);
  };
  const state = { leftover: Buffer.alloc(0) };

  const synth = (text, myGen) => {
    queue = queue.then(async () => {
      if (myGen !== gen) return;
      const clean = text.trim();
      if (!clean) return;
      try {
        const { pcm, rate } = await tts({ apiKey, voiceId, text: clean });
        if (myGen !== gen) return; // interrupted while synthesizing
        emitPcm48(resampleTo48k(pcm, rate));
      } catch (e) {
        console.error('[AI Call] TTS failed (' + provider + '):', e.message);
      }
    });
  };

  return {
    feed(delta) {
      pending += delta;
      // Speak complete sentences as they arrive to keep latency low.
      const m = pending.match(/^[\s\S]*?[.!?।|\n](?=\s|$)/);
      if (m && m[0].trim().length >= 3) {
        const chunk = m[0];
        pending = pending.slice(chunk.length);
        synth(chunk, gen);
      }
    },
    flush() {
      if (pending.trim()) synth(pending, gen);
      pending = '';
    },
    interrupt() {
      gen++;
      pending = '';
      state.leftover = Buffer.alloc(0);
    },
    close() { gen++; },
  };
}

module.exports = { createSpeaker, TTS, SARVAM_V3_SPEAKERS };
