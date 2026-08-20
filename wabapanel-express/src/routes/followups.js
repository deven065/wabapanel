const express = require('express');
const { requireFeature } = require('../middleware/featureGate');
const router = express.Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AISettings = require('../models/AISettings');
const aiService = require('../services/aiService');

router.use(protect, workspaceAccess);
router.use(requireFeature('followups'));

// GET /api/followups — rule-based follow-up suggestions
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    const convs = await Conversation.find({
      workspace: req.workspace._id,
      'lastMessage.timestamp': { $ne: null },
    })
      .sort('-lastMessage.timestamp')
      .limit(500)
      .populate('contact', 'name phone')
      .lean();

    const items = [];
    for (const c of convs) {
      if (!c.contact || !c.lastMessage?.timestamp) continue;
      const ageMs = now - new Date(c.lastMessage.timestamp).getTime();
      const ageHrs = ageMs / 36e5;
      const windowOpen = c.windowExpiresAt && new Date(c.windowExpiresAt).getTime() > now;
      const windowLeftHrs = windowOpen ? (new Date(c.windowExpiresAt).getTime() - now) / 36e5 : 0;

      if (c.lastMessage.direction === 'inbound' && ageHrs >= 1) {
        items.push({ reason: 'unanswered', priority: 1, conv: c, ageHrs, windowOpen, windowLeftHrs });
      } else if (c.lastMessage.direction === 'inbound' && windowOpen && windowLeftHrs <= 4) {
        items.push({ reason: 'window_closing', priority: 2, conv: c, ageHrs, windowOpen, windowLeftHrs });
      } else if (c.lastMessage.direction === 'outbound' && ageHrs >= 72) {
        items.push({ reason: 'gone_quiet', priority: 3, conv: c, ageHrs, windowOpen, windowLeftHrs });
      }
    }
    items.sort((a, b) => a.priority - b.priority || b.ageHrs - a.ageHrs);
    res.json({
      success: true,
      data: items.slice(0, 100).map(i => ({
        conversationId: i.conv._id,
        contact: i.conv.contact,
        reason: i.reason,
        lastMessage: i.conv.lastMessage,
        ageHrs: Math.round(i.ageHrs),
        windowOpen: i.windowOpen,
        windowLeftHrs: Math.round(i.windowLeftHrs * 10) / 10,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/followups/:conversationId/draft — AI-drafted follow-up message
router.post('/:conversationId/draft', async (req, res) => {
  try {
    const settings = await AISettings.findOne({ workspace: req.workspace._id });
    if (!settings?.apiKey) return res.status(400).json({ success: false, message: 'Set your AI API key in AI Settings first' });

    const conv = await Conversation.findOne({ _id: req.params.conversationId, workspace: req.workspace._id }).populate('contact', 'name phone');
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msgs = await Message.find({ conversation: conv._id }).sort('-createdAt').limit(15).lean();
    const history = msgs.reverse().map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text || '[' + (m.type || 'media') + ']'}`).join('\n');

    const result = await aiService.chat(settings.provider || 'openai', settings.apiKey, [
      { role: 'system', content: `You write short, friendly WhatsApp follow-up messages for a business. Reply with ONLY the message text, no quotes or explanations. Match the language the customer used (Hindi/Hinglish/English). Keep it under 60 words.${settings.businessContext ? ' Business context: ' + settings.businessContext : ''}` },
      { role: 'user', content: `Customer name: ${conv.contact?.name || 'there'}\nRecent conversation:\n${history}\n\nWrite a natural follow-up message to re-engage this customer.` },
    ], { model: settings.model || undefined, maxTokens: 200, ...aiService.azureOpts(settings) });

    res.json({ success: true, data: { draft: (result.content || '').trim() } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

module.exports = router;
