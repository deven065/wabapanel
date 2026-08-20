const mongoose = require('mongoose');
const axios = require('axios');
const Product = require('../models/Product');
const Workspace = require('../models/Workspace');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Order = require('../models/Order');
const PaymentLink = require('../models/PaymentLink');
const Integration = require('../models/Integration');
const WhatsAppService = require('../services/whatsappService');
const { createGatewayLink } = require('../services/gatewayLinks');
const { sendPaginated } = require('../utils/apiResponse');

const GRAPH = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';

// Hosted-gateway methods usable for a public catalogue checkout (need a connected Integration).
const CHECKOUT_GATEWAYS = ['razorpay', 'stripe', 'paypal', 'cashfree', 'paystack', 'mercadopago', 'phonepe', 'paytm'];

// Which of the above are actually connected + configured for this workspace.
const activeGateways = async (wsId) => {
  const integs = await Integration.find({ workspace: wsId, type: { $in: CHECKOUT_GATEWAYS }, connected: true })
    .select('type config').lean();
  return integs
    .filter((i) => i.config && (i.config.apiKey || i.config.apiSecret || i.config.clientId))
    .map((i) => i.type);
};

// Turn a raw Meta Graph error into a clear, actionable message. The common case
// for numbers on the WhatsApp Business app (not Cloud API Commerce) is the
// "SMB business type" rejection — such catalogues can only be managed inside the
// WhatsApp app / Meta Commerce Manager, not via the API. Share the public link instead.
const metaSyncError = (e) => {
  const err = e && e.response && e.response.data && e.response.data.error;
  const raw = (err && err.message) || (e && e.message) || '';
  if (/SMB business type/i.test(raw) || (err && err.code === 10)) {
    return 'This WhatsApp number is a Small-Business (SMB) account, so Meta does not allow adding products to its catalogue through the API. Manage this catalogue inside the WhatsApp Business app / Meta Commerce Manager, or just use "Share Catalogue" / the public link to send products to customers — that works without the sync.';
  }
  return raw || 'WhatsApp rejected the catalogue sync. Your connection may lack catalogue permission.';
};

// White-label: build the public catalog URL on the panel's OWN domain (from the
// request), falling back to the configured app URL.
const panelUrl = async (req) => {
  try {
    const origin = req.get && req.get('origin');
    if (origin) return origin.replace(/\/$/, '');
    const host = req.get && req.get('host');
    if (host) {
      const proto = (req.get && req.get('x-forwarded-proto')) || req.protocol || 'https';
      return `${proto}://${host}`.replace(/\/$/, '');
    }
  } catch { /* noop */ }
  try {
    const SystemSettings = require('../models/SystemSettings');
    const s = await SystemSettings.findOne().lean();
    if (s?.appUrl) return s.appUrl.replace(/\/$/, '');
  } catch { /* noop */ }
  return (process.env.FRONTEND_URL || 'https://app.wabapanel.com').replace(/\/$/, '');
};

