const mongoose = require('mongoose');

const siteContentSchema = new mongoose.Schema({
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('SiteContent', siteContentSchema);
