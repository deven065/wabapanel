const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  type: { type: String, required: true, enum: ['google-sheets', 'google-calendar', 'zapier', 'shopify', 'woocommerce', 'hubspot', 'mailchimp', 'razorpay', 'stripe', 'google-analytics', 'webhook', 'make', 'calendly', 'pabbly', 'n8n', 'ifttt', 'salesforce', 'zoho-crm', 'pipedrive', 'bitrix24', 'paypal', 'paytm', 'phonepe', 'cashfree', 'payu', 'paystack', 'mercadopago', 'openai', 'indiamart', 'justdial', 'tradeindia', 'exportersindia', '99acres', 'magicbricks', 'housing', 'olx', 'tagmango', 'google-lead-forms', 'wordpress-forms', 'google-forms', 'typeform', 'jotform', 'landing-pages', 'flexifunnels', 'website', 'linkedin-ads', 'twitter-ads', 'leadsquared', 'gohighlevel', 'facebook-leads', 'shiprocket'] },
  connected: { type: Boolean, default: false },
  // Secret appended to public webhook URLs (?key=...) to block unauthorized calls
  webhookSecret: { type: String, default: '' },
  // Per-event auto-send config: { [event]: { enabled: Boolean, templateName: String } }
  automations: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Edited copies of recommended presets: { [presetKey]: { label, body } }
  templateOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  // User-added templates: [{ key, event, eventLabel, name, label, body, variables }]
  customTemplates: { type: mongoose.Schema.Types.Mixed, default: [] },
  config: {
    apiKey: { type: String, default: '' },
    apiSecret: { type: String, default: '' },
    webhookUrl: { type: String, default: '' },
    storeUrl: { type: String, default: '' },
    sheetId: { type: String, default: '' },
    calendarId: { type: String, default: '' },
    measurementId: { type: String, default: '' },
    instanceUrl: { type: String, default: '' },
    apiDomain: { type: String, default: '' },
    companyDomain: { type: String, default: '' },
    clientId: { type: String, default: '' },
    merchantId: { type: String, default: '' },
    saltIndex: { type: String, default: '' },
    endpointUrl: { type: String, default: '' },
    model: { type: String, default: '' },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  syncSettings: {
    autoSync: { type: Boolean, default: true },
    syncContacts: { type: Boolean, default: true },
    syncOrders: { type: Boolean, default: false },
    syncOnNewContact: { type: Boolean, default: true },
    syncOnTagChange: { type: Boolean, default: false },
    syncInterval: { type: Number, default: 30 },
  },
  stats: {
    totalSynced: { type: Number, default: 0 },
    lastSyncAt: { type: Date },
    lastError: { type: String, default: '' },
  },
}, { timestamps: true });

integrationSchema.index({ workspace: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Integration', integrationSchema);
