const User = require('../models/User');

// Catalog of admin-toggleable client features. Key -> label + client route (for the sidebar).
const FEATURE_CATALOG = [
  // Main
  { key: 'analytics', label: 'Analytics', path: '/client/analytics', group: 'Main' },
  { key: 'crm', label: 'Pipeline Board / CRM', path: '/client/pipelines', group: 'Main' },
  { key: 'mediaLibrary', label: 'Media Library', path: '/client/media-library', group: 'Main' },
  { key: 'ctwaAds', label: 'CTWA Ads', path: '/client/ctwa-ads', group: 'Main' },
  { key: 'apiAccess', label: 'API & Developers', path: '/client/api-docs', group: 'Main' },
  // Inbox
  { key: 'chat', label: 'WhatsApp Inbox / Chat', path: '/client/chat', group: 'Inbox' },
  { key: 'whatsappQr', label: 'WhatsApp QR Inbox', path: '/client/channels', group: 'Inbox' },
  { key: 'inboxInstagram', label: 'Instagram Inbox', path: '/client/chat?channel=instagram', group: 'Inbox' },
  { key: 'inboxFacebook', label: 'Facebook Inbox', path: '/client/chat?channel=facebook', group: 'Inbox' },
  { key: 'inboxTelegram', label: 'Telegram Inbox', path: '/client/chat?channel=telegram', group: 'Inbox' },
  { key: 'inboxEmail', label: 'Email Inbox', path: '/client/chat?channel=email', group: 'Inbox' },
  // Contacts
  { key: 'contacts', label: 'Contact Directory', path: '/client/contacts', group: 'Contacts' },
  { key: 'segments', label: 'Segments', path: '/client/segments', group: 'Contacts' },
  { key: 'tags', label: 'Tags', path: '/client/tags', group: 'Contacts' },
  { key: 'dataFields', label: 'Data Fields', path: '/client/data-fields', group: 'Contacts' },
  { key: 'importLogs', label: 'Import Logs', path: '/client/import-logs', group: 'Contacts' },
  { key: 'badges', label: 'Badges', path: '/client/badges', group: 'Contacts' },
  // Campaigns
  { key: 'templates', label: 'Message Templates', path: '/client/templates', group: 'Campaigns' },
  { key: 'broadcasts', label: 'Broadcast', path: '/client/broadcasts', group: 'Campaigns' },
  { key: 'smartBroadcast', label: 'Smart Broadcast (Advanced)', path: '/client/smart-broadcast', group: 'Campaigns', addon: true },
  { key: 'drips', label: 'Drip Campaigns', path: '/client/drips', group: 'Campaigns' },
  // Save Money
  { key: 'presetTemplates', label: 'Preset Templates', path: '/client/save-money/templates', group: 'Save Money' },
  { key: 'presetCampaigns', label: 'Preset Campaigns', path: '/client/save-money/campaigns', group: 'Save Money' },
  { key: 'qrCampaigns', label: 'Web WhatsApp Campaigns', path: '/client/save-money/qr-campaigns', group: 'Save Money' },
  // Automation
  { key: 'automations', label: 'Automation Flows', path: '/client/automations', group: 'Automation' },
  { key: 'botFlows', label: 'Bot Flow Builder', path: '/client/bot-flows', group: 'Automation' },
  { key: 'followups', label: 'AI Follow-ups', path: '/client/followups', group: 'Automation' },
  { key: 'quickReplies', label: 'Quick Replies', path: '/client/quick-replies', group: 'Automation' },
  { key: 'keywords', label: 'Keyword Triggers', path: '/client/keywords', group: 'Automation' },
  { key: 'appointments', label: 'Appointments', path: '/client/appointments', group: 'Automation' },
  { key: 'tickets', label: 'Tickets', path: '/client/tickets', group: 'Automation' },
  { key: 'predefinedActions', label: 'Predefined Actions', path: '/client/predefined-actions', group: 'Automation' },
  // AI
  { key: 'aiChatbot', label: 'AI Chatbot', path: '/client/ai-settings', group: 'AI' },
  { key: 'aiCalling', label: 'AI Calling + Bulk AI Calls', path: '/client/ai-calling', group: 'AI' },
  { key: 'knowledgeBase', label: 'AI Knowledge Base', path: '/client/knowledge-base', group: 'AI' },
  // Leads & Commerce
  { key: 'leads', label: 'All Leads / Facebook Leads', path: '/client/leads', group: 'Leads & Commerce' },
  { key: 'forms', label: 'Lead Gen Forms', path: '/client/forms', group: 'Leads & Commerce' },
  { key: 'ecommerce', label: 'Catalogs / Orders / E-Commerce', path: '/client/catalogs', group: 'Leads & Commerce' },
  { key: 'shortLinks', label: 'Short Links', path: '/client/short-links', group: 'Leads & Commerce' },
  // Settings
  { key: 'teams', label: 'Teams / Agents', path: '/client/teams', group: 'Settings' },
  { key: 'integrations', label: 'Integrations', path: '/client/integrations', group: 'Settings' },
  { key: 'chatAppearance', label: 'Chat Appearance', path: '/client/chat-appearance', group: 'Settings' },
  { key: 'auditLog', label: 'Audit Log', path: '/client/audit-log', group: 'Settings' },
  // Add-ons (opt-in: OFF by default; needs a panel store-license + a per-client admin toggle)
  { key: 'igAutoDm', label: 'Instagram Auto DM', path: '/client/instagram-auto-dm', group: 'Add-ons', addon: true },
];

