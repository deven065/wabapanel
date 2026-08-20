// Ready-made Bot Flow presets. Each preset is a plain flow definition that the
// controller stamps with the workspace id. Messages are customer-ready English
// and fully editable after import. Uses only existing node types plus the
// durable delay / question-timeout / eventTrigger support.

const X = 40;
const STEP = 260;
const ROW = 170;
const at = (col, row) => ({ x: X + col * STEP, y: 60 + row * ROW });

// Lead Nurturing: greet a new lead, ask, and bump on days 1/2/3 if no reply.
const leadNurturing = {
  name: 'Lead Nurturing',
  eventTrigger: 'new_lead',
  triggerKeywords: ['new lead', 'lead'],
  matchType: 'contains',
  startNode: 'n1',
  nodes: [
    { id: 'n1', name: 'Welcome', type: 'text', text: 'Hi {first_name}! 👋 Thanks for reaching out. I can help you right here — what are you looking for?', next: 'n2', ...at(0, 0) },
    { id: 'n2', name: 'Ask (wait 24h)', type: 'question', text: 'Just reply here and our team will assist you right away. 😊', answerVar: 'interest', waitTimeoutHours: 24, nextTimeout: 'b1', next: 'r1', ...at(1, 0) },
    { id: 'r1', name: 'Tag Engaged', type: 'action', actionType: 'add_tag', actionTag: 'Engaged', next: 'r2', ...at(2, 0) },
    { id: 'r2', name: 'Thanks', type: 'text', text: 'Great, {first_name}! 🙌 Our team will take this forward. Meanwhile, feel free to ask anything.', next: '', ...at(3, 0) },

    { id: 'b1', name: 'Bump Day 1', type: 'text', text: 'Hi {first_name}, just following up 🙂 — did you get a chance to look into this? Reply and I\'ll help.', next: 'b1d', ...at(1, 1) },
    { id: 'b1d', name: 'Wait 1 day', type: 'delay', delayUnit: 'days', delaySeconds: 1, next: 'n3', ...at(2, 1) },
    { id: 'n3', name: 'Ask again (wait 24h)', type: 'question', text: 'Still here to help, {first_name}! Any questions I can answer?', answerVar: 'interest', waitTimeoutHours: 24, nextTimeout: 'b2', next: 'r1', ...at(3, 1) },

    { id: 'b2', name: 'Bump Day 2', type: 'text', text: 'Quick reminder {first_name} — we\'d love to help you get started. Reply "YES" and we\'ll take it forward.', next: 'b2d', ...at(1, 2) },
    { id: 'b2d', name: 'Wait 2 days', type: 'delay', delayUnit: 'days', delaySeconds: 2, next: 'n4', ...at(2, 2) },
    { id: 'n4', name: 'Final ask (wait 48h)', type: 'question', text: 'Last check-in {first_name} — would you like someone to call you?', answerVar: 'interest', waitTimeoutHours: 48, nextTimeout: 'c1', next: 'r1', ...at(3, 2) },

    { id: 'c1', name: 'Tag Cold', type: 'action', actionType: 'add_tag', actionTag: 'Cold Lead', next: 'c2', ...at(1, 3) },
    { id: 'c2', name: 'Close (revive later)', type: 'text', text: 'No problem, {first_name}! 🙏 Whenever you\'re ready, just message us here and we\'ll pick right up.', next: '', ...at(2, 3) },
  ],
};

// DNP Recovery: fired when a call is logged as Did-Not-Pick / no answer.
const dnpRecovery = {
  name: 'DNP Recovery',
  eventTrigger: 'dnp',
  triggerKeywords: [],
  matchType: 'contains',
  startNode: 'd1',
  nodes: [
    { id: 'd1', name: 'Missed call', type: 'text', text: 'Hi {first_name}, we tried calling but couldn\'t reach you 📞. When\'s a good time to connect?', next: 'd2', ...at(0, 0) },
    { id: 'd2', name: 'Ask time (wait 24h)', type: 'question', text: 'Just reply with a convenient time and we\'ll call you back. 🙂', answerVar: 'callback_time', waitTimeoutHours: 24, nextTimeout: 'd3', next: 'dr1', ...at(1, 0) },
    { id: 'dr1', name: 'Tag Callback', type: 'action', actionType: 'add_tag', actionTag: 'Callback Requested', next: 'dr2', ...at(2, 0) },
    { id: 'dr2', name: 'Confirm', type: 'text', text: 'Perfect, {first_name}! ✅ We\'ll call you then. Thank you!', next: '', ...at(3, 0) },

    { id: 'd3', name: 'Follow-up Day 1', type: 'text', text: 'Hi {first_name}, following up on our missed call — reply here and we\'ll assist you directly. 😊', next: 'd4', ...at(1, 1) },
    { id: 'd4', name: 'Wait 2 days', type: 'delay', delayUnit: 'days', delaySeconds: 2, next: 'd5', ...at(2, 1) },
    { id: 'd5', name: 'Final attempt', type: 'text', text: 'Last attempt {first_name} 🙏 — we\'re keen to help. Reply anytime and we\'ll pick up right away.', next: 'd6', ...at(3, 1) },
    { id: 'd6', name: 'Tag DNP Lost', type: 'action', actionType: 'add_tag', actionTag: 'DNP - Lost', next: '', ...at(4, 1) },
  ],
};

const PRESETS = { lead_nurturing: leadNurturing, dnp_recovery: dnpRecovery };

module.exports = { PRESETS };