const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, status } = req.query;
    const query = { workspace: req.workspace._id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) query.category = category;
    if (status) query.status = status;

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, products, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('createdBy', 'name email');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const product = await Product.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/catalogs/public/:wsId — public product catalogue (no auth) for the share link.
const getPublicCatalog = async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.wsId).select('name').lean();
    if (!ws) return res.status(404).json({ success: false, message: 'Catalogue not found' });
    const products = await Product.find({ workspace: ws._id, status: 'active' })
      .select('name description price currency category images url availability')
      .sort('-createdAt')
      .lean();
    const gateways = await activeGateways(ws._id);
    const currency = (products.find((p) => p.currency) || {}).currency || 'INR';
    res.json({ success: true, data: { name: ws.name, products, gateways, currency } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/catalogs/public/:wsId/order — public checkout (no auth): create an order
// from the catalogue and, if a gateway is active, a payment link to complete payment.
const createPublicOrder = async (req, res) => {
  try {
    const ws = await Workspace.findById(req.params.wsId).select('name whatsapp');
    if (!ws) return res.status(404).json({ success: false, message: 'Catalogue not found' });

    const { items, customer, method } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'Your cart is empty' });
    if (!customer || !customer.name || !customer.phone) return res.status(400).json({ success: false, message: 'Name and phone are required' });

    const ids = items.map((i) => i.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: ids }, workspace: ws._id, status: 'active' }).lean();
    if (!products.length) return res.status(400).json({ success: false, message: 'Selected products are unavailable' });
    const pmap = {};
    products.forEach((p) => { pmap[String(p._id)] = p; });

    const currency = (products.find((p) => p.currency) || {}).currency || 'INR';
    const orderItems = [];
    let total = 0;
    for (const it of items) {
      const p = pmap[String(it.productId)];
      if (!p) continue;
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      total += (p.price || 0) * qty;
      orderItems.push({ product: p._id, name: p.name, quantity: qty, price: p.price || 0, currency: p.currency || currency });
    }
    if (!orderItems.length) return res.status(400).json({ success: false, message: 'Selected products are unavailable' });

    let phone = String(customer.phone).replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    const last10 = phone.slice(-10);
    let contact = await Contact.findOne({
      workspace: ws._id,
      $or: [{ phone }, { phone: '+' + phone }, { phone: last10 }, { phone: { $regex: last10 + '$' } }],
    });
    if (!contact) contact = await Contact.create({ workspace: ws._id, phone, name: customer.name, status: 'active', source: 'catalog' });

    const lastOrder = await Order.findOne({ workspace: ws._id }).sort('-createdAt').select('orderNumber');
    let nextNum = 1;
    if (lastOrder && lastOrder.orderNumber) {
      const m = lastOrder.orderNumber.match(/(\d+)$/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const orderNumber = `ORD-${String(nextNum).padStart(6, '0')}`;

    // Decide the gateway first: caller's choice if active, else the first active one.
    const gateways = await activeGateways(ws._id);
    const chosen = method && gateways.includes(method) ? method : gateways[0];
    const needsPayment = !!(chosen && total > 0);

    const order = await Order.create({
      workspace: ws._id, contact: contact._id, orderNumber, items: orderItems,
      totalAmount: total, currency, status: 'pending', paymentStatus: 'unpaid', source: 'api',
      paymentPending: needsPayment,
      shippingAddress: {
        name: customer.name, phone, address: customer.address || '', city: customer.city || '',
        state: customer.state || '', pincode: customer.pincode || '', country: customer.country || 'India',
      },
    });

    if (!needsPayment) {
      return res.json({ success: true, data: { orderNumber, payUrl: '', needsPayment: false } });
    }

    const description = `Order ${orderNumber}`;
    const plDocId = new mongoose.Types.ObjectId();
    let link = '';
    let razorpayLinkId = '';
    let externalId = '';

    if (chosen === 'razorpay') {
      const integ = await Integration.findOne({ workspace: ws._id, type: 'razorpay', connected: true });
      if (!integ || !integ.config || !integ.config.apiKey || !integ.config.apiSecret) {
        return res.status(400).json({ success: false, message: 'Razorpay is not configured on this store' });
      }
      const Razorpay = require('razorpay');
      const rzp = new Razorpay({ key_id: integ.config.apiKey, key_secret: integ.config.apiSecret });
      const plink = await rzp.paymentLink.create({
        amount: Math.round(total * 100),
        currency: 'INR',
        description,
        customer: { name: customer.name || 'Customer', contact: `+${phone}` },
        notify: { sms: false, email: false },
        notes: { workspace: String(ws._id), plId: String(plDocId) },
      });
      link = plink.short_url;
      razorpayLinkId = plink.id;
    } else {
      const integ = await Integration.findOne({ workspace: ws._id, type: chosen, connected: true });
      if (!integ) return res.status(400).json({ success: false, message: `${chosen} is not configured on this store` });
      const base = await panelUrl(req);
      const result = await createGatewayLink(chosen, integ.config, {
        amount: total, currency, description,
        customer: { name: customer.name, phone, email: contact.email },
        redirectUrl: `${base}/catalog/${ws._id}?paid=1`,
      });
      link = result.link;
      externalId = result.externalId || '';
    }

    await PaymentLink.create({
      _id: plDocId, workspace: ws._id, contact: contact._id, amount: total, description,
      method: chosen, link, razorpayLinkId, externalId, currency, status: 'created', order: order._id,
    });

    res.json({ success: true, data: { orderNumber, payUrl: link, needsPayment: true } });
  } catch (error) {
    res.status(500).json({ success: false, message: (error.error && error.error.description) || error.message });
  }
};

