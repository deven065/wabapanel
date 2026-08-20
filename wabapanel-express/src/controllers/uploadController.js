const s3Service = require('../services/s3Service');
const SystemSettings = require('../models/SystemSettings');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveFfmpeg } = require('../utils/ffmpegPath');
const FFMPEG = resolveFfmpeg();

// Browsers record webm (Chrome) or mp4/aac (Safari). Convert recorded voice audio to MP3,
// which WhatsApp Cloud API processes reliably (its ogg/opus processing rejects even valid files).
const convertVoiceAudio = (file) => {
  const tmpIn = path.join(os.tmpdir(), `voice_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut = tmpIn + '.mp3';
  try {
    fs.writeFileSync(tmpIn, file.buffer);
    execFileSync(FFMPEG, ['-y', '-i', tmpIn, '-vn', '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '44100', '-ac', '1', tmpOut], { stdio: 'ignore' });
    const buffer = fs.readFileSync(tmpOut);
    const base = (file.originalname || 'voice').replace(/\.[^.]+$/i, '');
    return {
      ...file,
      buffer,
      size: buffer.length,
      mimetype: 'audio/mpeg',
      originalname: base + '.mp3',
    };
  } catch (e) {
    // Do NOT silently fall back to the raw webm: WhatsApp always rejects it, so the
    // message would fail opaquely. Surface a clear error instead.
    console.error('[voice] ffmpeg convert failed:', e && e.message);
    const err = new Error('VOICE_CONVERT_FAILED');
    err.code = 'VOICE_CONVERT_FAILED';
    throw err;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* empty */ }
    try { fs.unlinkSync(tmpOut); } catch { /* empty */ }
  }
};

// WhatsApp Cloud API only accepts video/mp4 (H.264 + AAC, max 16MB).
// Convert any other video format (mov/webm/mkv/...) to a compatible mp4.
const convertVideo = (file) => {
  const tmpIn = path.join(os.tmpdir(), `vid_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut = tmpIn + '.mp4';
  try {
    fs.writeFileSync(tmpIn, file.buffer);
    execFileSync(FFMPEG, ['-y', '-i', tmpIn, '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmpOut], { stdio: 'ignore', timeout: 240000 });
    const buffer = fs.readFileSync(tmpOut);
    const base = (file.originalname || 'video').replace(/\.[^.]+$/i, '');
    return { ...file, buffer, size: buffer.length, mimetype: 'video/mp4', originalname: base + '.mp4' };
  } catch {
    return file;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* empty */ }
    try { fs.unlinkSync(tmpOut); } catch { /* empty */ }
  }
};

// WhatsApp stickers must be WebP: static <=100KB (animated <=500KB), 512x512.
// Convert any uploaded image/gif to a compliant WebP, padded to 512x512 with
// transparency preserved. Drops quality progressively to stay under the limit.
const convertSticker = (file) => {
  const isAnim = /gif|webp/i.test(file.mimetype || '') || /\.(gif|webp)$/i.test(file.originalname || '');
  const limit = isAnim ? 500000 : 100000;
  const tmpIn = path.join(os.tmpdir(), `stk_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut = tmpIn + '.webp';
  try {
    fs.writeFileSync(tmpIn, file.buffer);
    const vf = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,format=rgba';
    let buffer = null;
    for (const q of [80, 60, 40, 25]) {
      try {
        execFileSync(FFMPEG, ['-y', '-i', tmpIn, '-vf', vf, '-c:v', 'libwebp', '-loop', '0', '-lossless', '0', '-qscale', String(q), '-preset', 'default', '-an', tmpOut], { stdio: 'ignore', timeout: 120000 });
        buffer = fs.readFileSync(tmpOut);
        if (buffer.length <= limit) break;
      } catch { /* try lower quality */ }
    }
    if (!buffer) return file;
    const base = (file.originalname || 'sticker').replace(/\.[^.]+$/i, '');
    return { ...file, buffer, size: buffer.length, mimetype: 'image/webp', originalname: base + '.webp' };
  } catch {
    return file;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* empty */ }
    try { fs.unlinkSync(tmpOut); } catch { /* empty */ }
  }
};

// @POST /api/upload
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }
    // Convert any recorded voice audio (webm/mp4/aac/etc.) to ogg/opus for WhatsApp.
    // Always re-encode recorded voice audio to a clean ogg/opus. Browser-produced files
    // (even audio/ogg;codecs=opus from Chrome) are often not accepted by WhatsApp on processing
    // ("processed as application/octet-stream"), so transcode through ffmpeg to guarantee a valid file.
    const mt = (req.file.mimetype || '').toLowerCase();
    const isVoice = mt.startsWith('audio/') && !mt.startsWith('audio/mpeg');
    if (isVoice) {
      try {
        req.file = convertVoiceAudio(req.file);
      } catch (e) {
        if (e && e.code === 'VOICE_CONVERT_FAILED') {
          return res.status(422).json({ success: false, message: 'Voice note could not be processed on the server (audio converter unavailable). Please try again or contact support.' });
        }
        throw e;
      }
    }
    if (mt.startsWith('video/') && mt !== 'video/mp4') {
      req.file = convertVideo(req.file);
    }
    const wantSticker = (req.body.folder === 'stickers') || String(req.body.asSticker) === 'true';
    if (wantSticker && mt.startsWith('image/')) {
      req.file = convertSticker(req.file);
    }

    const settings = await SystemSettings.findOne();
    if (settings?.aws?.accessKeyId) {
      s3Service.initFromSettings(settings);
    }

    const folder = req.body.folder || 'uploads';
    const result = await s3Service.upload(req.file, folder);

    // For local uploads, make URL absolute. Serve via /api/uploads so the asset
    // loads regardless of how the reverse proxy routes bare /uploads.
    let fileUrl = result.url;
    if (result.bucket === 'local') {
      const baseUrl = process.env.BACKEND_URL || (`${req.protocol}://${req.get('host')}`);
      const relUrl = result.url.startsWith('/uploads/') ? '/api' + result.url : result.url;
      fileUrl = baseUrl + relUrl;
    }

    res.json({
      success: true,
      data: {
        url: fileUrl,
        key: result.key,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/upload/multiple
const uploadMultiple = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }

    const settings = await SystemSettings.findOne();
    if (settings?.aws?.accessKeyId) {
      s3Service.initFromSettings(settings);
    }

    const folder = req.body.folder || 'uploads';
    const results = [];

    for (const file of req.files) {
      const result = await s3Service.upload(file, folder);
      results.push({
        url: result.url,
        key: result.key,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/upload
const deleteFile = async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'File key required' });
    }

    const settings = await SystemSettings.findOne();
    if (settings?.aws?.accessKeyId) {
      s3Service.initFromSettings(settings);
    }

    await s3Service.delete(key);
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadFile, uploadMultiple, deleteFile };
