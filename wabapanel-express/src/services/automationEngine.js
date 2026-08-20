const Automation = require('../models/Automation');
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const WhatsAppService = require('./whatsappService');
const aiService = require('./aiService');

class AutomationEngine {
  constructor(io) {
    this.io = io;
  }

  async execute(automationId, workspaceData, triggerContact, triggerMessage) {
    const automation = await Automation.findById(automationId);
    if (!automation || automation.status !== 'active') return;

    const { nodes, edges } = automation;
    if (!nodes || nodes.length === 0) return;

    const context = {
      workspace: workspaceData,
      contact: triggerContact,
      message: triggerMessage,
      variables: {},
    };

    // Find trigger node
    const triggerNode = nodes.find(n =>
      n.type === 'trigger' || n.type === 'start'
    );
    if (!triggerNode) return;

    try {
      await this._processNode(triggerNode.id, nodes, edges, context, automation);
      automation.stats.completed++;
    } catch (error) {
      console.error(`Automation ${automationId} execution error:`, error.message);
      automation.stats.failed++;
    }

    await automation.save();
  }

  async _processNode(nodeId, nodes, edges, context, automation) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const data = node.data || {};

    switch (node.type) {
      case 'trigger':
      case 'start':
        break;

      case 'message':
      case 'text_message':
        await this._sendTextMessage(data, context);
        break;

      case 'media':
      case 'media_message':
        await this._sendMediaMessage(data, context);
        break;

      case 'template':
      case 'template_message':
        await this._sendTemplateMessage(data, context);
        break;

      case 'button_message':
        await this._sendButtonMessage(data, context);
        break;

      case 'list_message':
        await this._sendListMessage(data, context);
        break;

      case 'location':
      case 'location_message':
        await this._sendLocationMessage(data, context);
        break;

      case 'delay':
      case 'wait':
        await this._handleDelay(data);
        break;

      case 'condition':
      case 'if_else': {
        const result = this._evaluateCondition(data, context);
        const nextEdge = edges.find(e =>
          e.source === nodeId &&
          ((result && (e.sourceHandle === 'true' || e.sourceHandle === 'yes' || e.label === 'Yes')) ||
           (!result && (e.sourceHandle === 'false' || e.sourceHandle === 'no' || e.label === 'No')))
        );
        if (nextEdge) {
          await this._processNode(nextEdge.target, nodes, edges, context, automation);
        }
        return; // condition handles its own branching
      }

      case 'action':
        await this._handleAction(data, context);
        break;

      case 'api_call':
      case 'http_request':
        await this._handleApiCall(data, context);
        break;

      case 'ai_response':
      case 'ai':
        await this._handleAiResponse(data, context);
        break;

      case 'assign_agent':
        await this._handleAssignAgent(data, context);
        break;

      case 'tag':
      case 'add_tag':
        await this._handleAddTag(data, context);
        break;

      case 'segment':
      case 'add_segment':
        await this._handleAddSegment(data, context);
        break;

      default:
        console.log(`Unknown node type: ${node.type}`);
    }

