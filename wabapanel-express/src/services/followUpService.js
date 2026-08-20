// Follow-up engine:
// 1. Contact-note reminders (remindAt) — sends the reminder to the customer on
//    WhatsApp at the scheduled time and alerts the owner.
// 2. No-reply follow-ups — when we replied (agent/AI) and the customer has been
//    silent for N hours, labels the conversation "follow-up" and alerts the owner.
const cron = require('node-cron');

async function runNoteReminders() {
  const ContactNote = require('../models/ContactNote');
  const Workspace = require('../models/Workspace');
  const WhatsAppService = require('./whatsappService');
  const ownerNotify = require('./ownerNotify');

  const due = await ContactNote.find({
    remindAt: { $lte: new Date() },
    reminderSent: { $ne: true },
    contacted: { $ne: true },
  }).populate('contact', 'name phone status').limit(100);

  for (const note of due) {
    try {
      note.reminderSent = true;
      await note.save();
      const c = note.contact;
      const workspace = await Workspace.findById(note.workspace);
      if (c && c.phone && c.status !== 'blocked' && workspace?.whatsapp?.isConnected && note.notifyCustomer !== false) {
        const wa = new WhatsAppService(workspace.whatsapp.accessToken, workspace.whatsapp.phoneNumberId);
        const first = (c.name || '').split(' ')[0] || 'there';
        try {
          await wa.sendTextMessage(c.phone, `Hi ${first}! ⏰ Reminder: ${note.text}`);
        } catch (e) { /* outside 24h window — owner alert below still goes out */ }
      }
      const label = c ? `${c.name || 'Customer'} (${c.phone || ''})` : 'Customer';
      await ownerNotify.notifyOwner(note.workspace, `⏰ *Follow-up reminder due*\n\n👤 ${label}\n📝 ${note.text}`, 'onReminder');
    } catch (e) { console.error('[FollowUp] note reminder error:', e.message); }
  }
}

async function runNoReplyFollowUps() {
  const AutomationSettings = require('../models/AutomationSettings');
  const Conversation = require('../models/Conversation');
  const Contact = require('../models/Contact');
  const Tag = require('../models/Tag');
  const ownerNotify = require('./ownerNotify');

  const allSettings = await AutomationSettings.find({ 'ownerAlerts.enabled': true }).lean();
  for (const st of allSettings) {
    try {
      // Find-or-create a real "follow-up" Tag so the label shows up (and is
      // filterable) in the Inbox label dropdown, which lists Contact tags.
      let followUpTagId = null;
      try {
        const t = await Tag.findOneAndUpdate(
          { workspace: st.workspace, name: 'follow-up' },
          { $setOnInsert: { workspace: st.workspace, name: 'follow-up', color: '#f59e0b' } },
          { upsert: true, new: true }
        );
        followUpTagId = t && t._id;
      } catch (e) { /* ignore */ }

      const hours = Number(st.ownerAlerts.noReplyHours) || 24;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const convs = await Conversation.find({
        workspace: st.workspace,
        status: 'active',
        'lastMessage.direction': 'outbound',
        'lastMessage.timestamp': { $lt: cutoff },
        labels: { $ne: 'follow-up' },
      }).populate('contact', 'name profileName phone leadScore').limit(20);
      for (const conv of convs) {
        conv.labels = [...(conv.labels || []), 'follow-up'];
        await conv.save();
        const c = conv.contact;
        if (followUpTagId && c && c._id) {
          try { await Contact.updateOne({ _id: c._id }, { $addToSet: { tags: followUpTagId } }); } catch (e) { /* ignore */ }
        }
        const label = c ? `${c.name || c.profileName || 'Customer'} (${c.phone || ''})` : 'Customer';
        const score = c?.leadScore ? ` • Lead: ${c.leadScore}` : '';
        await ownerNotify.notifyOwner(st.workspace, `🔔 *No reply from customer (${hours}h+)*\n\n👤 ${label}${score}\n💬 Last sent: "${(conv.lastMessage?.text || '').slice(0, 120)}"\n\nChat labelled *follow-up* — check Inbox → filter by label.`, 'onNoReply');
      }

      // Backfill: chats already labelled "follow-up" before this fix have no
      // Contact tag, so they never showed in the filter. Tag their contacts too.
      if (followUpTagId) {
        const already = await Conversation.find({
          workspace: st.workspace,
          labels: 'follow-up',
        }).populate('contact', '_id tags').limit(50);
        for (const conv of already) {
          const c = conv.contact;
          if (c && c._id && !(c.tags || []).some((id) => String(id) === String(followUpTagId))) {
            try { await Contact.updateOne({ _id: c._id }, { $addToSet: { tags: followUpTagId } }); } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) { console.error('[FollowUp] no-reply error:', e.message); }
  }
}

function start() {
  cron.schedule('*/5 * * * *', () => runNoteReminders().catch((e) => console.error('[FollowUp]', e.message)), { timezone: 'Asia/Kolkata' });
  cron.schedule('15 * * * *', () => runNoReplyFollowUps().catch((e) => console.error('[FollowUp]', e.message)), { timezone: 'Asia/Kolkata' });
}

module.exports = { start };
