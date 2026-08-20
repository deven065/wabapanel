const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, default: '' },
      auth: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
