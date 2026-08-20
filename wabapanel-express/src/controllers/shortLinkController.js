const ShortLink = require('../models/ShortLink');
const { v4: uuidv4 } = require('uuid');

const getShortLinks = async (req, res) => {
  try {
    const links = await ShortLink.find({ workspace: req.workspace._id }).sort('-createdAt');
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createShortLink = async (req, res) => {
  try {
    const shortCode = req.body.shortCode || uuidv4().substring(0, 8);
    const link = await ShortLink.create({
      ...req.body,
      shortCode,
      workspace: req.workspace._id,
      user: req.user._id,
    });
    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateShortLink = async (req, res) => {
  try {
    const link = await ShortLink.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!link) return res.status(404).json({ success: false, message: 'Short link not found' });
    res.json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteShortLink = async (req, res) => {
  try {
    await ShortLink.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Short link deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const redirectShortLink = async (req, res) => {
  try {
    const link = await ShortLink.findOne({ shortCode: req.params.code, isActive: true });
    if (!link) return res.status(404).json({ success: false, message: 'Link not found' });

    if (link.expiresAt && new Date() > link.expiresAt) {
      return res.status(410).json({ success: false, message: 'Link expired' });
    }

    link.clicks++;
    link.clickDetails.push({
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || '',
      clickedAt: new Date(),
    });
    await link.save();

    res.redirect(301, link.originalUrl);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getShortLinks, createShortLink, updateShortLink, deleteShortLink, redirectShortLink };
