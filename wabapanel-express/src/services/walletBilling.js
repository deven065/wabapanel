const SystemSettings = require("../models/SystemSettings");
const Workspace = require("../models/Workspace");
const User = require("../models/User");
const Template = require("../models/Template");
const WalletTransaction = require("../models/WalletTransaction");

// Per-category template rates if wallet billing is enabled, else null.
async function getRates() {
  const s = await SystemSettings.findOne();
  if (!s || !s.wallet || s.wallet.isEnabled === false) return null;

  const t = (s.wallet.templateRates) || {};
  return {
    marketing: t.marketing || 0,
    utility: t.utility || 0,
    authentication: t.authentication || 0,
  };
}

async function resolveWs(phoneNumberId) {
  if (!phoneNumberId) return {};
  const ws = await Workspace.findOne({ "whatsapp.phoneNumberId": phoneNumberId });
  if (!ws || !ws.owner) return {};
  const user = await User.findById(ws.owner);
  return { ws, user };
}

// Resolves { rate, user, category, exempt } for a template send.
async function resolveTemplateCharge(phoneNumberId, templateName) {
  const rates = await getRates();
  if (!rates) return { rate: 0 };
  const { ws, user } = await resolveWs(phoneNumberId);
  if (!ws || !user) return { rate: 0 };
  if (user.walletBillingExempt) return { rate: 0, user, exempt: true };
  let category = "utility";
  if (templateName) {
    const tpl = await Template.findOne({
      name: templateName,
      $or: [{ workspace: ws._id }, { workspace: null }],
    }).sort({ workspace: -1 });
    if (tpl && tpl.category) category = String(tpl.category).toLowerCase();
  }
  const custom = user.walletTemplateRates && user.walletTemplateRates[category];
  const rate = custom != null ? custom : (rates[category] != null ? rates[category] : 0);
  return { rate, user, category };
}

// Throws { code: "INSUFFICIENT_WALLET" } when the owner cannot afford this template.
async function assertCanSendTemplate(phoneNumberId, templateName) {
  const { rate, user, exempt } = await resolveTemplateCharge(phoneNumberId, templateName);
  if (exempt || !rate || !user) return;
  if ((user.walletBalance || 0) < rate) {
    const err = new Error("Insufficient wallet balance");
    err.code = "INSUFFICIENT_WALLET";
    throw err;
  }
}

// Deducts the category rate from the owner and records a debit ledger entry.
async function chargeForTemplate(phoneNumberId, templateName) {
  const { rate, user, category } = await resolveTemplateCharge(phoneNumberId, templateName);
  if (!rate || !user) return;
  user.walletBalance = (user.walletBalance || 0) - rate;
  await user.save();
  await WalletTransaction.create({
    user: user._id,
    type: "debit",
    amount: rate,
    balanceAfter: user.walletBalance,
    description: "Template message (" + category + ")",
    category: "message_cost",
    metadata: { messageType: "template", templateCategory: category, rate },
  });
}

module.exports = { getRates, assertCanSendTemplate, chargeForTemplate, resolveTemplateCharge };
