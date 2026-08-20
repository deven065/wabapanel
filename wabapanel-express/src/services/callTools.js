// AI Call Tools — function calling handlers for AI calls.
// Each tool maps to an action the AI can perform mid-call.
const mongoose = require('mongoose');

// Tool definitions (OpenAI function calling format)
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'create_order',
    description: 'Create a new order when customer wants to buy something. Use this when customer says they want to order a product.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Product name' },
              quantity: { type: 'number', description: 'Quantity' },
              price: { type: 'number', description: 'Price per unit in INR (if known, else 0)' },
            },
            required: ['name', 'quantity'],
          },
          description: 'Items to order',
        },
        notes: { type: 'string', description: 'Any special instructions from customer' },
      },
      required: ['items'],
    },
  },
  {
    type: 'function',
    name: 'send_payment_reminder',
    description: 'Send a payment reminder WhatsApp message to the customer about their pending payment.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Pending amount in INR' },
        message: { type: 'string', description: 'Custom reminder message in Hindi' },
      },
      required: ['message'],
    },
  },
  {
    type: 'function',
    name: 'qualify_lead',
    description: 'Update the lead/deal in pipeline based on customer conversation. Use when you learn about budget, requirements, or interest level.',
    parameters: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Pipeline stage: new, contacted, qualified, proposal, negotiation, won, lost' },
        value: { type: 'number', description: 'Deal value in INR if mentioned' },
        notes: { type: 'string', description: 'Key info from conversation (budget, requirements, timeline)' },
        leadScore: { type: 'string', enum: ['hot', 'warm', 'cold'], description: 'How interested the customer is' },
      },
      required: ['notes'],
    },
  },
  {
    type: 'function',
    name: 'schedule_followup',
    description: 'Schedule a follow-up WhatsApp message to send after the call ends.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Follow-up message to send (in Hindi/Hinglish)' },
        delay_minutes: { type: 'number', description: 'Minutes after call to send (default 5)' },
      },
      required: ['message'],
    },
  },
  {
    type: 'function',
    name: 'collect_feedback',
    description: 'Save customer feedback/survey response. Use when customer gives a rating or feedback.',
    parameters: {
      type: 'object',
      properties: {
        rating: { type: 'number', description: 'Rating 1-5 if given' },
        feedback: { type: 'string', description: 'Customer feedback text' },
        category: { type: 'string', description: 'Category: product, service, delivery, general' },
      },
      required: ['feedback'],
    },
  },
  {
    type: 'function',
    name: 'create_ticket',
    description: 'Create a support ticket when customer has a complaint or issue that needs resolution.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Brief subject of the issue' },
        description: { type: 'string', description: 'Detailed description of the problem' },
      },
      required: ['subject'],
    },
  },
];

// Groq-compatible tool definitions (same structure, slightly different wrapper)
const GROQ_TOOLS = TOOL_DEFINITIONS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// Execute a tool call. Returns result string.
async function executeTool(toolName, args, context) {
  const { workspaceId, phone, accessToken, phoneNumberId } = context;

  // Ensure contact exists or create
  const Contact = mongoose.model('Contact');
  const digits = (phone || '').replace(/[^0-9]/g, '');
  let contact = await Contact.findOne({
    workspace: workspaceId,
    phone: { $in: [digits, digits.replace(/^91/, '')] },
  });
  if (!contact) {
    contact = await Contact.create({ workspace: workspaceId, phone: digits, name: 'AI Call - ' + digits });
  }

  switch (toolName) {
    case 'create_order': return await handleCreateOrder(args, workspaceId, contact);
    case 'send_payment_reminder': return await handlePaymentReminder(args, contact, accessToken, phoneNumberId);
    case 'qualify_lead': return await handleQualifyLead(args, workspaceId, contact);
    case 'schedule_followup': return await handleScheduleFollowup(args, contact, accessToken, phoneNumberId);
    case 'collect_feedback': return await handleCollectFeedback(args, workspaceId, contact);
    case 'create_ticket': return await handleCreateTicket(args, workspaceId, contact);
    default: return JSON.stringify({ error: 'Unknown tool: ' + toolName });
  }
}

async function handleCreateOrder(args, workspaceId, contact) {
  const Order = mongoose.model('Order');
  const items = (args.items || []).map(i => ({
    name: i.name,
    quantity: i.quantity || 1,
    price: i.price || 0,
    currency: 'INR',
  }));
  const totalAmount = items.reduce((s, i) => s + (i.price * i.quantity), 0);
  const orderNumber = 'AI-' + Date.now().toString(36).toUpperCase();
  const order = await Order.create({
    workspace: workspaceId,
    contact: contact._id,
    orderNumber,
    items,
    totalAmount,
    currency: 'INR',
    status: 'pending',
    paymentStatus: 'unpaid',
    notes: args.notes || 'Order placed via AI call',
    source: 'api',
  });
  console.log('[AI Call][Tool] Order created:', orderNumber);
  return JSON.stringify({ success: true, orderNumber, totalAmount, message: 'Order ' + orderNumber + ' created successfully' });
}

