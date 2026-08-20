const axios = require('axios');

// Delivers developer API webhook events (subscribed via POST /v1/webhooks).
async function dispatch(workspace, event, payload) {
  try {
    const Workspace = require('../models/Workspace');
    const ws = workspace.apiWebhooks !== undefined
      ? workspace
      : await Workspace.findById(workspace._id || workspace).select('apiWebhooks').lean();
    const hooks = (ws?.apiWebhooks || []).filter(h => (h.events || []).includes(event));
    await Promise.allSettled(hooks.map(h =>
      axios.post(h.url, { event, timestamp: new Date().toISOString(), data: payload }, { timeout: 8000 })
    ));
  } catch (e) {
    console.error('[ApiWebhook] dispatch error:', e.message);
  }
}

module.exports = { dispatch };
