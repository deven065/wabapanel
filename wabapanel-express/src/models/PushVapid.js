const mongoose = require('mongoose');

// Singleton VAPID keypair for Web Push, generated once per panel on first use.
const pushVapidSchema = new mongoose.Schema(
  {
    publicKey: { type: String, default: '' },
    privateJwk: { type: mongoose.Schema.Types.Mixed, default: null },
    subject: { type: String, default: 'mailto:admin@localhost' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushVapid', pushVapidSchema);