async function handlePaymentReminder(args, contact, accessToken, phoneNumberId) {
  const WhatsAppService = require('./whatsappService');
  const wa = new WhatsAppService(accessToken, phoneNumberId);
  const msg = args.message || ('Payment reminder: ' + (args.amount ? 'Rs.' + args.amount + ' pending' : 'You have a pending payment'));
  await wa.sendTextMessage(contact.phone, msg);
  console.log('[AI Call][Tool] Payment reminder sent to', contact.phone);
  return JSON.stringify({ success: true, message: 'Payment reminder sent via WhatsApp' });
}

async function handleQualifyLead(args, workspaceId, contact) {
  const Pipeline = mongoose.model('Pipeline');
  const Contact = mongoose.model('Contact');

  // Update contact lead score
  if (args.leadScore) {
    await Contact.updateOne({ _id: contact._id }, { $set: { leadScore: args.leadScore } });
    if (args.leadScore === 'hot') {
      require('./ownerNotify').hotLead(workspaceId, contact, args).catch(() => {});
    }
  }

  // Find or create deal in pipeline
  const pipeline = await Pipeline.findOne({ workspace: workspaceId, status: 'active' });
  if (pipeline) {
    const existingDeal = pipeline.deals.find(d => String(d.contact) === String(contact._id));
    if (existingDeal) {
      if (args.stage) existingDeal.stage = args.stage;
      if (args.value) existingDeal.value = args.value;
      if (args.notes) existingDeal.notes = (existingDeal.notes ? existingDeal.notes + '\n' : '') + args.notes;
    } else {
      pipeline.deals.push({
        title: (contact.name || contact.phone) + ' - AI Call Lead',
        value: args.value || 0,
        contact: contact._id,
        stage: args.stage || pipeline.stages?.[0]?.name || 'new',
        notes: args.notes || '',
        status: 'open',
      });
    }
    await pipeline.save();
  }
  console.log('[AI Call][Tool] Lead qualified:', contact.phone, args.leadScore || '', args.stage || '');
  return JSON.stringify({ success: true, message: 'Lead updated - ' + (args.leadScore || 'noted') + (args.stage ? ', stage: ' + args.stage : '') });
}

async function handleScheduleFollowup(args, contact, accessToken, phoneNumberId) {
  const delay = (args.delay_minutes || 5) * 60 * 1000;
  const msg = args.message;
  // Schedule message after delay
  setTimeout(async () => {
    try {
      const WhatsAppService = require('./whatsappService');
      const wa = new WhatsAppService(accessToken, phoneNumberId);
      await wa.sendTextMessage(contact.phone, msg);
      console.log('[AI Call][Tool] Follow-up sent to', contact.phone);
    } catch (e) {
      console.error('[AI Call][Tool] Follow-up send failed:', e.message);
    }
  }, delay);
  console.log('[AI Call][Tool] Follow-up scheduled:', delay / 60000, 'min');
  return JSON.stringify({ success: true, message: 'Follow-up message scheduled for ' + (args.delay_minutes || 5) + ' minutes after call' });
}

async function handleCollectFeedback(args, workspaceId, contact) {
  const ContactNote = mongoose.model('ContactNote');
  const feedbackText = (args.rating ? 'Rating: ' + args.rating + '/5\n' : '') +
    (args.category ? 'Category: ' + args.category + '\n' : '') +
    'Feedback: ' + args.feedback;
  await ContactNote.create({
    workspace: workspaceId,
    contact: contact._id,
    text: feedbackText,
  });
  // Also update contact custom fields
  const Contact = mongoose.model('Contact');
  await Contact.updateOne({ _id: contact._id }, {
    $set: {
      'customFields.lastFeedback': args.feedback,
      'customFields.lastRating': args.rating || null,
      'customFields.feedbackDate': new Date().toISOString(),
    }
  });
  console.log('[AI Call][Tool] Feedback saved for', contact.phone);
  return JSON.stringify({ success: true, message: 'Feedback recorded - thank you' });
}

async function handleCreateTicket(args, workspaceId, contact) {
  const Ticket = mongoose.model('Ticket');
  const Conversation = mongoose.model('Conversation');
  const conv = await Conversation.findOne({ workspace: workspaceId, contact: contact._id });
  const ticket = await Ticket.create({
    workspace: workspaceId,
    contact: contact._id,
    conversation: conv?._id,
    subject: args.subject,
    keyword: args.description || args.subject,
    status: 'open',
    source: 'ai-call',
  });
  console.log('[AI Call][Tool] Ticket created:', ticket._id, args.subject);
  return JSON.stringify({ success: true, ticketId: ticket._id.toString(), message: 'Support ticket created: ' + args.subject });
}

module.exports = { TOOL_DEFINITIONS, GROQ_TOOLS, executeTool };
