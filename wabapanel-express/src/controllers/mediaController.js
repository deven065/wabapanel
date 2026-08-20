const MediaFile = require("../models/MediaFile");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const pExecFile = promisify(execFile);
const { resolveFfmpeg } = require("../utils/ffmpegPath");

exports.getAll = async (req, res) => {
  try {
    const filter = { workspace: req.workspace._id };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.folder) filter.folder = req.query.folder;
    const files = await MediaFile.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// WhatsApp rejects images over 5MB; recompress oversized uploads in place.
const WA_IMG_LIMIT = 4.8 * 1024 * 1024;
async function compressImageIfNeeded(file) {
  if (!/^image\/(jpeg|png|webp)/.test(file.mimetype) || file.size <= WA_IMG_LIMIT) return file;
  const Jimp = require("jimp");
  const fp = path.join(__dirname, "../../uploads", file.filename);
  const img = await Jimp.read(fp);
  if (img.getWidth() > 2048 || img.getHeight() > 2048) img.scaleToFit(2048, 2048);
  let buf = await img.quality(82).getBufferAsync(Jimp.MIME_JPEG);
  for (let q = 70; buf.length > WA_IMG_LIMIT && q >= 40; q -= 10) {
    buf = await img.quality(q).getBufferAsync(Jimp.MIME_JPEG);
  }
  fs.writeFileSync(fp, buf);
  file.size = buf.length;
  file.mimetype = "image/jpeg";
  return file;
}

// WhatsApp Cloud API only accepts video/mp4 (H.264 + AAC) up to 16MB. Transcode
// any uploaded video to a compatible mp4 and, when it is over the limit,
// progressively re-encode at lower quality/resolution until it fits. Rewrites
// the stored file in place. Returns true when the final file is within 16MB.
const WA_VIDEO_LIMIT = 16 * 1024 * 1024;
async function compressVideoIfNeeded(file) {
  const FFMPEG = resolveFfmpeg();
  const isMp4 = /\.mp4$/i.test(file.filename) && file.mimetype === "video/mp4";
  if (isMp4 && file.size <= WA_VIDEO_LIMIT) return true;
  if (!FFMPEG) return file.size <= WA_VIDEO_LIMIT; // no encoder available
  const dir = path.join(__dirname, "../../uploads");
  const inPath = path.join(dir, file.filename);
  const base = file.filename.replace(/\.[^.]+$/i, "");
  const ladder = [[30, 854], [32, 640]]; // [crf, maxWidth] — fast single/double pass
  let best = null;
  for (let i = 0; i < ladder.length; i++) {
    const [crf, w] = ladder[i];
    const outPath = path.join(os.tmpdir(), `vid_${Date.now()}_${i}.mp4`);
    try {
      // async (non-blocking): keeps the API responsive while ffmpeg runs
      await pExecFile(FFMPEG, ["-y", "-i", inPath,
        "-vf", `scale='min(${w},iw)':-2`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", outPath],
        { timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
      const sz = fs.statSync(outPath).size;
      if (best && best.size <= sz) { try { fs.unlinkSync(outPath); } catch { /* noop */ } }
      else { if (best) { try { fs.unlinkSync(best.path); } catch { /* noop */ } } best = { path: outPath, size: sz }; }
      if (best.size <= WA_VIDEO_LIMIT) break;
    } catch { /* try next quality rung */ }
  }
  if (!best) return file.size <= WA_VIDEO_LIMIT;
  const finalName = base + ".mp4";
  const finalPath = path.join(dir, finalName);
  try {
    fs.copyFileSync(best.path, finalPath);
    fs.unlinkSync(best.path);
    if (finalName !== file.filename) { try { fs.unlinkSync(inPath); } catch { /* noop */ } }
    file.filename = finalName;
    file.mimetype = "video/mp4";
    file.size = best.size;
  } catch { /* keep original on failure */ }
  return file.size <= WA_VIDEO_LIMIT;
}

exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    try { await compressImageIfNeeded(req.file); } catch (e) { console.error("[Media] compress failed:", e.message); }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isVideoFile = req.file.mimetype.startsWith("video/") || [".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v", ".3gp"].includes(ext);
    if (isVideoFile) {
      let ok = true;
      try { ok = await compressVideoIfNeeded(req.file); } catch (e) { console.error("[Media] video compress failed:", e.message); ok = req.file.size <= WA_VIDEO_LIMIT; }
      if (!ok) {
        try { fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename)); } catch { /* noop */ }
        return res.status(400).json({ success: false, message: `Video too large (${(req.file.size / (1024 * 1024)).toFixed(1)} MB). WhatsApp allows a maximum of 16 MB per video — please use a shorter or more compressed clip.` });
      }
    }
    let type = "document";
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) type = "image";
    else if ([".mp4", ".mov", ".avi", ".webm"].includes(ext)) type = "video";
    else if ([".mp3", ".wav", ".ogg", ".aac"].includes(ext)) type = "audio";

    const mediaFile = await MediaFile.create({
      workspace: req.workspace._id,
      name: req.body.name || req.file.originalname,
      originalName: req.file.originalname,
      url: `${process.env.BACKEND_URL || "https://api.wabapanel.com"}/api/uploads/${req.file.filename}`,
      type,
      mimeType: req.file.mimetype,
      size: req.file.size,
      folder: req.body.folder || "general",
      tags: req.body.tags ? req.body.tags.split(",").map(t => t.trim()) : [],
      uploadedBy: req.user._id,
    });
    res.status(201).json({ success: true, data: mediaFile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const file = await MediaFile.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    res.json({ success: true, data: file });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const file = await MediaFile.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    const filePath = path.join(__dirname, "../../uploads", path.basename(file.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true, message: "File deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
