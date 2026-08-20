// Groq + Sarvam budget AI call pipeline.
// Customer audio → Opus decode → silence detection → Groq Whisper STT → Groq LLM → Sarvam TTS → Opus encode → RTP
let OpusEncoder = null;
try { ({ OpusEncoder } = require('@discordjs/opus')); } catch { /* optional: AI voice calling disabled without native opus */ }
const { RtpPacket, RtpHeader } = require('werift');
const Groq = require('groq-sdk');
const { GROQ_TOOLS, executeTool } = require('./callTools');

const FRAME = 960; // 20ms @ 48k mono samples
const SILENCE_THRESHOLD = 300; // energy level below which is silence
const SILENCE_DURATION_MS = 800; // ms of silence before turn ends
const MAX_BUFFER_MS = 30000; // max audio buffer (30s)

// Decode Opus RTP to PCM 48k mono
function createDecoder() {
  const dec = new OpusEncoder(48000, 1);
  return { decode: (payload) => { try { return dec.decode(payload); } catch { return null; } } };
}

// Calculate RMS energy of PCM buffer
function rmsEnergy(pcm16) {
  const samples = new Int16Array(pcm16.buffer, pcm16.byteOffset, Math.floor(pcm16.length / 2));
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length || 1));
}

// Convert PCM 48k mono to 16k mono (Whisper expects 16k)
function downsample48kTo16k(pcm48) {
  const src = new Int16Array(pcm48.buffer, pcm48.byteOffset, Math.floor(pcm48.length / 2));
  const outLen = Math.floor(src.length / 3);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = src[i * 3];
  return Buffer.from(out.buffer);
}

// Create WAV header for 16k 16-bit mono PCM
function wavHeader(dataLen) {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16000, 24); // sample rate
  buf.writeUInt32LE(32000, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  return buf;
}

// Resample PCM to 48k for TTS output (same as externalVoice.js)
function resampleTo48k(pcm, srcRate) {
  if (srcRate === 48000) return pcm;
  const src = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const outLen = Math.floor(src.length * 48000 / srcRate);
  const out = new Int16Array(outLen);
  const ratio = srcRate / 48000;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = src[Math.max(idx - 1, 0)];
    const s1 = src[idx] || 0;
    const s2 = src[Math.min(idx + 1, src.length - 1)];
    const s3 = src[Math.min(idx + 2, src.length - 1)];
    const c0 = s1;
    const c1 = 0.5 * (s2 - s0);
    const c2 = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3;
    const c3 = 0.5 * (s3 - s0) + 1.5 * (s1 - s2);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(((c3 * frac + c2) * frac + c1) * frac + c0)));
  }
  return Buffer.from(out.buffer);
}

// Main Groq bridge class
class GroqBridge {
  constructor({ groqApiKey, sarvamApiKey, voiceId, instructions, greeting, onRtp, workspaceId, phone, accessToken, phoneNumberId }) {
    this.groq = new Groq({ apiKey: groqApiKey });
    this.sarvamApiKey = sarvamApiKey;
    this.voiceId = voiceId || 'priya';
    this.instructions = instructions || '';
    this.greeting = greeting || '';
    this.onRtp = onRtp;
    this.conversation = [];
    this.decoder = createDecoder();
    this.encoder = new OpusEncoder(48000, 1);
    try { this.encoder.setBitrate(48000); } catch {}
    
    // RTP output state
    this.outSeq = Math.floor(Math.random() * 30000);
    this.outTs = Math.floor(Math.random() * 1000000) >>> 0;
    this.outSsrc = Math.floor(Math.random() * 0xffffffff) >>> 0;
    
    // Audio buffer for customer speech
    this.audioBuffer = [];
    this.audioBufferMs = 0;
    this.silenceMs = 0;
    this.speechDetected = false;
    this.processing = false;
    this.aiSpeaking = false;
    this.closed = false;
    this.leftover = Buffer.alloc(0);
    
    // Context for tool execution
    this.toolContext = { workspaceId, phone, accessToken, phoneNumberId };

    // Send greeting on start
    if (this.greeting) {
      this.conversation.push({ role: 'assistant', content: this.greeting });
      setTimeout(() => this._synthesizeAndSend(this.greeting), 500);
    }
  }

  // Feed customer RTP packet (Opus 48k)
  feedCustomerRtp(rtp) {
    if (this.closed || this.processing) return;
    
    const pcm = this.decoder.decode(rtp.payload);
    if (!pcm) return;
    
    const energy = rmsEnergy(pcm);
    const isSpeech = energy > SILENCE_THRESHOLD;
    
    if (isSpeech) {
      this.speechDetected = true;
      this.silenceMs = 0;
      this.audioBuffer.push(pcm);
      this.audioBufferMs += 20;
      // Prevent infinite buffer
      if (this.audioBufferMs > MAX_BUFFER_MS) {
        this.audioBuffer.shift();
        this.audioBufferMs -= 20;
      }
    } else if (this.speechDetected) {
      this.silenceMs += 20;
      // Keep a bit of trailing silence for better transcription
      this.audioBuffer.push(pcm);
      this.audioBufferMs += 20;
      
      if (this.silenceMs >= SILENCE_DURATION_MS) {
        // Customer finished speaking — process turn
        this._processTurn();
      }
    }
  }

