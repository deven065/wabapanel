const Contact = require('../models/Contact');
const AutomationSettings = require('../models/AutomationSettings');

// Built-in opt-out / opt-in keywords (used when a workspace has not customised them).
const DEFAULT_STOP = [
  'stop', 'unsubscribe', 'unsub', 'stop promotions', 'stop promo', 'cancel',
  'opt out', 'optout', 'remove me', 'no more', 'do not message',
  'band karo', 'band kro', 'mat bhejo', 'हटाओ', 'बंद', 'बंद करो', 'रोको', 'मना',
];
const DEFAULT_START = [
  'start', 'subscribe', 'resubscribe', 'resume', 'unstop', 'opt in', 'optin',
  'चालू', 'शुरू', 'चालू करो', 'फिर से',
];
const DEFAULT_STOP_REPLY =
  "You've been unsubscribed and will no longer receive promotional messages. Reply START anytime to resubscribe.";
const DEFAULT_START_REPLY =
  "You've been resubscribed. You'll now receive our updates. Reply STOP anytime to unsubscribe.";
// Appended to free-text (non-template) broadcast bodies so recipients can opt
// out by replying instead of blocking the number.
const DEFAULT_BROADCAST_FOOTER = 'Reply STOP to unsubscribe';

function normalize(t) {
  return String(t || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ') // keep letters, digits and combining marks (Indic matras)
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(text, words) {
  const n = normalize(text);
  if (!n) return false;
  const first = n.split(' ')[0];
  return words.some((w) => {
    const nw = normalize(w);
    return nw && (n === nw || first === nw);
  });
}

// Inspect an inbound text message. If it is an opt-out / opt-in keyword, update the
// contact's subscription status and (optionally) send a one-time confirmation reply.
// Returns { changed, type } where type is 'out' | 'in' | null.
async function handleInbound({ workspace, contact, text, wa }) {
  try {
    if (!workspace || !contact) return { changed: false, type: null };
    const settings = await AutomationSettings.findOne({ workspace: workspace._id }).lean();
    const cfg = (settings && settings.optOut) || {};
    if (cfg.enabled === false) return { changed: false, type: null };

    const stopWords = cfg.stopKeywords && cfg.stopKeywords.length ? cfg.stopKeywords : DEFAULT_STOP;
    const startWords = cfg.startKeywords && cfg.startKeywords.length ? cfg.startKeywords : DEFAULT_START;
    const sendConfirmation = cfg.sendConfirmation !== false;

    if (matches(text, stopWords)) {
      if (contact.status !== 'opted_out') {
        await Contact.updateOne({ _id: contact._id }, { status: 'opted_out', optInStatus: false });
        contact.status = 'opted_out';
        contact.optInStatus = false;
        if (sendConfirmation && wa) {
          try { await wa.sendTextMessage(contact.phone, cfg.stopReply || DEFAULT_STOP_REPLY); } catch (e) { /* noop */ }
        }
      }
      return { changed: true, type: 'out' };
    }

    if (matches(text, startWords)) {
      if (contact.status === 'opted_out') {
        await Contact.updateOne({ _id: contact._id }, { status: 'active', optInStatus: true });
        contact.status = 'active';
        contact.optInStatus = true;
        if (sendConfirmation && wa) {
          try { await wa.sendTextMessage(contact.phone, cfg.startReply || DEFAULT_START_REPLY); } catch (e) { /* noop */ }
        }
      }
      return { changed: true, type: 'in' };
    }

    return { changed: false, type: null };
  } catch (e) {
    console.error('[optOut] handleInbound error:', e.message);
    return { changed: false, type: null };
  }
}

module.exports = { handleInbound, DEFAULT_STOP, DEFAULT_START, DEFAULT_STOP_REPLY, DEFAULT_START_REPLY, DEFAULT_BROADCAST_FOOTER };
