const Campaign = require('../models/Campaign');
const Workspace = require('../models/Workspace');

class CampaignScheduler {
  constructor(io) { this.io = io; }

  start() {
    setInterval(() => this.tick().catch(e => console.error('[CampaignScheduler]', e.message)), 60 * 1000);
    console.log('Campaign scheduler started');
  }

  async tick() {
    const due = await Campaign.find({
      status: 'scheduled',
      type: { $ne: 'drip' },
      scheduledAt: { $lte: new Date() },
    }).populate('template').populate('presetMessage');
    for (const campaign of due) {
      try {
        const workspace = await Workspace.findById(campaign.workspace);
        if (!workspace) continue;
        if (campaign.sendChannel !== 'whatsapp_qr' && !workspace.whatsapp?.isConnected) continue;
        const { runCampaignCore } = require('../controllers/campaignController');
        console.log('[CampaignScheduler] running scheduled campaign', String(campaign._id), campaign.name);
        await runCampaignCore(campaign, workspace, this.io);
      } catch (e) {
        console.error('[CampaignScheduler] run failed', String(campaign._id), e.message);
      }
    }
  }
}

module.exports = CampaignScheduler;
