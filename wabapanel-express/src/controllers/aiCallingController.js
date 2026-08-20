const axios = require('axios');
const AICallingAgent = require('../models/AICallingAgent');
const CallSession = require('../models/CallSession');
const AISettings = require('../models/AISettings');
const aiCallBridge = require('../services/aiCallBridge');

const GRAPH = 'https://graph.facebook.com/v21.0';
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];

// Normalize to bare international digits (no +). e.g. "+91 97820 05500" -> "919782005500"
const normalizePhone = (p) => (p || '').replace(/[^0-9]/g, '');

const getAgents = async (req, res) => {
  try {
    const agents = await AICallingAgent.find({ workspace: req.workspace._id })
      .select('-callLogs')
      .populate('createdBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAgent = async (req, res) => {
  try {
    const agent = await AICallingAgent.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('createdBy', 'name email');

    if (!agent) {
      return res.status(404).json({ success: false, message: 'AI Calling Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createAgent = async (req, res) => {
  try {
    const agent = await AICallingAgent.create({
      ...req.body,
      workspace: req.workspace._id,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAgent = async (req, res) => {
  try {
    const agent = await AICallingAgent.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!agent) {
      return res.status(404).json({ success: false, message: 'AI Calling Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const agent = await AICallingAgent.findOneAndDelete({
      _id: req.params.id,
      workspace: req.workspace._id,
    });
    if (!agent) {
      return res.status(404).json({ success: false, message: 'AI Calling Agent not found' });
    }
    res.json({ success: true, message: 'AI Calling Agent deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const initiateCall = async (req, res) => {
  try {
    const { contactPhone, agentId, sdp } = req.body;
    if (!contactPhone) return res.status(400).json({ success: false, message: 'Contact phone required' });
    if (!sdp) return res.status(400).json({ success: false, message: 'WebRTC SDP offer required' });

    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured' });
    }

    const to = normalizePhone(contactPhone);

    try {
      // Business-initiated call: send our WebRTC SDP offer to Meta.
      const callRes = await axios.post(
        `${GRAPH}/${phoneNumberId}/calls`,
        {
          messaging_product: 'whatsapp',
          to,
          action: 'connect',
          session: { sdp_type: 'offer', sdp },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );

      const callId = callRes.data?.calls?.[0]?.id;
      if (!callId) {
        return res.status(400).json({ success: false, message: 'Call API did not return a call id' });
      }

      await CallSession.create({
        workspace: workspace._id,
        callId,
        to,
        direction: 'BUSINESS_INITIATED',
        status: 'connecting',
        offerSdp: sdp,
        agent: agentId || undefined,
        startTime: new Date(),
        createdBy: req.user?._id,
      });

      res.json({ success: true, data: { callId, to, message: 'Calling ' + to } });
    } catch (callErr) {
      const errMsg = callErr.response?.data?.error?.message || callErr.message;
      const errCode = callErr.response?.data?.error?.code;
      let hint = '';
      if (errCode === 138006) {
        // Auto-send permission request
        try {
          await axios.post(
            `${GRAPH}/${phoneNumberId}/messages`,
            { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive: { type: 'call_permission_request', body: { text: 'We would like to call you. Allow calls from us?' }, action: { name: 'call_permission_request' } } },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          hint = ' Call permission request automatically sent — wait for the customer to accept, then call.';
        } catch (pe) { hint = ' Permission request bhi fail: ' + (pe.response?.data?.error?.message || pe.message); }
      }
      else if (errCode === 138000) hint = ' Calling is not enabled on this WhatsApp number.';
      else if (errCode === 138013) hint = ' Business-initiated calling is not available for this number\'s country.';
      res.status(400).json({ success: false, message: 'Call API: ' + errMsg + '.' + hint });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/ai-calling/call/:callId  — poll for SDP answer + status (WebRTC signaling relay)
const getCallStatus = async (req, res) => {
  try {
    const session = await CallSession.findOne({
      callId: req.params.callId,
      workspace: req.workspace._id,
    });
    if (!session) return res.status(404).json({ success: false, message: 'Call not found' });

    const data = {
      callId: session.callId,
      status: session.status,
      answerSdp: session.answerDelivered ? '' : session.answerSdp,
      errorMessage: session.errorMessage,
      duration: session.duration,
    };

    // Mark the answer as delivered so we only hand it to the browser once.
    if (session.answerSdp && !session.answerDelivered) {
      session.answerDelivered = true;
      await session.save();
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/call/:callId/terminate
const terminateCall = async (req, res) => {
  try {
    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;
    const callId = req.params.callId;

    if (accessToken && phoneNumberId) {
      try {
        await axios.post(
          `${GRAPH}/${phoneNumberId}/calls`,
          { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
      } catch (e) { /* call may already be over */ }
    }

    await CallSession.findOneAndUpdate(
      { callId, workspace: workspace._id },
      { status: 'terminated', endTime: new Date() }
    );
    res.json({ success: true, message: 'Call ended' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/request-permission  — send a call-permission request to the user
const requestCallPermission = async (req, res) => {
  try {
    const { contactPhone } = req.body;
    if (!contactPhone) return res.status(400).json({ success: false, message: 'Contact phone required' });

    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;
    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured' });
    }

    try {
      await axios.post(
        `${GRAPH}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizePhone(contactPhone),
          type: 'interactive',
          interactive: {
            type: 'call_permission_request',
            body: { text: 'We would like to call you. Allow calls from us?' },
            action: { name: 'call_permission_request' },
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      res.json({ success: true, message: 'Call permission request sent to ' + contactPhone });
    } catch (e) {
      const errMsg = e.response?.data?.error?.message || e.message;
      res.status(400).json({ success: false, message: 'Permission request failed: ' + errMsg });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/ai-calling/incoming  — pending customer-initiated calls for this workspace (browser polls)
const getIncomingCalls = async (req, res) => {
  try {
    const since = new Date(Date.now() - 45 * 1000); // only ring calls that arrived recently
    const sessions = await CallSession.find({
      workspace: req.workspace._id,
      direction: 'USER_INITIATED',
      status: 'incoming',
      startTime: { $gte: since },
    }).sort('-createdAt').limit(1);

    const data = sessions.map((s) => ({
      callId: s.callId,
      from: s.from,
      offerSdp: s.offerSdp,
    }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/call/:callId/accept  — answer an inbound call with the browser's SDP answer
const acceptCall = async (req, res) => {
  try {
    const { sdp } = req.body;
    if (!sdp) return res.status(400).json({ success: false, message: 'WebRTC SDP answer required' });

    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;
    const callId = req.params.callId;
    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured' });
    }

    try {
      await axios.post(
        `${GRAPH}/${phoneNumberId}/calls`,
        {
          messaging_product: 'whatsapp',
          call_id: callId,
          action: 'accept',
          session: { sdp_type: 'answer', sdp },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      await CallSession.findOneAndUpdate(
        { callId, workspace: workspace._id },
        { status: 'accepted', answerSdp: sdp, answerDelivered: true }
      );
      res.json({ success: true, message: 'Call accepted' });
    } catch (e) {
      const errMsg = e.response?.data?.error?.message || e.message;
      res.status(400).json({ success: false, message: 'Accept failed: ' + errMsg });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/call/:callId/reject
const rejectCall = async (req, res) => {
  try {
    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;
    const callId = req.params.callId;

    if (accessToken && phoneNumberId) {
      try {
        await axios.post(
          `${GRAPH}/${phoneNumberId}/calls`,
          { messaging_product: 'whatsapp', call_id: callId, action: 'reject' },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );
      } catch (e) { /* call may already be gone */ }
    }
    await CallSession.findOneAndUpdate(
      { callId, workspace: workspace._id },
      { status: 'rejected', endTime: new Date() }
    );
    res.json({ success: true, message: 'Call rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCallHistory = async (req, res) => {
  try {
    const sessions = await CallSession.find({ workspace: req.workspace._id })
      .sort('-createdAt').limit(200).populate('agent', 'name').lean();
    res.json({
      success: true,
      data: sessions.map(s => ({
        _id: s._id, callId: s.callId, to: s.to, from: s.from,
        direction: s.direction, status: s.status, duration: s.duration || 0,
        agentName: s.agent?.name || '', recordingUrl: s.recordingUrl || '',
        createdAt: s.createdAt, endTime: s.endTime,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadRecording = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    const aiSet = await AISettings.findOne({ workspace: req.workspace._id }).select('callRecording').lean();
    if (aiSet?.callRecording?.enabled === false) return res.json({ success: true, data: { url: '' } });
    const fs = require('fs');
    const path = require('path');
    const { REC_DIR } = require('../services/callRecorder');
    fs.mkdirSync(REC_DIR, { recursive: true });
    const safe = String(req.params.callId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) return res.status(400).json({ success: false, message: 'Bad call id' });
    const name = safe + '-manual.webm';
    fs.writeFileSync(path.join(REC_DIR, name), req.file.buffer);
    const url = '/uploads/recordings/' + name;
    await CallSession.findOneAndUpdate({ callId: req.params.callId, workspace: req.workspace._id }, { recordingUrl: url });
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCallLogs = async (req, res) => {
  try {
    const agents = await AICallingAgent.find({ workspace: req.workspace._id }).select('name callLogs');
    const allLogs = [];
    for (const agent of agents) {
      for (const log of (agent.callLogs || [])) {
        allLogs.push({ ...log.toObject(), agentName: agent.name, agentId: agent._id });
      }
    }
    allLogs.sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt));
    res.json({ success: true, data: allLogs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/ai-calling/ai-call  — server places an outbound call and lets the
// AI voice agent talk to the customer (no browser/mic needed).
const aiCall = async (req, res) => {
  try {
    const { contactPhone } = req.body;
    if (!contactPhone) return res.status(400).json({ success: false, message: 'Contact phone required' });

    const workspace = req.workspace;
    const accessToken = workspace.whatsapp?.accessToken;
    const phoneNumberId = workspace.whatsapp?.phoneNumberId;
    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not configured' });
    }

    const ai = await AISettings.findOne({ workspace: workspace._id });

    let agent = await AICallingAgent.findOne({ workspace: workspace._id, isDefault: true, status: 'active' });
    if (!agent) agent = await AICallingAgent.findOne({ workspace: workspace._id, status: 'active' });

    const callConfig = require('../services/callConfig');
    const azure = callConfig.azureRealtime(ai, agent);
    const callApiKey = azure ? azure.apiKey
      : ((agent?.voiceProvider === 'openai' && agent?.voiceApiKey && agent.voiceApiKey.startsWith('sk-')) ? agent.voiceApiKey : ai?.apiKey);
    if (!callApiKey) {
      return res.status(400).json({ success: false, message: 'Set your OpenAI API key in AI Settings first' });
    }

    const voice = (agent && OPENAI_VOICES.includes(agent.voiceId))
      ? agent.voiceId : (azure ? 'marin' : 'alloy');
    const to = normalizePhone(contactPhone);
    const basePrompt = agent?.systemPrompt || ai?.systemPrompt || 'You are a helpful phone assistant. Keep replies short and natural.';

    try {
      const r = await aiCallBridge.startOutbound({
        apiKey: callApiKey,
        azure,
        to,
        instructions: basePrompt + (await callConfig.knowledgeSuffix(workspace._id, ai)),
        greeting: agent?.greeting || 'Hello! How can I help you today?',
        voice,
        accessToken,
        phoneNumberId,
        workspaceId: workspace._id,
        agent,
      });

      await CallSession.create({
        workspace: workspace._id,
        callId: r.callId,
        to,
        direction: 'BUSINESS_INITIATED',
        status: 'ai-connected',
        agent: agent?._id,
        startTime: new Date(),
        createdBy: req.user?._id,
      });

      res.json({ success: true, data: { callId: r.callId, to, message: 'AI calling ' + to } });
    } catch (callErr) {
      const errMsg = callErr.response?.data?.error?.message || callErr.message;
      const errCode = callErr.response?.data?.error?.code;
      let hint = '';
      if (errCode === 138006) {
        // Auto-send permission request
        try {
          await axios.post(
            `${GRAPH}/${phoneNumberId}/messages`,
            { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive: { type: 'call_permission_request', body: { text: 'We would like to call you. Allow calls from us?' }, action: { name: 'call_permission_request' } } },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          hint = ' Call permission request automatically sent — wait for the customer to accept, then call.';
        } catch (pe) { hint = ' Permission request bhi fail: ' + (pe.response?.data?.error?.message || pe.message); }
      }
      else if (errCode === 138000) hint = ' Calling is not enabled on this WhatsApp number.';
      else if (errCode === 138013) hint = ' Business-initiated calling is not available for this number\'s country.';
      res.status(400).json({ success: false, message: 'AI Call: ' + errMsg + '.' + hint });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const setDefaultAgent = async (req, res) => {
  try {
    const { agentId, enabled } = req.body;
    // Unset all agents as default first
    await AICallingAgent.updateMany({ workspace: req.workspace._id }, { $set: { isDefault: false } });
    
    if (enabled && agentId) {
      await AICallingAgent.findOneAndUpdate(
        { _id: agentId, workspace: req.workspace._id },
        { isDefault: true, status: 'active' }
      );
    }
    
    res.json({ success: true, message: enabled ? 'Default AI agent set' : 'Default AI agent disabled' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAgents, getAgent, createAgent, updateAgent, deleteAgent,
  initiateCall, getCallStatus, terminateCall, requestCallPermission,
  getIncomingCalls, acceptCall, rejectCall,
  getCallLogs, setDefaultAgent, aiCall,
  getCallHistory, uploadRecording,
};
