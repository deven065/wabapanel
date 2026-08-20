const BotFlow = require('../models/BotFlow');
const { checkPlanLimit } = require('../utils/planLimits');

const getBotFlows = async (req, res) => {
  try {
    const flows = await BotFlow.find({ workspace: req.workspace._id }).sort('-updatedAt');
    res.json({ success: true, data: flows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBotFlow = async (req, res) => {
  try {
    const flow = await BotFlow.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createBotFlow = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'botFlows', 'BotFlow');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const { name, triggerKeywords = [], matchType = 'exact' } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name,
      triggerKeywords: triggerKeywords.filter(Boolean),
      matchType,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBotFlow = async (req, res) => {
  try {
    const allowed = ['name', 'triggerKeywords', 'matchType', 'eventTrigger', 'isActive', 'startNode', 'nodes', 'startX', 'startY'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const flow = await BotFlow.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      update,
      { new: true, runValidators: true }
    );
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/bot-flows/generate — AI builds a full flow from a business description
const generateBotFlow = async (req, res) => {
  try {
    const limitMsg = await checkPlanLimit(req, 'botFlows', 'BotFlow');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const { business, goal, name } = req.body;
    if (!business || !goal) return res.status(400).json({ success: false, message: 'Business details and flow goal are required' });

    const AISettings = require('../models/AISettings');
    const ai = await AISettings.findOne({ workspace: req.workspace._id });
    if (!ai || !ai.apiKey) return res.status(400).json({ success: false, message: 'Add your AI API key in AI Settings first' });

    const system = `You design WhatsApp chatbot flows. Reply ONLY with valid JSON (no markdown, no explanation) in this exact shape:
{"name":"Flow name","triggerKeywords":["hi","hello"],"startNode":"n1","nodes":[{...}]}
Each node object supports these fields:
- id: unique string like "n1","n2"
- name: short label
- type: "text" | "interactive"
- text: the message body (for both types)
- next: id of the next node (for type "text"; empty string to end)
- For type "interactive": mode:"buttons" plus buttons:[{title:"Button label (max 20 chars)",next:"nodeId or empty"}] (max 3 buttons), or mode:"list" plus listButtonText:"Menu" and rows:[{title,description,next}] (max 10 rows)
- x,y: canvas position numbers. Lay nodes out left-to-right: start at x=40,y=60, add ~260 to x per step, offset y by ~140 for branches.
Rules: 6-14 nodes, cover the main journey (greeting, menu of options, answers, ask contact details when useful, closing). Message text must be customer-ready, in the same language as the user's description. Do not invent facts not in the business details.`;
    const user = `Business details:\n${business}\n\nWhat the flow should do:\n${goal}${name ? `\n\nFlow name: ${name}` : ''}`;

    const aiService = require('../services/aiService');
    const resp = await aiService.chat(ai.provider, ai.apiKey, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { model: ai.model || undefined, temperature: 0.4, maxTokens: 4000, ...aiService.azureOpts(ai) });

    let raw = (resp.content || '').trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1].trim();
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('AI did not return a valid flow');
    const parsed = JSON.parse(raw.slice(first, last + 1));
    if (!Array.isArray(parsed.nodes) || !parsed.nodes.length) throw new Error('AI returned an empty flow');

    const ids = new Set(parsed.nodes.map((n) => String(n.id || '')));
    const nodes = parsed.nodes.map((n, i) => {
      const type = n.type === 'interactive' ? 'interactive' : 'text';
      const node = {
        id: String(n.id || `n${i + 1}`),
        name: String(n.name || `Step ${i + 1}`).slice(0, 60),
        type,
        text: String(n.text || '').slice(0, 4000),
        next: type === 'text' && ids.has(String(n.next)) ? String(n.next) : '',
        x: Number.isFinite(Number(n.x)) ? Number(n.x) : 40 + (i % 5) * 260,
        y: Number.isFinite(Number(n.y)) ? Number(n.y) : 60 + Math.floor(i / 5) * 160,
      };
      if (type === 'interactive') {
        if (n.mode === 'list' && Array.isArray(n.rows) && n.rows.length) {
          node.mode = 'list';
          node.listButtonText = String(n.listButtonText || 'Menu').slice(0, 20);
          node.rows = n.rows.slice(0, 10).map((r) => ({
            title: String(r.title || '').slice(0, 24),
            description: String(r.description || '').slice(0, 72),
            next: ids.has(String(r.next)) ? String(r.next) : '',
          }));
        } else {
          node.mode = 'buttons';
          node.buttons = (Array.isArray(n.buttons) ? n.buttons : []).slice(0, 3).map((b) => ({
            title: String(b.title || '').slice(0, 20),
            next: ids.has(String(b.next)) ? String(b.next) : '',
          }));
        }
      }
      return node;
    });

    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: String(name || parsed.name || 'AI Generated Flow').slice(0, 100),
      triggerKeywords: (Array.isArray(parsed.triggerKeywords) ? parsed.triggerKeywords : []).filter(Boolean).map(String).slice(0, 10),
      matchType: 'contains',
      startNode: ids.has(String(parsed.startNode)) ? String(parsed.startNode) : nodes[0].id,
      nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    const status = error.response?.status;
    if (status === 429 || error.response?.data?.error?.code === 'insufficient_quota') {
      return res.status(400).json({ success: false, message: 'Your AI API key has run out of quota/credits. Add billing to your AI provider account or set a different key in AI Settings.' });
    }
    if (status === 401) {
      return res.status(400).json({ success: false, message: 'Your AI API key is invalid. Check it in AI Settings.' });
    }
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
};

// @POST /api/bot-flows/preset — import a ready-made preset flow (inactive; user reviews then turns on)
const createPresetFlow = async (req, res) => {
  try {
    const { PRESETS } = require('../services/presetFlows');
    const key = String(req.body.preset || 'lead_nurturing');
    const def = PRESETS[key];
    if (!def) return res.status(400).json({ success: false, message: 'Unknown preset' });
    const limitMsg = await checkPlanLimit(req, 'botFlows', 'BotFlow');
    if (limitMsg) return res.status(403).json({ success: false, message: limitMsg });
    const flow = await BotFlow.create({
      workspace: req.workspace._id,
      name: def.name,
      triggerKeywords: def.triggerKeywords || [],
      matchType: def.matchType || 'contains',
      eventTrigger: def.eventTrigger || '',
      startNode: def.startNode,
      nodes: def.nodes,
      isActive: false,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBotFlow = async (req, res) => {
  try {
    const flow = await BotFlow.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' });
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getBotFlows, getBotFlow, createBotFlow, updateBotFlow, deleteBotFlow, generateBotFlow, createPresetFlow };
