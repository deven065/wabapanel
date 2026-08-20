const mongoose = require('mongoose');

const chatAppearanceSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  widgetColor: { type: String, default: '#25D366' },
  position: { type: String, enum: ['bottom-right', 'bottom-left'], default: 'bottom-right' },
  welcomeMessage: { type: String, default: 'Hi! How can we help you today?' },
  headerTitle: { type: String, default: 'Chat with us' },
  headerSubtitle: { type: String, default: 'We typically reply within minutes' },
  avatarUrl: { type: String, default: '' },
  showAgentName: { type: Boolean, default: true },
  preChatForm: {
    enabled: { type: Boolean, default: false },
    fields: [{
      name: { type: String },
      label: { type: String },
      type: { type: String, enum: ['text', 'email', 'phone', 'select'] },
      required: { type: Boolean, default: false },
      options: [String],
    }],
  },
  buttonText: { type: String, default: '' },
  buttonIcon: { type: String, enum: ['whatsapp', 'chat', 'message'], default: 'whatsapp' },
  showOnMobile: { type: Boolean, default: true },
  autoOpen: { type: Boolean, default: false },
  autoOpenDelay: { type: Number, default: 5 },
  allowedDomains: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('ChatAppearance', chatAppearanceSchema);
