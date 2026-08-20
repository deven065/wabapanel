// Turns an AI reply's hidden [[REMIND: YYYY-MM-DD HH:MM]] marker (IST) into a
// call-back reminder in the Lead Report — mirrors the manual "Log a call → Callback"
// (sets contact.callStatus = 'callback' + a ContactNote with remindAt).
const CALLBACK_RE = /\[\[REMIND:\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\]\]/i;

function stripMarker(text) {
  return String(text || '').replace(CALLBACK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

function parseIst(dateStr, timeStr) {
  const d = new Date(`${dateStr}T${timeStr}:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}

// Best-effort: never throws into the AI reply path.
async function extractAndSchedule(workspace, contact, content) {
  const m = String(content || '').match(CALLBACK_RE);
  if (!m || !workspace || !contact) return null;
  const when = parseIst(m[1], m[2]);
  if (!when || when.getTime() < Date.now() - 60 * 1000) return null;
  const ContactNote = require('../models/ContactNote');
  const Contact = require('../models/Contact');
  const existing = await ContactNote.findOne({ workspace: workspace._id, contact: contact._id, contacted: { $ne: true }, text: { $regex: '^Callback requested by customer' } }).sort('-createdAt');
  if (existing) {
    existing.remindAt = when;
    existing.reminderSent = false;
    await existing.save();
  } else {
    await ContactNote.create({
      workspace: workspace._id,
      contact: contact._id,
      text: 'Callback requested by customer (auto)',
      remindAt: when,
      contacted: false,
      notifyCustomer: false,
    });
  }
  try {
    await Contact.findByIdAndUpdate(contact._id, { callStatus: 'callback' });
  } catch (e) {
    /* noop */
  }
  return when;
}

module.exports = { CALLBACK_RE, stripMarker, extractAndSchedule };
