const cron = require('node-cron');

// Fires due AI callbacks (booked via the schedule_callback tool on AI calls).
function start() {
  cron.schedule('* * * * *', async () => {
    try {
      const ScheduledCall = require('../models/ScheduledCall');
      const due = await ScheduledCall.find({ status: 'pending', type: 'ai_callback', at: { $lte: new Date() } }).limit(5);
      for (const job of due) {
        try {
          const Workspace = require('../models/Workspace');
          const AISettings = require('../models/AISettings');
          const AICallingAgent = require('../models/AICallingAgent');
          const workspace = await Workspace.findById(job.workspace);
          const ai = await AISettings.findOne({ workspace: job.workspace });
          if (!workspace?.whatsapp?.accessToken || !ai?.apiKey) throw new Error('missing whatsapp/ai config');
          const agent = await AICallingAgent.findOne({ workspace: job.workspace, isDefault: true, status: 'active' })
            || await AICallingAgent.findOne({ workspace: job.workspace, status: 'active' });
          const aiCallBridge = require('./aiCallBridge');
          const callConfig = require('./callConfig');
          const azure = callConfig.azureRealtime(ai, agent);
          await aiCallBridge.startOutbound({
            apiKey: azure ? azure.apiKey : ai.apiKey,
            azure,
            to: job.phone,
            instructions: (agent?.systemPrompt || ai?.systemPrompt || 'You are a helpful phone assistant. Keep replies short and natural.')
              + (job.reason ? '\n\nThis is a scheduled callback. Reason: ' + job.reason : '')
              + (await callConfig.knowledgeSuffix(workspace._id, ai)),
            greeting: agent?.greeting || 'Hello! This is your scheduled callback.',
            voice: (agent && ['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'].includes(agent.voiceId)) ? agent.voiceId : (azure ? 'marin' : 'alloy'),
            accessToken: workspace.whatsapp.accessToken,
            phoneNumberId: workspace.whatsapp.phoneNumberId,
            workspaceId: workspace._id,
            agent,
          });
          job.status = 'done';
          await job.save();
          console.log('[AI Callback] placed scheduled call to', job.phone);
        } catch (e) {
          job.status = 'failed';
          job.error = e.message;
          await job.save();
          console.error('[AI Callback] failed:', e.message);
        }
      }
    } catch (e) { console.error('[AI Callback] cron error:', e.message); }
  });
}

// Processes running bulk call campaigns — one call per campaign per minute,
// respecting calling hours and the daily limit.
function startBulkCampaigns() {
  cron.schedule('* * * * *', async () => {
    try {
      const CallCampaign = require('../models/CallCampaign');
      const running = await CallCampaign.find({ status: 'running' }).limit(10);
      for (const campaign of running) {
        try {
          await processCampaignTick(campaign);
        } catch (e) {
          console.error('[Bulk AI Call] campaign error:', e.message);
        }
      }
    } catch (e) { console.error('[Bulk AI Call] cron error:', e.message); }
  });
}

async function processCampaignTick(campaign) {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { start: hStart, end: hEnd } = campaign.callingHours || {};
  if (hStart && hEnd && (hhmm < hStart || hhmm >= hEnd)) return;

  const today = now.toISOString().slice(0, 10);
  if (campaign.lastCallDate !== today) {
    campaign.lastCallDate = today;
    campaign.callsToday = 0;
  }
  if (campaign.callsToday >= (campaign.dailyLimit || 50)) { await campaign.save(); return; }

  const target = campaign.targets.find((t) => t.status === 'pending');
  if (!target) {
    campaign.status = 'completed';
    await campaign.save();
    return;
  }

  const Workspace = require('../models/Workspace');
  const AISettings = require('../models/AISettings');
  const AICallingAgent = require('../models/AICallingAgent');
  const CallSession = require('../models/CallSession');
  const aiCallBridge = require('./aiCallBridge');
  const axios = require('axios');

  const workspace = await Workspace.findById(campaign.workspace);
  const accessToken = workspace?.whatsapp?.accessToken;
  const phoneNumberId = workspace?.whatsapp?.phoneNumberId;
  const ai = await AISettings.findOne({ workspace: campaign.workspace });

  let agent = campaign.agent ? await AICallingAgent.findById(campaign.agent) : null;
  if (!agent || agent.status !== 'active') {
    agent = await AICallingAgent.findOne({ workspace: campaign.workspace, isDefault: true, status: 'active' })
      || await AICallingAgent.findOne({ workspace: campaign.workspace, status: 'active' });
  }

  const callConfig = require('./callConfig');
  const azure = callConfig.azureRealtime(ai, agent);
  const callApiKey = azure ? azure.apiKey
    : ((agent?.voiceProvider === 'openai' && agent?.voiceApiKey && agent.voiceApiKey.startsWith('sk-')) ? agent.voiceApiKey : ai?.apiKey);
  if (!accessToken || !phoneNumberId || !callApiKey) {
    campaign.status = 'paused';
    await campaign.save();
    console.error('[Bulk AI Call] paused campaign', campaign.name, '- missing whatsapp/ai config');
    return;
  }

  target.status = 'calling';
  target.attempts = (target.attempts || 0) + 1;
  target.calledAt = now;
  await campaign.save();

  try {
    const r = await aiCallBridge.startOutbound({
      apiKey: callApiKey,
      azure,
      to: target.phone,
      instructions: (agent?.systemPrompt || ai?.systemPrompt || 'You are a helpful phone assistant. Keep replies short and natural.') + (await callConfig.knowledgeSuffix(campaign.workspace, ai)),
      greeting: agent?.greeting || 'Hello! How can I help you today?',
      voice: (agent && ['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'].includes(agent.voiceId)) ? agent.voiceId : (azure ? 'marin' : 'alloy'),
      accessToken,
      phoneNumberId,
      workspaceId: campaign.workspace,
      agent,
    });
    target.status = 'done';
    target.callId = r.callId;
    campaign.stats.done += 1;
    campaign.callsToday += 1;
    try {
      await CallSession.create({
        workspace: campaign.workspace,
        callId: r.callId,
        to: target.phone,
        direction: 'BUSINESS_INITIATED',
        status: 'ai-connected',
        agent: agent?._id,
        startTime: new Date(),
        createdBy: campaign.createdBy,
      });
    } catch (e) { /* noop */ }
  } catch (callErr) {
    const errCode = callErr.response?.data?.error?.code;
    const errMsg = callErr.response?.data?.error?.message || callErr.message;
    if (errCode === 138006) {
      // No call permission yet — send a permission request and move on
      try {
        await axios.post(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          { messaging_product: 'whatsapp', recipient_type: 'individual', to: target.phone, type: 'interactive', interactive: { type: 'call_permission_request', body: { text: 'We would like to call you. Allow calls from us?' }, action: { name: 'call_permission_request' } } },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        target.status = 'permission_requested';
        target.error = 'Call permission requested';
        campaign.stats.permissionRequested += 1;
      } catch (pe) {
        target.status = 'failed';
        target.error = errMsg;
        campaign.stats.failed += 1;
      }
    } else {
      target.status = 'failed';
      target.error = errMsg;
      campaign.stats.failed += 1;
    }
    campaign.callsToday += 1;
  }
  await campaign.save();
}

module.exports = { start, startBulkCampaigns };
