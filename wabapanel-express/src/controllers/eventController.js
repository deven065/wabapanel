const Event = require('../models/Event');

// Public webhook endpoint: POST /api/events/hook/:id  body: { phone?: string }
const hookTrigger = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, status: 'active', type: 'webhook' });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found or inactive' });
    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const actionRunner = require('../services/actionRunner');
    let contact = null;
    let conversation = null;
    const phone = req.body?.phone || req.query?.phone;
    if (phone) {
      const digits = String(phone).replace(/[^0-9]/g, '');
      contact = await Contact.findOne({ workspace: event.workspace, phone: { $regex: digits.slice(-10) + '$' } });
      if (contact) conversation = await Conversation.findOne({ workspace: event.workspace, contact: contact._id, channel: 'whatsapp' });
    }
    const needsContact = (event.actions || []).some((a) => ['send_message', 'send_template', 'add_tag', 'remove_tag', 'assign_agent'].includes(a.type));
    if (needsContact && !contact) return res.status(400).json({ success: false, message: 'Send a "phone" field in the request body matching an existing contact' });
    await actionRunner.runEventById(event, { contact, conversation, io: req.app.get('io') });
    res.json({ success: true, message: `Event "${event.name}" executed` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEvents = async (req, res) => {
  try {
    const events = await Event.find({ workspace: req.workspace._id })
      .populate('createdBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEvent = async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('createdBy', 'name email');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const event = await Event.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getEvents, getEvent, createEvent, updateEvent, deleteEvent, hookTrigger };
