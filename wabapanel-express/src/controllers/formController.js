const Form = require('../models/Form');
const Contact = require('../models/Contact');

const getForms = async (req, res) => {
  try {
    const forms = await Form.find({ workspace: req.workspace._id }).sort('-createdAt');
    res.json({ success: true, data: forms });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createForm = async (req, res) => {
  try {
    const form = await Form.create({ ...req.body, workspace: req.workspace._id });
    res.status(201).json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getForm = async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    res.json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateForm = async (req, res) => {
  try {
    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true }
    );
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    res.json({ success: true, data: form });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteForm = async (req, res) => {
  try {
    await Form.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true, message: 'Form deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicForm = async (req, res) => {  try {    const form = await Form.findById(req.params.id).select("name description fields status workspace");    if (!form || form.status !== "active") {      return res.status(404).json({ success: false, message: "Form not found or inactive" });    }    const SystemSettings = require("../models/SystemSettings");    const settings = await SystemSettings.findOne().select("appName").lean();    const brandName = settings?.appName || "";    res.json({ success: true, data: { _id: form._id, name: form.name, description: form.description, fields: form.fields, brandName } });  } catch (error) {    res.status(500).json({ success: false, message: error.message });  }};
const submitForm = async (req, res) => {
  try {
    const form = await Form.findById(req.params.id);
    if (!form || form.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Form not found or inactive' });
    }

    form.submissions.push({ data: req.body, submittedAt: new Date() });
    form.submissionCount++;
    await form.save();

    // Auto-create contact if enabled
    if (form.autoCreateContact && req.body.phone) {
      await Contact.findOneAndUpdate(
        { workspace: form.workspace, phone: req.body.phone },
        {
          workspace: form.workspace,
          name: req.body.name || '',
          phone: req.body.phone,
          email: req.body.email || '',
          source: 'form',
        },
        { upsert: true }
      );
    }

    res.status(201).json({ success: true, message: 'Form submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const GRAPH = 'https://graph.facebook.com/v21.0';

const sanitizeName = (label, idx) => {
  const base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 25);
  return 'f' + idx + (base ? '_' + base : '');
};

const buildFlowJson = (form) => {
  const fields = [...(form.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const children = [];
  const payload = {};
  fields.forEach((fld, idx) => {
    const name = sanitizeName(fld.label, idx);
    payload[name] = '${form.' + name + '}';
    const common = { name, label: String(fld.label || 'Field').slice(0, 40), required: !!fld.required };
    const items = (fld.options || []).map((o, i) => ({ id: 'opt' + i, title: String(o).slice(0, 30) }));
    switch (fld.type) {
      case 'textarea':
        children.push({ type: 'TextArea', ...common }); break;
      case 'date':
        children.push({ type: 'DatePicker', ...common }); break;
      case 'select':
        if (items.length) children.push({ type: 'Dropdown', ...common, 'data-source': items });
        else children.push({ type: 'TextInput', ...common, 'input-type': 'text' });
        break;
      case 'radio':
        if (items.length) children.push({ type: 'RadioButtonsGroup', ...common, 'data-source': items });
        else children.push({ type: 'TextInput', ...common, 'input-type': 'text' });
        break;
      case 'multi_select':
        if (items.length) children.push({ type: 'CheckboxGroup', ...common, 'data-source': items });
        else children.push({ type: 'TextInput', ...common, 'input-type': 'text' });
        break;
      case 'checkbox':
        children.push({ type: 'OptIn', name, label: common.label, required: !!fld.required }); break;
      case 'email':
        children.push({ type: 'TextInput', ...common, 'input-type': 'email' }); break;
      case 'number':
        children.push({ type: 'TextInput', ...common, 'input-type': 'number' }); break;
      case 'phone':
        children.push({ type: 'TextInput', ...common, 'input-type': 'phone' }); break;
      default:
        children.push({ type: 'TextInput', ...common, 'input-type': 'text' });
    }
  });
  children.push({
    type: 'Footer',
    label: 'Submit',
    'on-click-action': { name: 'complete', payload },
  });
  return {
    version: '7.0',
    screens: [{
      id: 'FORM_SCREEN',
      title: String(form.name || 'Form').slice(0, 30),
      terminal: true,
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [{ type: 'Form', name: 'form', children }],
      },
    }],
  };
};

const publishFlow = async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    const wa = req.workspace.whatsapp || {};
    if (!wa.isConnected || !wa.accessToken || !wa.wabaId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected or WABA ID missing (Settings → WhatsApp API)' });
    }
    if (!form.fields?.length) return res.status(400).json({ success: false, message: 'Add at least one field to the form first' });

    const headers = { Authorization: 'Bearer ' + wa.accessToken };

    const metaErr = (body, fallback) => {
      const e = body?.error;
      if (!e) return fallback;
      return e.error_user_msg || e.error_user_title || e.message || fallback;
    };

    let flowId = form.waFlow?.flowId;
    if (!flowId) {
      const cr = await fetch(`${GRAPH}/${wa.wabaId}/flows`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.slice(0, 60) + ' ' + Date.now().toString().slice(-5), categories: ['LEAD_GENERATION'] }),
      });
      const crBody = await cr.json();
      if (!cr.ok || !crBody.id) throw new Error(metaErr(crBody, 'Flow create failed'));
      flowId = crBody.id;
    }

    const flowJson = JSON.stringify(buildFlowJson(form));
    const fd = new FormData();
    fd.set('file', new Blob([flowJson], { type: 'application/json' }), 'flow.json');
    fd.set('name', 'flow.json');
    fd.set('asset_type', 'FLOW_JSON');
    const ar = await fetch(`${GRAPH}/${flowId}/assets`, { method: 'POST', headers, body: fd });
    const arBody = await ar.json();
    if (!ar.ok) throw new Error(metaErr(arBody, 'Flow JSON upload failed'));
    const vErrs = (arBody.validation_errors || []).filter(e => e.error);
    if (vErrs.length) throw new Error('Flow validation: ' + vErrs.map(e => e.message).join('; ').slice(0, 300));

    const pr = await fetch(`${GRAPH}/${flowId}/publish`, { method: 'POST', headers });
    const prBody = await pr.json();
    if (!pr.ok || prBody.success === false) throw new Error(metaErr(prBody, 'Flow publish failed'));

    form.waFlow = { flowId, status: 'published', error: '' };
    await form.save();
    res.json({ success: true, data: form });
  } catch (error) {
    try {
      const form = await Form.findOne({ _id: req.params.id, workspace: req.workspace._id });
      if (form) { form.waFlow = { ...(form.waFlow?.toObject?.() || {}), status: 'failed', error: error.message }; await form.save(); }
    } catch { /* ignore */ }
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendFlow = async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspace._id });
    if (!form) return res.status(404).json({ success: false, message: 'Form not found' });
    if (form.waFlow?.status !== 'published' || !form.waFlow?.flowId) {
      return res.status(400).json({ success: false, message: 'Publish this form as a WhatsApp Flow first' });
    }
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');
    const WhatsAppService = require('../services/whatsappService');
    const conversation = await Conversation.findOne({ _id: req.body.conversationId, workspace: req.workspace._id }).populate('contact');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.windowExpiresAt || conversation.windowExpiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: '24-hr window is closed — flows can only be sent inside the free window' });
    }
    const wa = req.workspace.whatsapp;
    const waService = new WhatsAppService(wa.accessToken, conversation.waNumberId || wa.phoneNumberId);
    const interactive = {
      type: 'flow',
      body: { text: form.description || `Please fill this form: ${form.name}` },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: form.waFlow.flowId,
          flow_cta: 'Fill Form',
          flow_token: `${form._id}:${conversation._id}`,
          flow_action: 'navigate',
          flow_action_payload: { screen: 'FORM_SCREEN' },
        },
      },
    };
    const result = await waService.sendInteractiveMessage(conversation.contact.phone, interactive);
    const message = await Message.create({
      workspace: req.workspace._id, conversation: conversation._id, contact: conversation.contact._id,
      direction: 'outbound', type: 'text',
      text: `📋 Form: ${form.name}${form.description ? '\n' + form.description : ''}\n(Native WhatsApp form — opens inside WhatsApp)`,
      sentBy: req.user._id,
      status: result.success ? 'sent' : 'failed',
      waMessageId: result.success ? (result.data?.messages?.[0]?.id || '') : '',
      errorMessage: result.success ? '' : (result.error?.message || 'Send failed'),
    });
    if (!result.success) return res.status(400).json({ success: false, message: result.error?.message || 'Send failed' });
    conversation.lastMessage = { text: `📋 Form: ${form.name}`, timestamp: new Date(), direction: 'outbound', type: 'text' };
    await conversation.save();
    const io = req.app.get('io');
    if (io) io.to(`workspace:${req.workspace._id}`).emit('new_message', { message, conversationId: conversation._id });
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getForms, createForm, getForm, getPublicForm, updateForm, deleteForm, submitForm, publishFlow, sendFlow };
