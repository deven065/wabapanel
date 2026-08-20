const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// Polls IMAP inboxes of workspaces with the email channel enabled and
// turns new emails into inbox conversations (channel: 'email').
async function pollWorkspace(workspace, io) {
  const ec = workspace.emailChannel;
  if (!ec?.enabled || !ec.imapHost || !ec.user || !ec.pass) return;

  const client = new ImapFlow({
    host: ec.imapHost, port: ec.imapPort || 993, secure: true,
    auth: { user: ec.user, pass: ec.pass },
    logger: false,
    connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 60000,
  });
  // ImapFlow is an EventEmitter; without an 'error' listener an async socket
  // timeout becomes an uncaughtException and crashes the whole process.
  client.on('error', (err) => console.error('[EmailInbox] client error', String(workspace._id), err.message));

  const since = ec.lastPolledAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
  await client.connect();
  try {
    await client.mailboxOpen('INBOX');
    const uids = await client.search({ since });
    const Contact = require('../models/Contact');
    const Conversation = require('../models/Conversation');
    const Message = require('../models/Message');

    for (const uid of uids || []) {
      const msg = await client.fetchOne(uid, { source: true, internalDate: true });
      if (!msg?.source) continue;
      if (msg.internalDate && new Date(msg.internalDate) <= since) continue;
      const parsed = await simpleParser(msg.source);
      const fromAddr = parsed.from?.value?.[0]?.address;
      if (!fromAddr || fromAddr.toLowerCase() === ec.user.toLowerCase()) continue;
      const fromName = parsed.from?.value?.[0]?.name || fromAddr;

      const contact = await Contact.findOneAndUpdate(
        { workspace: workspace._id, email: fromAddr },
        { workspace: workspace._id, email: fromAddr, name: fromName, phone: fromAddr, source: 'email', channel: 'email', lastMessageAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const bodyText = (parsed.text || '').trim().slice(0, 5000) || '[no text content]';
      const conversation = await Conversation.findOneAndUpdate(
        { workspace: workspace._id, contact: contact._id, channel: 'email' },
        {
          workspace: workspace._id, contact: contact._id, channel: 'email',
          lastMessage: bodyText.slice(0, 200), lastMessageAt: new Date(), status: 'active',
          lastSubject: parsed.subject || '',
          $inc: { unreadCount: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const dbMsg = await Message.create({
        workspace: workspace._id, conversation: conversation._id, contact: contact._id,
        direction: 'inbound', type: 'text',
        text: (parsed.subject ? `Subject: ${parsed.subject}\n\n` : '') + bodyText,
        status: 'delivered', metadata: { source: 'email', messageId: parsed.messageId || '', html: parsed.html ? String(parsed.html).slice(0, 300000) : '' },
      });

      if (io) {
        const populated = await Conversation.findById(conversation._id)
          .populate({ path: 'contact', select: 'name phone email avatar profileName' });
        io.to(`workspace:${workspace._id}`).emit('new_message', { message: dbMsg, conversationId: conversation._id });
        io.to(`workspace:${workspace._id}`).emit('conversation_updated', populated || conversation);
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  const Workspace = require('../models/Workspace');
  await Workspace.updateOne({ _id: workspace._id }, { 'emailChannel.lastPolledAt': new Date() });
}

function start(io) {
  const cron = require('node-cron');
  // Every 2 minutes, poll all workspaces with the email channel enabled
  cron.schedule('*/2 * * * *', async () => {
    try {
      const Workspace = require('../models/Workspace');
      const workspaces = await Workspace.find({ 'emailChannel.enabled': true }).select('emailChannel');
      for (const ws of workspaces) {
        await pollWorkspace(ws, io).catch(e => console.error('[EmailInbox]', String(ws._id), e.message));
      }
    } catch (e) {
      console.error('[EmailInbox] poll cycle error:', e.message);
    }
  });
  console.log('[EmailInbox] Poller started (every 2 min)');
}

module.exports = { start, pollWorkspace };
