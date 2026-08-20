const router = require('express').Router();
const crypto = require('crypto');
const { triggerFlowByWebhook, handleWooCommerceOrder } = require('../services/botFlowEngine');
const { LEAD_SOURCES, SOURCE_LABELS, mapLeadPayload, runAutomation, isDuplicateEvent } = require('../services/integrationAutomation');
const Integration = require('../models/Integration');

// If a webhook secret is set for the integration, the ?key= query must match
async function secretOk(workspaceId, type, req) {
  const integration = await Integration.findOne({ workspace: workspaceId, type }).select('webhookSecret').lean();
  if (!integration || !integration.webhookSecret) return true;
  return req.query.key === integration.webhookSecret;
}

// Generic lead-source webhook: IndiaMART, Justdial, TradeIndia, website forms, etc.
// POST/GET /api/ext/lead/:workspaceId/:source
const handleLead = async (req, res) => {
  try {
    const source = req.params.source;
    if (!LEAD_SOURCES.includes(source)) return res.status(404).json({ success: false, message: 'Unknown lead source' });
    if (!(await secretOk(req.params.workspaceId, source, req))) {
      return res.status(401).json({ success: false, message: 'Invalid webhook key' });
    }
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    delete payload.key;
    const lead = mapLeadPayload(source, payload);
    if (!lead.phone) return res.status(200).json({ success: false, message: 'No phone number found in payload' });
    if (await isDuplicateEvent(req.params.workspaceId, [source, 'lead', lead.phone, lead.email, lead.detail])) {
      return res.status(200).json({ success: true, sent: false, message: 'Duplicate lead ignored' });
    }
    const result = await runAutomation({
      workspaceId: req.params.workspaceId,
      type: source,
      event: 'lead',
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      tags: [source, 'lead'],
      vars: [lead.name || 'there', SOURCE_LABELS[source] || source],
    });
    res.status(200).json({ success: result.ok, sent: result.sent || false, message: result.reason || result.error || 'Lead received' });
  } catch (error) {
    console.error('[LeadWebhook] error:', error.message);
    res.status(200).json({ success: false, message: error.message });
  }
};
router.post('/lead/:workspaceId/:source', handleLead);
router.get('/lead/:workspaceId/:source', handleLead);

// Shopify webhooks (orders/create, orders/fulfilled, refunds/create)
// POST /api/ext/shopify/:workspaceId
router.post('/shopify/:workspaceId', async (req, res) => {
  try {
    res.status(200).send('OK'); // Shopify requires fast 200
    const topic = String(req.headers['x-shopify-topic'] || '').toLowerCase();
    const order = req.body || {};

    // Verify HMAC if webhook secret configured
    const integration = await Integration.findOne({ workspace: req.params.workspaceId, type: 'shopify', connected: true });
    if (!integration) return;
    if (integration.webhookSecret && req.query.key !== integration.webhookSecret) { console.error('[Shopify] invalid webhook key'); return; }
    const secret = integration.config?.apiSecret;
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    if (secret && hmacHeader && req.rawBody) {
      const digest = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
      if (digest !== hmacHeader) { console.error('[Shopify] HMAC mismatch'); return; }
    }

    let event = '';
    if (topic.startsWith('orders/create')) event = 'order_created';
    else if (topic.startsWith('orders/fulfilled') || topic.startsWith('fulfillments/create')) event = 'order_fulfilled';
    else if (topic.startsWith('refunds/create') || topic.startsWith('orders/cancelled')) event = 'order_refunded';
    if (!event) return;

    const dedupeId = String(order.id || order.order_id || order.admin_graphql_api_id || '');
    if (dedupeId && await isDuplicateEvent(req.params.workspaceId, ['shopify', event, dedupeId])) return;

    const src = order.order || order; // refunds payload nests less info; fall back
    const phone = src.phone || src.billing_address?.phone || src.shipping_address?.phone || src.customer?.phone || src.customer?.default_address?.phone || '';
    const name = src.customer ? `${src.customer.first_name || ''} ${src.customer.last_name || ''}`.trim() : (src.billing_address?.name || '');
    const orderNo = src.order_number || src.name || src.order_id || src.id || '';
    const amount = `${src.currency || 'INR'} ${src.total_price || src.amount || src.transactions?.[0]?.amount || ''}`.trim();
    const trackUrl = src.fulfillments?.[0]?.tracking_url || src.order_status_url || 'our website';

    const vars = event === 'order_fulfilled'
      ? [name || 'there', String(orderNo), String(trackUrl)]
      : [name || 'there', String(orderNo), amount];

    await runAutomation({
      workspaceId: req.params.workspaceId, type: 'shopify', event,
      phone, name, tags: ['shopify'], vars,
    });
  } catch (error) {
    console.error('[Shopify] webhook error:', error.message);
  }
});

