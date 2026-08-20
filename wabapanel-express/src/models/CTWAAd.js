const mongoose = require("mongoose");

const ctwaAdSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
  name: { type: String, required: true, trim: true },
  adId: { type: String, default: "" },
  adAccountId: { type: String, default: "" },
  publishError: { type: String, default: "" },
  platform: { type: String, enum: ["facebook", "instagram", "both"], default: "facebook" },
  status: { type: String, enum: ["active", "paused", "completed", "draft"], default: "draft" },

  // Budget & Bidding
  budgetType: { type: String, enum: ["daily", "lifetime"], default: "daily" },
  budget: { type: Number, default: 0 },
  bidStrategy: { type: String, enum: ["lowest_cost", "cost_cap", "bid_cap"], default: "lowest_cost" },
  bidAmount: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },

  // Schedule
  startDate: { type: Date },
  endDate: { type: Date },

  // Targeting
  targeting: {
    ageMin: { type: Number, default: 18 },
    ageMax: { type: Number, default: 65 },
    gender: { type: String, enum: ["all", "male", "female"], default: "all" },
    locations: [{ type: String }],
    languages: [{ type: String }],
    interests: [{ type: String }],
    customAudience: { type: String, default: "" },
    lookalike: { type: Boolean, default: false },
  },

  // Placement
  placements: [{
    type: String,
    enum: ["facebook_feed", "instagram_feed", "instagram_stories", "instagram_reels", "facebook_stories", "facebook_reels", "messenger", "audience_network"],
  }],

  // Ad Creative
  headline: { type: String, default: "" },
  description: { type: String, default: "" },
  mediaUrl: { type: String, default: "" },
  mediaType: { type: String, enum: ["image", "video", "carousel", ""], default: "" },
  callToAction: { type: String, enum: ["send_whatsapp_message", "learn_more", "shop_now", "sign_up", "contact_us", "get_quote", "book_now"], default: "send_whatsapp_message" },
  welcomeMessage: { type: String, default: "" },
  optimizationGoal: { type: String, enum: ["conversations", "link_clicks", "impressions", "reach"], default: "conversations" },

  // Performance Metrics
  impressions: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  costPerClick: { type: Number, default: 0 },
  costPerConversion: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("CTWAAd", ctwaAdSchema);
