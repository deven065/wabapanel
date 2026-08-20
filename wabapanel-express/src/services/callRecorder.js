// Records both legs of an AI call (customer + AI) into a single mp3.
// Opus RTP payloads from each side are decoded to 48k mono PCM, mixed on a
// 20ms clock, appended to a raw file, then converted with ffmpeg on stop.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { resolveFfmpeg } = require('../utils/ffmpegPath');
let OpusEncoder = null;
try { ({ OpusEncoder } = require('@discordjs/opus')); } catch { /* optional: AI voice calling disabled without native opus */ }

const FRAME_SAMPLES = 960; // 20ms @ 48k mono
const FRAME_BYTES = FRAME_SAMPLES * 2;
const REC_DIR = path.join(__dirname, '..', '..', 'uploads', 'recordings');

function createRecorder(callId) {
  fs.mkdirSync(REC_DIR, { recursive: true });
  const rawPath = path.join(REC_DIR, callId.replace(/[^a-zA-Z0-9_-]/g, '') + '.raw');
  const mp3Path = rawPath.replace(/\.raw$/, '.mp3');
  const out = fs.createWriteStream(rawPath);

  const mkSide = () => ({ dec: new OpusEncoder(48000, 1), q: [] });
  const sides = { customer: mkSide(), ai: mkSide() };
  let stopped = false;

  const push = (side, rtp) => {
    if (stopped) return;
    try {
      const payload = rtp.payload;
      if (!payload || payload.length < 1) return;
      const pcm = sides[side].dec.decode(payload);
      if (pcm && pcm.length) sides[side].q.push(pcm);
      // keep queues bounded (~5s)
      if (sides[side].q.length > 250) sides[side].q.splice(0, sides[side].q.length - 250);
    } catch { /* bad frame */ }
  };

  // Mix one 20ms frame from each side every 20ms; silence when a side is quiet.
  const timer = setInterval(() => {
    if (stopped) return;
    const a = sides.customer.q.shift();
    const b = sides.ai.q.shift();
    if (!a && !b) return; // nothing to write; keeps file compact but in sync enough
    const frame = Buffer.alloc(FRAME_BYTES);
    const n = FRAME_SAMPLES;
    for (let i = 0; i < n; i++) {
      let s = 0;
      if (a && i * 2 + 1 < a.length) s += a.readInt16LE(i * 2);
      if (b && i * 2 + 1 < b.length) s += b.readInt16LE(i * 2);
      if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
      frame.writeInt16LE(s, i * 2);
    }
    out.write(frame);
  }, 20);

  return {
    addCustomer: (rtp) => push('customer', rtp),
    addAi: (rtp) => push('ai', rtp),
    // Returns the public path (relative to /uploads) of the mp3, or null.
    stop: () => new Promise((resolve) => {
      if (stopped) return resolve(null);
      stopped = true;
      clearInterval(timer);
      out.end(() => {
        let size = 0;
        try { size = fs.statSync(rawPath).size; } catch {}
        if (size < FRAME_BYTES * 25) { // <0.5s of audio: discard
          try { fs.unlinkSync(rawPath); } catch {}
          return resolve(null);
        }
        execFile(resolveFfmpeg(), ['-y', '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', rawPath, '-b:a', '64k', mp3Path], (err) => {
          try { fs.unlinkSync(rawPath); } catch {}
          if (err) { console.error('[Call Rec] ffmpeg failed:', err.message); return resolve(null); }
          resolve('/uploads/recordings/' + path.basename(mp3Path));
        });
      });
    }),
  };
}

module.exports = { createRecorder, REC_DIR };
