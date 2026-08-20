// Auto-link conversations to pipeline stages.
// Called from webhook when messages arrive/are sent.
const mongoose = require('mongoose');

async function autoLinkToPipeline(workspaceId, contactId, direction) {
  try {
    const Pipeline = mongoose.model('Pipeline');
    const pipeline = await Pipeline.findOne({ workspace: workspaceId, status: 'active' });
    if (!pipeline || !pipeline.stages?.length) return;

    const existingDeal = pipeline.deals.find(d => String(d.contact) === String(contactId));

    if (direction === 'inbound') {
      // New incoming message — if no deal exists, create one in first stage
      if (!existingDeal) {
        const Contact = mongoose.model('Contact');
        const contact = await Contact.findById(contactId).select('name phone').lean();
        const firstStage = pipeline.stages[0]?.name || 'New';
        pipeline.deals.push({
          title: (contact?.name || contact?.phone || 'Unknown') + ' - Chat',
          value: 0,
          contact: contactId,
          stage: firstStage,
          notes: 'Auto-added from incoming message',
          status: 'open',
        });
        await pipeline.save();
      }
    } else if (direction === 'outbound') {
      // Outbound reply — move deal to second stage if still in first
      if (existingDeal && pipeline.stages.length >= 2) {
        const firstStage = pipeline.stages[0]?.name;
        const secondStage = pipeline.stages[1]?.name;
        if (existingDeal.stage === firstStage) {
          existingDeal.stage = secondStage;
          await pipeline.save();
        }
      }
    }
  } catch (e) {
    // Silent — don't break message flow
    console.error('[Pipeline Auto] error:', e.message);
  }
}

module.exports = { autoLinkToPipeline };