  async _processTurn() {
    if (this.processing || this.audioBuffer.length === 0) return;
    this.processing = true;
    this.speechDetected = false;
    this.silenceMs = 0;
    
    // Grab audio buffer
    const audioPcm48k = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];
    this.audioBufferMs = 0;
    
    try {
      // 1. Downsample to 16k for Whisper
      const pcm16k = downsample48kTo16k(audioPcm48k);
      
      // 2. Create WAV file
      const wav = Buffer.concat([wavHeader(pcm16k.length), pcm16k]);
      
      // 3. Transcribe with Groq Whisper
      const transcript = await this._transcribe(wav);
      if (!transcript || transcript.trim().length < 2) {
        this.processing = false;
        return;
      }
      console.log('[AI Call][Groq] Customer:', transcript);
      
      // 4. Get LLM response
      this.conversation.push({ role: 'user', content: transcript });
      const response = await this._getLLMResponse();
      if (!response) { this.processing = false; return; }
      console.log('[AI Call][Groq] AI:', response.slice(0, 80));
      
      this.conversation.push({ role: 'assistant', content: response });
      
      // 5. Synthesize and send
      await this._synthesizeAndSend(response);
    } catch (e) {
      console.error('[AI Call][Groq] Pipeline error:', e.message);
    } finally {
      this.processing = false;
    }
  }

  async _transcribe(wavBuffer) {
    try {
      const file = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' });
      const result = await this.groq.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3',
        language: 'hi',
        response_format: 'text',
      });
      return typeof result === 'string' ? result : result.text || '';
    } catch (e) {
      console.error('[AI Call][Groq] STT error:', e.message);
      return '';
    }
  }

  async _getLLMResponse() {
    try {
      const messages = [
        { role: 'system', content: (this.instructions || 'You are a helpful Hindi-speaking assistant on a phone call. Keep responses concise and natural. Respond in Hindi.') + '\n\nYou have these tools available: create_order, send_payment_reminder, qualify_lead, schedule_followup, collect_feedback, create_ticket. Use them when appropriate based on the conversation.' },
        ...this.conversation.slice(-20),
      ];
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages,
        max_tokens: 200,
        temperature: 0.7,
        tools: GROQ_TOOLS,
        tool_choice: 'auto',
      });
      const choice = completion.choices?.[0];
      if (!choice) return '';
      
      // Handle tool calls
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        const toolResults = [];
        for (const tc of choice.message.tool_calls) {
          const args = JSON.parse(tc.function?.arguments || '{}');
          console.log('[AI Call][Groq] Tool call:', tc.function?.name, JSON.stringify(args).slice(0, 100));
          try {
            const result = await executeTool(tc.function.name, args, this.toolContext);
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
          } catch (e) {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: e.message }) });
          }
        }
        // Add tool call message and results, then get final response
        this.conversation.push(choice.message);
        this.conversation.push(...toolResults);
        const followUp = await this.groq.chat.completions.create({
          model: 'llama-3.1-70b-versatile',
          messages: [...messages, choice.message, ...toolResults],
          max_tokens: 200,
          temperature: 0.7,
        });
        return followUp.choices?.[0]?.message?.content || '';
      }
      return choice.message?.content || '';
    } catch (e) {
      console.error('[AI Call][Groq] LLM error:', e.message);
      return '';
    }
  }

  async _synthesizeAndSend(text) {
    if (this.closed || !text.trim()) return;
    this.aiSpeaking = true;
    try {
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 10000);
      const r = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'api-subscription-key': this.sarvamApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(), model: 'bulbul:v3',
          speaker: require('./externalVoice').SARVAM_V3_SPEAKERS.includes((this.voiceId || '').toLowerCase())
            ? this.voiceId.toLowerCase() : 'priya',
          target_language_code: 'hi-IN',
          speech_sample_rate: 48000,
        }),
        signal: ac.signal,
      });
      clearTimeout(tm);
      if (!r.ok) throw new Error('Sarvam TTS ' + r.status);
      const body = await r.json();
      const wav = Buffer.from(body.audios?.[0] || '', 'base64');
      if (wav.length <= 44) throw new Error('Empty TTS audio');
      const pcm = wav.subarray(44);
      this._emitPcm48(pcm);
    } catch (e) {
      console.error('[AI Call][Groq] TTS error:', e.message);
    } finally {
      this.aiSpeaking = false;
    }
  }

  _emitPcm48(pcm48) {
    let leftover = this.leftover.length ? Buffer.concat([this.leftover, pcm48]) : pcm48;
    let off = 0;
    while (leftover.length - off >= FRAME * 2) {
      const frame = leftover.subarray(off, off + FRAME * 2);
      off += FRAME * 2;
      let payload;
      try { payload = this.encoder.encode(frame); } catch { continue; }
      this.outTs = (this.outTs + FRAME) >>> 0;
      this.outSeq = (this.outSeq + 1) & 0xffff;
      const pkt = new RtpPacket(new RtpHeader({
        payloadType: 111, sequenceNumber: this.outSeq, timestamp: this.outTs, ssrc: this.outSsrc, marker: false,
      }), payload);
      try { this.onRtp(pkt); } catch {}
    }
    this.leftover = leftover.subarray(off);
  }

  close() {
    this.closed = true;
    this.audioBuffer = [];
  }
}

module.exports = { GroqBridge };