    // Find next nodes via edges
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    for (const edge of outgoingEdges) {
      await this._processNode(edge.target, nodes, edges, context, automation);
    }
  }

  _getWhatsAppService(workspace) {
    if (!workspace.whatsapp?.isConnected || !workspace.whatsapp?.accessToken) {
      throw new Error('WhatsApp not connected');
    }
    return new WhatsAppService(
      workspace.whatsapp.accessToken,
      workspace.whatsapp.phoneNumberId
    );
  }

  _replacePlaceholders(text, context) {
    if (!text) return text;
    return text
      .replace(/\{\{contact\.name\}\}/g, context.contact?.name || '')
      .replace(/\{\{contact\.phone\}\}/g, context.contact?.phone || '')
      .replace(/\{\{contact\.email\}\}/g, context.contact?.email || '')
      .replace(/\{\{message\}\}/g, context.message?.text?.body || context.message?.text || '')
      .replace(/\{\{(\w+)\}\}/g, (_, key) => context.variables[key] || '');
  }

  async _sendTextMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const text = this._replacePlaceholders(data.text || data.message, context);
    const result = await wa.sendTextMessage(context.contact.phone, text);
    await this._saveOutboundMessage(context, 'text', text, result);
  }

  async _sendMediaMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const caption = this._replacePlaceholders(data.caption, context);
    const result = await wa.sendMediaMessage(
      context.contact.phone,
      data.mediaType || 'image',
      data.url || data.mediaUrl,
      caption
    );
    await this._saveOutboundMessage(context, data.mediaType || 'image', caption, result);
  }

  async _sendTemplateMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const components = (data.components || []).map(comp => {
      if (comp.parameters) {
        comp.parameters = comp.parameters.map(p => {
          if (p.type === 'text') {
            p.text = this._replacePlaceholders(p.text, context);
          }
          return p;
        });
      }
      return comp;
    });
    const result = await wa.sendTemplateMessage(
      context.contact.phone,
      data.templateName || data.name,
      data.language || 'en',
      components
    );
    await this._saveOutboundMessage(context, 'template', data.templateName, result);
  }

  async _sendButtonMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const interactive = {
      type: 'button',
      body: { text: this._replacePlaceholders(data.body || data.text, context) },
      action: {
        buttons: (data.buttons || []).map((btn, i) => ({
          type: 'reply',
          reply: { id: btn.id || `btn_${i}`, title: btn.title || btn.text },
        })),
      },
    };
    if (data.header) interactive.header = { type: 'text', text: data.header };
    if (data.footer) interactive.footer = { text: data.footer };
    const result = await wa.sendInteractiveMessage(context.contact.phone, interactive);
    await this._saveOutboundMessage(context, 'interactive', interactive.body.text, result, {
      type: 'button',
      body: interactive.body.text,
      buttons: (interactive.action.buttons || []).map((b) => ({ id: b.reply.id, title: b.reply.title })),
    });
  }

  async _sendListMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const interactive = {
      type: 'list',
      body: { text: this._replacePlaceholders(data.body || data.text, context) },
      action: {
        button: data.buttonText || 'Select',
        sections: data.sections || [],
      },
    };
    if (data.header) interactive.header = { type: 'text', text: data.header };
    if (data.footer) interactive.footer = { text: data.footer };
    const result = await wa.sendInteractiveMessage(context.contact.phone, interactive);
    await this._saveOutboundMessage(context, 'interactive', interactive.body.text, result, {
      type: 'list',
      body: interactive.body.text,
      sections: interactive.action.sections || [],
    });
  }

  async _sendLocationMessage(data, context) {
    const wa = this._getWhatsAppService(context.workspace);
    const result = await wa.sendLocationMessage(
      context.contact.phone,
      data.latitude, data.longitude,
      data.name || '', data.address || ''
    );
    await this._saveOutboundMessage(context, 'location', `${data.name || 'Location'}`, result);
  }

  async _handleDelay(data) {
    const value = parseInt(data.value || data.delay || 1);
    const unit = data.unit || data.delayType || 'seconds';
    let ms = value * 1000;
    if (unit === 'minutes') ms = value * 60 * 1000;
    else if (unit === 'hours') ms = value * 60 * 60 * 1000;
    // Cap at 5 minutes for in-process delays
    ms = Math.min(ms, 5 * 60 * 1000);
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  _evaluateCondition(data, context) {
    const field = data.field || data.variable || '';
    const operator = data.operator || 'equals';
    const compareValue = data.value || '';

    let actual = '';
    if (field.startsWith('contact.')) {
      actual = String(context.contact?.[field.replace('contact.', '')] || '');
    } else if (field.startsWith('message.')) {
      actual = String(context.message?.text?.body || context.message?.text || '');
    } else {
      actual = String(context.variables[field] || '');
    }

    const compare = String(compareValue);
    switch (operator) {
      case 'equals':
      case 'eq': return actual.toLowerCase() === compare.toLowerCase();
      case 'not_equals':
      case 'neq': return actual.toLowerCase() !== compare.toLowerCase();
      case 'contains': return actual.toLowerCase().includes(compare.toLowerCase());
      case 'not_contains': return !actual.toLowerCase().includes(compare.toLowerCase());
      case 'starts_with': return actual.toLowerCase().startsWith(compare.toLowerCase());
      case 'ends_with': return actual.toLowerCase().endsWith(compare.toLowerCase());
      case 'is_empty': return !actual || actual.trim() === '';
      case 'is_not_empty': return actual && actual.trim() !== '';
      case 'gt': return parseFloat(actual) > parseFloat(compare);
      case 'lt': return parseFloat(actual) < parseFloat(compare);
      case 'gte': return parseFloat(actual) >= parseFloat(compare);
      case 'lte': return parseFloat(actual) <= parseFloat(compare);
      default: return actual === compare;
    }
  }

  async _handleAction(data, context) {
    const action = data.action || data.type || '';
    if (action === 'set_variable') {
      context.variables[data.key] = this._replacePlaceholders(data.value, context);
    } else if (action === 'update_contact') {
      const updates = {};
      if (data.name) updates.name = this._replacePlaceholders(data.name, context);
      if (data.email) updates.email = this._replacePlaceholders(data.email, context);
      if (data.customFields) updates.customFields = data.customFields;
      await Contact.findByIdAndUpdate(context.contact._id, updates);
    } else if (action === 'close_conversation') {
      await Conversation.findOneAndUpdate(
        { workspace: context.workspace._id, contact: context.contact._id },
        { status: 'closed', isResolved: true, resolvedAt: new Date() }
      );
    }
  }

  async _handleApiCall(data, context) {
    const axios = require('axios');
    const url = this._replacePlaceholders(data.url, context);
    const method = (data.method || 'GET').toLowerCase();
    const headers = data.headers || {};
    let body = data.body || {};

    if (typeof body === 'string') {
      body = this._replacePlaceholders(body, context);
      try { body = JSON.parse(body); } catch { /* use as string */ }
    }

    const response = await axios({ method, url, headers, data: body, timeout: 10000 });
    context.variables.api_response = response.data;
    context.variables.api_status = response.status;
  }

  async _handleAiResponse(data, context) {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne();
    const aiConfig = settings?.aiSettings || {};
    const provider = data.provider || aiConfig.defaultProvider || 'openai';
    const apiKey = data.apiKey || aiConfig.providers?.[provider]?.apiKey || '';

    if (!apiKey) {
      console.error('AI API key not configured for provider:', provider);
      return;
    }

    const prompt = this._replacePlaceholders(data.prompt || data.systemPrompt || '', context);
    const userMsg = context.message?.text?.body || context.message?.text || '';

    const result = await aiService.chat(provider, apiKey, [
      { role: 'system', content: prompt },
      { role: 'user', content: userMsg },
    ], { model: data.model });

    if (result.content) {
      const wa = this._getWhatsAppService(context.workspace);
      const sendResult = await wa.sendTextMessage(context.contact.phone, result.content);
      await this._saveOutboundMessage(context, 'text', result.content, sendResult);
      context.variables.ai_response = result.content;
    }
  }

  async _handleAssignAgent(data, context) {
    const agentId = data.agentId || data.agent;
    if (!agentId) return;

    await Conversation.findOneAndUpdate(
      { workspace: context.workspace._id, contact: context.contact._id },
      { assignedAgent: agentId }
    );
  }

  async _handleAddTag(data, context) {
    const tagId = data.tagId || data.tag;
    if (!tagId) return;

    await Contact.findByIdAndUpdate(context.contact._id, {
      $addToSet: { tags: tagId },
    });
  }

  async _handleAddSegment(data, context) {
    const segmentId = data.segmentId || data.segment;
    if (!segmentId) return;

    await Contact.findByIdAndUpdate(context.contact._id, {
      $addToSet: { segments: segmentId },
    });
  }

  async _saveOutboundMessage(context, type, text, result, interactive) {
    const conversation = await Conversation.findOneAndUpdate(
      { workspace: context.workspace._id, contact: context.contact._id },
      {
        workspace: context.workspace._id,
        contact: context.contact._id,
        status: 'active',
        lastMessage: {
          text: text || `[${type}]`,
          timestamp: new Date(),
          direction: 'outbound',
          type,
        },
      },
      { upsert: true, new: true }
    );

    const message = await Message.create({
      workspace: context.workspace._id,
      conversation: conversation._id,
      contact: context.contact._id,
      direction: 'outbound',
      type,
      text: text || '',
      ...(interactive ? { interactive } : {}),
      waMessageId: result?.data?.messages?.[0]?.id || '',
      status: result?.success ? 'sent' : 'failed',
      errorMessage: result?.error?.message || '',
    });

    if (this.io) {
      this.io.to(`workspace:${context.workspace._id}`).emit('new_message', {
        message,
        conversationId: conversation._id,
      });
    }
  }
}

module.exports = AutomationEngine;