// Shiprocket shipment status webhook
// POST /api/ext/shiprocket/:workspaceId
router.post('/shiprocket/:workspaceId', async (req, res) => {
  try {
    res.status(200).send('OK');
    if (!(await secretOk(req.params.workspaceId, 'shiprocket', req))) { console.error('[Shiprocket] invalid webhook key'); return; }
    const d = req.body || {};
    const phone = d.customer_phone || d.billing_phone || d.phone || '';
    const name = d.customer_name || d.billing_customer_name || '';
    const status = d.current_status || d.shipment_status || d.status || 'Updated';
    const orderId = d.order_id || d.channel_order_id || d.sr_order_id || '';
    const awb = d.awb || d.awb_code || '';
    if (await isDuplicateEvent(req.params.workspaceId, ['shiprocket', String(orderId), String(awb), String(status)])) return;
    await runAutomation({
      workspaceId: req.params.workspaceId, type: 'shiprocket', event: 'shipment_update',
      phone, name, tags: ['shiprocket'],
      vars: [name || 'there', String(orderId), String(status), String(awb)],
    });
  } catch (error) {
    console.error('[Shiprocket] webhook error:', error.message);
  }
});

// POST /api/ext/webhook/:workspaceId/:flowId — trigger a bot flow for a phone number
router.post('/webhook/:workspaceId/:flowId', async (req, res) => {
  try {
    const { phone, data } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'phone is required' });
    const result = await triggerFlowByWebhook({
      workspaceId: req.params.workspaceId,
      flowId: req.params.flowId,
      phone,
      data: data || {},
    });
    res.json({ success: result.ok, ...result });
  } catch (error) {
    console.error('[ExtWebhook] trigger error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/ext/woocommerce/:workspaceId — WooCommerce order webhook
router.post('/woocommerce/:workspaceId', async (req, res) => {
  try {
    const order = req.body;
    if (!order || !order.id) return res.status(400).json({ success: false, message: 'Invalid order data' });
    if (!(await secretOk(req.params.workspaceId, 'woocommerce', req))) {
      return res.status(401).json({ success: false, message: 'Invalid webhook key' });
    }

    // Template-based automation first (approved utility templates per event)
    const topic = String(req.headers['x-wc-webhook-topic'] || '').toLowerCase();
    const status = String(order.status || '').toLowerCase();
    let event = '';
    if (status === 'refunded' || topic.includes('refund')) event = 'order_refunded';
    else if (status === 'completed') event = 'order_completed';
    else if (topic === 'order.created' || ['pending', 'processing', 'on-hold'].includes(status)) event = 'order_created';

    if (event && await isDuplicateEvent(req.params.workspaceId, ['woocommerce', event, String(order.id)])) {
      return res.status(200).json({ success: true, sent: false, message: 'Duplicate event ignored' });
    }

    let autoResult = { ok: false, sent: false };
    if (event) {
      const b = order.billing || {};
      const name = `${b.first_name || ''} ${b.last_name || ''}`.trim();
      autoResult = await runAutomation({
        workspaceId: req.params.workspaceId, type: 'woocommerce', event,
        phone: b.phone || '', name, email: b.email || '', tags: ['woocommerce'],
        vars: [name || 'there', String(order.number || order.id), `${order.currency || 'INR'} ${order.total || ''}`.trim()],
      });
    }
    if (autoResult.sent) return res.json({ success: true, sent: true });

    // Fallback: legacy bot-flow / session-message handling
    const result = await handleWooCommerceOrder({
      workspaceId: req.params.workspaceId,
      order,
    });
    res.json({ success: result.ok, ...result });
  } catch (error) {
    console.error('[WooCommerce] webhook error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
