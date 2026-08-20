const m = require('mongoose');
(async () => {
  await m.connect('mongodb://localhost:27017/wabapanel');
  const Conversation = require('./src/models/Conversation');
  const Message = require('./src/models/Message');
  const coll = Conversation.collection;

  // 1) Swap unique index: per-contact -> per-contact-per-channel
  const idx = await coll.indexes();
  const old = idx.find(i => i.name === 'workspace_1_contact_1');
  if (old) { await coll.dropIndex('workspace_1_contact_1'); console.log('dropped workspace_1_contact_1'); }
  await coll.createIndex({ workspace: 1, contact: 1, channel: 1 }, { unique: true });
  console.log('created workspace_1_contact_1_channel_1');

  // 2) Split QR messages that were merged into a non-QR conversation
  const qrMsgs = await Message.find({ 'metadata.source': 'whatsapp_qr' }).lean();
  const byConv = {};
  for (const msg of qrMsgs) byConv[String(msg.conversation)] = msg;
  let moved = 0;
  for (const convId of Object.keys(byConv)) {
    const conv = await Conversation.findById(convId);
    if (!conv || conv.channel === 'whatsapp_qr') continue;
    // find or create a whatsapp_qr conversation for this contact
    let qrConv = await Conversation.findOne({ workspace: conv.workspace, contact: conv.contact, channel: 'whatsapp_qr' });
    if (!qrConv) {
      qrConv = await Conversation.create({ workspace: conv.workspace, contact: conv.contact, channel: 'whatsapp_qr', status: 'active', lastMessageAt: new Date() });
    }
    const res = await Message.updateMany(
      { conversation: conv._id, 'metadata.source': 'whatsapp_qr' },
      { $set: { conversation: qrConv._id } }
    );
    moved += res.modifiedCount || 0;
    const last = await Message.findOne({ conversation: qrConv._id }).sort({ createdAt: -1 }).lean();
    if (last) await Conversation.updateOne({ _id: qrConv._id }, { $set: { lastMessage: (last.text || '').slice(0, 200), lastMessageAt: last.createdAt } });
    console.log(`moved ${res.modifiedCount} QR msgs from conv ${conv._id} (${conv.channel}) -> ${qrConv._id}`);
  }
  console.log('total moved', moved);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