const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);
// Add-on keys are opt-in: hidden/blocked unless both the panel is licensed (store) and the admin enables it.
const ADDON_KEYS = new Set(FEATURE_CATALOG.filter((f) => f.addon).map((f) => f.key));

// Add-ons the store licenses through its own feature-lock keys (lock value 1 = not licensed).
const STORE_LOCK_KEYS = { smartBroadcast: 'smart_broadcast' };

// Add-ons the store alone controls, keyed on the panel's own (domain-specific) store locks:
// licensed only when the store explicitly unlocks them, so a missing lock keeps the add-on off.
const STRICT_STORE_LOCK_KEYS = { igAutoDm: 'instagram_auto_dm' };

// Panel-level add-on license (controlled by the store via SystemSettings.addons or its feature locks).
// Missing = not licensed.
const getPanelAddons = async () => {
  if (!ADDON_KEYS.size) return {};
  try {
    const SystemSettings = require('../models/SystemSettings');
    const st = await SystemSettings.findOne().select('addons kkhsFeatureLocks kkhsAddonLocks').lean();
    const addons = { ...((st && st.addons) || {}) };
    const locks = (st && st.kkhsFeatureLocks) || {};
    const addonLocks = (st && st.kkhsAddonLocks) || {};
    for (const [key, lockKey] of Object.entries(STORE_LOCK_KEYS)) {
      if (addons[key] === undefined) addons[key] = locks[lockKey] !== 1;
    }
    for (const [key, lockKey] of Object.entries(STRICT_STORE_LOCK_KEYS)) {
      addons[key] = addonLocks[lockKey] === 0;
    }
    return addons;
  } catch { return {}; }
};

// Resolves the effective feature map for a workspace owner.
// Normal features: missing key = enabled. Add-ons: enabled only when licensed AND admin-enabled.
const getOwnerFeatures = async (ownerId) => {
  const owner = await User.findById(ownerId).select('featureOverrides').lean();
  const overrides = (owner && owner.featureOverrides) || {};
  const panelAddons = await getPanelAddons();
  const map = {};
  for (const key of FEATURE_KEYS) {
    if (ADDON_KEYS.has(key)) map[key] = panelAddons[key] === true && overrides[key] === true;
    else map[key] = overrides[key] !== false;
  }
  return map;
};

// Route middleware: blocks the request when the feature/add-on is not available for this client.
const requireFeature = (key) => async (req, res, next) => {
  try {
    if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) return next();
    const ownerId = req.workspace?.owner || req.user?._id;
    if (!ownerId) return next();
    const owner = await User.findById(ownerId).select('featureOverrides').lean();
    if (ADDON_KEYS.has(key)) {
      const panelAddons = await getPanelAddons();
      const licensed = panelAddons[key] === true;
      const enabled = owner?.featureOverrides?.[key] === true;
      if (!licensed || !enabled) {
        return res.status(403).json({ success: false, message: 'This add-on is not enabled for your account' });
      }
      return next();
    }
    if (owner?.featureOverrides?.[key] === false) {
      return res.status(403).json({ success: false, message: 'This feature has been disabled by the administrator' });
    }
    next();
  } catch {
    next();
  }
};

// Grandfathering: Smart Broadcast used to be on for everyone. When it became an add-on,
// existing accounts keep it; only accounts created afterwards need an explicit assignment.
const grandfatherSmartBroadcast = async () => {
  const SystemSettings = require('../models/SystemSettings');
  const settings = await SystemSettings.findOne().select('migrations');
  if (!settings || settings.migrations?.smartBroadcastGrandfather) return;
  const r = await User.updateMany(
    { role: { $ne: 'agent' }, 'featureOverrides.smartBroadcast': { $exists: false } },
    { $set: { 'featureOverrides.smartBroadcast': true } }
  );
  settings.migrations = { ...(settings.migrations || {}), smartBroadcastGrandfather: true };
  settings.markModified('migrations');
  await settings.save();
  console.log('[FeatureGate] Smart Broadcast grandfathered for existing accounts:', r.modifiedCount);
};

module.exports = { FEATURE_CATALOG, FEATURE_KEYS, ADDON_KEYS, getOwnerFeatures, getPanelAddons, requireFeature, grandfatherSmartBroadcast };
