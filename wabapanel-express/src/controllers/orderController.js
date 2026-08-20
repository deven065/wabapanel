const Order = require('../models/Order');
const { sendPaginated } = require('../utils/apiResponse');

const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus, search } = req.query;
    const query = { workspace: req.workspace._id };
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.name': { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('contact', 'name phone')
      .populate('items.product', 'name sku')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    sendPaginated(res, orders, total, page, limit);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    })
      .populate('contact', 'name phone email')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createOrder = async (req, res) => {
  try {
    const lastOrder = await Order.findOne({ workspace: req.workspace._id })
      .sort('-createdAt')
      .select('orderNumber');

    let nextNum = 1;
    if (lastOrder && lastOrder.orderNumber) {
      const match = lastOrder.orderNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const orderNumber = `ORD-${String(nextNum).padStart(6, '0')}`;

    const order = await Order.create({
      ...req.body,
      workspace: req.workspace._id,
      orderNumber,
    });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateOrder = async (req, res) => {
  try {
    const oldOrder = await Order.findOne({ _id: req.params.id, workspace: req.workspace._id });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Send WhatsApp notification on status change
    if (req.body.status && oldOrder && req.body.status !== oldOrder.status) {
      sendOrderNotification(req.workspace._id, order, req.body.status);
    }

    // findOneAndUpdate skips the Order save hooks, so fire payment triggers here
    if (oldOrder && oldOrder.paymentStatus !== 'paid' && order.paymentStatus === 'paid') {
      setImmediate(async () => {
        try {
          const actionRunner = require('../services/actionRunner');
          const Contact = require('../models/Contact');
          const contact = order.contact ? await Contact.findById(order.contact) : null;
          const ctx = { workspace: req.workspace, contact, io: req.app.get('io') };
          await actionRunner.runPredefined('on_payment', ctx);
          await actionRunner.fireEvent(req.workspace, 'payment_received', ctx);
        } catch (e) { console.error('[ActionRunner] order update hook:', e.message); }
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: { _id: req.params.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send WhatsApp notification for order status
const sendOrderNotification = async (workspaceId, order, status) => {
  try {
    const Workspace = require('../models/Workspace');
    const Contact = require('../models/Contact');
    const WhatsAppService = require('../services/whatsappService');

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace?.whatsapp?.accessToken || !workspace?.whatsapp?.phoneNumberId) return;

    const contact = order.contact ? await Contact.findById(order.contact) : null;
    const phone = contact?.phone || order.contactPhone;
    if (!phone) return;

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
    const name = contact?.name || order.contactName || 'Customer';
    const orderNum = order.orderNumber || 'N/A';

    let message = '';
    switch(status) {
      case 'confirmed':
        message = `Hi ${name}! ✅ Your order #${orderNum} has been confirmed. We're processing it now!`;
        break;
      case 'processing':
        message = `Hi ${name}! 🔄 Your order #${orderNum} is being processed. We'll notify you when it ships.`;
        break;
      case 'shipped':
        message = `Hi ${name}! 📦 Your order #${orderNum} has been shipped! You'll receive it soon.`;
        break;
      case 'delivered':
        message = `Hi ${name}! 🎉 Your order #${orderNum} has been delivered. Thank you for shopping with us!`;
        break;
      case 'cancelled':
        message = `Hi ${name}, your order #${orderNum} has been cancelled. If you have questions, please reply to this message.`;
        break;
    }

    if (message) {
      const result = await wa.sendTextMessage(cleanPhone, message);
      console.log('[Order] Sent ' + status + ' notification for ' + orderNum);

      // Save message to chat inbox
      try {
        const Message = require('../models/Message');
        const Conversation = require('../models/Conversation');

        let dbContact = contact;
        if (!dbContact) {
          const last10 = cleanPhone.slice(-10);
          dbContact = await Contact.findOne({
            workspace: workspaceId,
            $or: [
              { phone: cleanPhone },
              { phone: '+' + cleanPhone },
              { phone: last10 },
              { phone: { $regex: last10 + '$' } },
            ]
          });
        }
        if (!dbContact) {
          dbContact = await Contact.create({
            workspace: workspaceId, phone: cleanPhone, name: name, status: 'active'
          });
        }

        let conversation = await Conversation.findOneAndUpdate(
          { workspace: workspaceId, contact: dbContact._id },
          { 
            workspace: workspaceId, contact: dbContact._id,
            lastMessage: { text: message, timestamp: new Date(), direction: 'outbound', type: 'text' },
            $setOnInsert: { status: 'active' }
          },
          { upsert: true, new: true }
        );

        await Message.create({
          workspace: workspaceId,
          conversation: conversation._id,
          contact: dbContact._id,
          direction: 'outbound',
          type: 'text',
          text: message,
          status: result?.success ? 'sent' : 'failed',
          waMessageId: result?.data?.messages?.[0]?.id || '',
          isAutomated: true,
          metadata: { source: 'order_' + status, orderId: order._id },
        });
      } catch (dbErr) {
        console.error('[Order] DB save error:', dbErr.message);
      }
    }
  } catch (err) {
    console.error('[Order] Notification error:', err.message);
  }
};

module.exports = { getOrders, getOrder, createOrder, updateOrder, deleteOrder };
