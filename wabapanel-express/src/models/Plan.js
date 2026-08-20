const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: 'Perfect plan for your business needs' },
  price: { type: Number, required: true, default: 0 }, // monthly price
  quarterlyPrice: { type: Number, default: 0 },
  yearlyPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' }, // base currency for the prices above

  // International pricing. 'manual' = admin sets an explicit price per currency
  // below; 'exchange' = foreign price is auto-derived from the base price using
  // each currency's exchange rate (SystemSettings.currencies[].rate).
  pricingMode: { type: String, enum: ['manual', 'exchange'], default: 'manual' },
  prices: {
    type: [{
      currency: { type: String },
      monthly: { type: Number, default: 0 },
      quarterly: { type: Number, default: 0 },
      yearly: { type: Number, default: 0 },
      _id: false,
    }],
    default: [],
  },
  interval: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'lifetime', 'free_trial'], default: 'monthly' },
  isPopular: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  // Usage Limits
  limits: {
    contacts: { type: Number, default: -1 }, // -1 = unlimited
    templateBots: { type: Number, default: 100 },
    messageBots: { type: Number, default: 10 },
    campaigns: { type: Number, default: 100 },
    aiPrompts: { type: Number, default: 99 },
    agents: { type: Number, default: 100 },
    conversations: { type: Number, default: 100 },
    teams: { type: Number, default: 15 },
    botFlows: { type: Number, default: 100 },
    customFields: { type: Number, default: 100 },
    tags: { type: Number, default: 100 },
    whatsappForms: { type: Number, default: 100 },
    aiCallingAgents: { type: Number, default: 100 },
    appointmentBookings: { type: Number, default: 100 },
    facebookAdsCampaigns: { type: Number, default: 100 },
    kanbanFunnels: { type: Number, default: 100 },
    segments: { type: Number, default: 100 },
  },

  // Features
  features: {
    restApi: { type: Boolean, default: true },
    whatsappWebhook: { type: Boolean, default: true },
    autoReplies: { type: Boolean, default: true },
    analytics: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
  },

  // Marketing feature list shown on pricing cards
  featureList: { type: [String], default: [] },

  // Payment Gateway IDs
  stripeProductId: { type: String, default: '' },
  stripePriceId: { type: String, default: '' },
  razorpayPlanId: { type: String, default: '' },
  gatewayPlanIds: { type: mongoose.Schema.Types.Mixed, default: {} }, // per-cycle Razorpay plan ids: { monthly, quarterly, yearly }

  trialDays: { type: Number, default: 0 },
  trialRequiresMandate: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
