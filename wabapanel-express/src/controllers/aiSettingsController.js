const AISettings = require('../models/AISettings');

const getSettings = async (req, res) => {
  try {
    let settings = await AISettings.findOne({ workspace: req.workspace._id });
    if (!settings) {
      settings = await AISettings.create({ workspace: req.workspace._id });
    }
    const safe = settings.toObject();
    if (safe.apiKey) safe.apiKey = '****' + safe.apiKey.slice(-4);
    if (safe.azureRealtimeKey) safe.azureRealtimeKey = '****' + safe.azureRealtimeKey.slice(-4);
    res.json({ success: true, data: safe });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.apiKey === undefined || updates.apiKey === '' || (updates.apiKey && updates.apiKey.startsWith('****'))) {
      delete updates.apiKey;
    }
    if (updates.azureRealtimeKey === undefined || updates.azureRealtimeKey === '' || (updates.azureRealtimeKey && updates.azureRealtimeKey.startsWith('****'))) {
      delete updates.azureRealtimeKey;
    }
    let settings = await AISettings.findOne({ workspace: req.workspace._id });
    if (!settings) {
      settings = await AISettings.create({ workspace: req.workspace._id, ...updates });
    } else {
      Object.assign(settings, updates);
      await settings.save();
    }
    const safe = settings.toObject();
    if (safe.apiKey) safe.apiKey = '****' + safe.apiKey.slice(-4);
    if (safe.azureRealtimeKey) safe.azureRealtimeKey = '****' + safe.azureRealtimeKey.slice(-4);
    res.json({ success: true, data: safe });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const testConnection = async (req, res) => {
  try {
    const settings = await AISettings.findOne({ workspace: req.workspace._id });
    if (!settings || !settings.apiKey) {
      return res.status(400).json({ success: false, message: 'API key not configured' });
    }
    const aiService = require('../services/aiService');
    const result = await aiService.chat(settings.provider, settings.apiKey, [
      { role: 'system', content: 'Reply with exactly: CONNECTION_OK' },
      { role: 'user', content: 'Test' },
    ], { model: settings.model, maxTokens: 20, ...aiService.azureOpts(settings) });
    res.json({ success: true, message: 'Connection successful', data: { response: result.content } });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Connection failed: ' + error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const settings = await AISettings.findOne({ workspace: req.workspace._id });
    res.json({ success: true, data: settings?.stats || { totalReplies: 0, totalHandoffs: 0, totalTokensUsed: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings, testConnection, getStats };

// ===== AI Knowledge Documents (file uploads used as AI knowledge) =====
const AIKnowledgeDoc = require("../models/AIKnowledgeDoc");
const s3Service = require("../services/s3Service");
const SystemSettings = require("../models/SystemSettings");
const { extractText } = require("../services/aiKnowledgeExtract");

// @GET /api/ai-settings/knowledge-docs
const listKnowledgeDocs = async (req, res) => {
  try {
    const docs = await AIKnowledgeDoc.find({ workspace: req.workspace._id })
      .select("-extractedText")
      .sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-settings/knowledge-docs  (multipart: file)
const uploadKnowledgeDoc = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file provided" });

    // Extract text from the uploaded buffer.
    const { text, status, note } = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    // Store the original file for reference (S3 or local).
    let fileUrl = "";
    let fileKey = "";
    try {
      const settings = await SystemSettings.findOne();
      if (settings?.aws?.accessKeyId) s3Service.initFromSettings(settings);
      const result = await s3Service.upload(req.file, "ai-knowledge");
      fileKey = result.key;
      fileUrl = result.url;
      if (result.bucket === "local") {
        const baseUrl = process.env.BACKEND_URL || (`${req.protocol}://${req.get("host")}`);
        fileUrl = baseUrl + result.url;
      }
    } catch (e) { /* file storage is best-effort */ }

    const doc = await AIKnowledgeDoc.create({
      workspace: req.workspace._id,
      filename: req.file.originalname,
      url: fileUrl,
      key: fileKey,
      mimetype: req.file.mimetype,
      size: req.file.size,
      extractedText: text,
      chars: text.length,
      status,
      note: note || "",
    });
    const out = doc.toObject();
    delete out.extractedText;
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/ai-settings/knowledge-docs/:id
const deleteKnowledgeDoc = async (req, res) => {
  try {
    const doc = await AIKnowledgeDoc.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (doc.key) {
      try {
        const settings = await SystemSettings.findOne();
        if (settings?.aws?.accessKeyId) s3Service.initFromSettings(settings);
        await s3Service.delete(doc.key);
      } catch (e) { /* ignore storage delete errors */ }
    }
    await doc.deleteOne();
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports.listKnowledgeDocs = listKnowledgeDocs;
module.exports.uploadKnowledgeDoc = uploadKnowledgeDoc;
module.exports.deleteKnowledgeDoc = deleteKnowledgeDoc;