// @POST /api/catalogs/share — send the catalogue link (and optionally one product)
// to a contact over WhatsApp so it shows up in their chat.
const shareCatalog = async (req, res) => {
  try {
    const { contactId, productId } = req.body || {};
    if (!contactId) return res.status(400).json({ success: false, message: 'contactId is required' });
    if (!req.workspace.whatsapp?.isConnected) return res.status(400).json({ success: false, message: 'WhatsApp not connected' });

    const contact = await Contact.findOne({ _id: contactId, workspace: req.workspace._id });
    if (!contact?.phone) return res.status(404).json({ success: false, message: 'Contact not found' });

    let phone = String(contact.phone).replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const link = `${await panelUrl(req)}/catalog/${req.workspace._id}`;
    const { resolveWaCreds } = require('../utils/waSender');
    const creds = resolveWaCreds(req.workspace.whatsapp, req.workspace.whatsapp.phoneNumberId);
    const waService = new WhatsAppService(creds.accessToken, creds.phoneNumberId);

    let product = null;
    if (productId) {
      product = await Product.findOne({ _id: productId, workspace: req.workspace._id }).lean();
    }

    let result, msgType = 'text', msgText = '';
    if (product) {
      const priceStr = product.price ? `\n${product.currency || 'INR'} ${product.price}` : '';
      msgText = `*${product.name}*${priceStr}${product.description ? `\n${product.description}` : ''}\n\n${link}`;
      const img = product.images && product.images[0];
      if (img) { msgType = 'image'; result = await waService.sendMediaMessage(phone, 'image', img, msgText); }
      else { result = await waService.sendTextMessage(phone, msgText); }
    } else {
      msgText = `Have a look at our product catalogue 👇\n${link}`;
      result = await waService.sendTextMessage(phone, msgText);
    }
    if (!result.success) return res.status(400).json({ success: false, message: result.error?.message || 'Failed to send. The 24-hour messaging window may be closed.' });

    const conversation = await Conversation.findOneAndUpdate(
      { workspace: req.workspace._id, contact: contact._id },
      { workspace: req.workspace._id, contact: contact._id, status: 'active', lastMessage: { text: msgText.slice(0, 120), timestamp: new Date(), direction: 'outbound', type: msgType } },
      { upsert: true, new: true }
    );
    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: contact._id,
      direction: 'outbound', type: msgType, text: msgText,
      media: msgType === 'image' ? { url: product.images[0] } : undefined,
      waMessageId: result.data?.messages?.[0]?.id || '', status: 'sent',
      metadata: { source: 'catalog_share' },
    });
    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });

    res.json({ success: true, data: { link, sent: true } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/catalogs/sync — push local products into the WhatsApp (Meta) Commerce
// catalogue connected to this workspace's WABA, so they show natively on WhatsApp.
// Best-effort: needs a catalogue connected in Meta Commerce Manager + a token with
// catalog_management. Returns Meta's own message when that isn't available.
const syncToMeta = async (req, res) => {
  try {
    const wa = req.workspace.whatsapp || {};
    if (!wa.isConnected || !wa.wabaId || !wa.accessToken) {
      return res.status(400).json({ success: false, message: 'Connect WhatsApp (Cloud API) first to sync the catalogue.' });
    }

    // Find the catalogue attached to this WABA.
    let catalogId = '';
    try {
      const cat = await axios.get(`${GRAPH}/${wa.wabaId}/product_catalogs`, {
        params: { access_token: wa.accessToken, fields: 'id,name' },
      });
      catalogId = cat.data?.data?.[0]?.id || '';
    } catch (e) {
      return res.status(400).json({ success: false, message: metaSyncError(e) });
    }
    if (!catalogId) {
      return res.status(400).json({ success: false, message: 'No catalogue is connected to your WhatsApp account. Create one in Meta Commerce Manager and connect it, then sync again.' });
    }

    const products = await Product.find({ workspace: req.workspace._id, status: 'active' }).lean();
    if (!products.length) return res.json({ success: true, data: { synced: 0, message: 'No active products to sync' } });

    const base = await panelUrl(req);
    const requests = products.map((p) => ({
      method: 'UPDATE',
      retailer_id: p.sku || String(p._id),
      data: {
        name: (p.name || '').slice(0, 200),
        description: (p.description || p.name || '').slice(0, 5000),
        price: Math.round((p.price || 0) * 100),
        currency: p.currency || 'INR',
        image_url: (p.images && p.images[0]) || undefined,
        url: p.url || `${base}/catalog/${req.workspace._id}`,
        availability: p.availability === 'out_of_stock' ? 'out of stock' : p.availability === 'preorder' ? 'preorder' : 'in stock',
      },
    }));

    let handles;
    try {
      const r = await axios.post(`${GRAPH}/${catalogId}/items_batch`, {
        access_token: wa.accessToken,
        item_type: 'PRODUCT_ITEM',
        requests,
      });
      handles = r.data;
    } catch (e) {
      return res.status(400).json({ success: false, message: metaSyncError(e) });
    }

    await Product.updateMany({ workspace: req.workspace._id, status: 'active' }, { $set: { metaCatalogId: catalogId } });
    res.json({ success: true, data: { synced: products.length, catalogId, handles } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, getPublicCatalog, createPublicOrder, shareCatalog, syncToMeta };
