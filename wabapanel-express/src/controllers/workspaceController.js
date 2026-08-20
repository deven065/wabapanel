const Workspace = require('../models/Workspace');
const User = require('../models/User');
const crypto = require('crypto');
const WhatsAppService = require('../services/whatsappService');
const axios = require('axios');
const SystemSettings = require('../models/SystemSettings');

// @GET /api/workspaces
const getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id },
      ],
    }).populate('owner', 'name email');

    res.json({ success: true, data: workspaces });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces
const createWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    const workspace = await Workspace.create({
      name,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'owner' }],
    });

    res.status(201).json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/workspaces/:id
const getWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email avatar role');

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/workspaces/:id
const updateWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    Object.assign(workspace, req.body);

    // Connecting a Telegram bot: validate the token and register the webhook
    if (req.body.telegram && req.body.telegram.enabled && req.body.telegram.botToken) {
      try {
        const tg = require('../services/telegramService');
        const me = await tg.getMe(req.body.telegram.botToken);
        workspace.telegram.botUsername = me?.username || '';
        await tg.setWebhook(req.body.telegram.botToken, workspace._id);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Telegram bot token is invalid: ' + (e.response?.data?.description || e.message) });
      }
    }

    // Connecting Facebook Messenger / Instagram: subscribe the Page so its
    // messages reach our webhook.
    const mc = req.body.metaChat;
    if (mc && (mc.fbEnabled || mc.igEnabled) && mc.pageId && mc.pageAccessToken) {
      try {
        // Subscribe the Page to whichever app the token belongs to, so that
        // app forwards the Page's messages to our webhook. The Messenger app's
        // webhook must point to /api/webhook/whatsapp (any app is fine).
        await axios.post(
          `https://graph.facebook.com/v21.0/${mc.pageId}/subscribed_apps`,
          { subscribed_fields: 'messages,messaging_postbacks,message_reads,message_reactions' },
          { headers: { Authorization: `Bearer ${mc.pageAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        console.log('[Messenger] Page subscribed for webhooks:', mc.pageId);
        // Resolve the Instagram Business Account id linked to this Page and store it,
        // because Instagram messaging webhooks arrive with that id as entry.id. If the
        // client saved a different id, incoming IG DMs would not match this workspace.
        if (mc.igEnabled) {
          try {
            const igResp = await axios.get(
              `https://graph.facebook.com/v21.0/${mc.pageId}`,
              { params: { fields: 'instagram_business_account,connected_instagram_account', access_token: mc.pageAccessToken }, timeout: 10000 }
            );
            const igId = igResp.data?.instagram_business_account?.id || igResp.data?.connected_instagram_account?.id;
            if (igId) workspace.metaChat.igAccountId = String(igId);
          } catch (e) {
            console.error('[Instagram] IG account resolve failed:', e.response?.data?.error?.message || e.message);
          }
        }

        // Auto-configure the Facebook app's Messenger/Instagram webhook so this panel's
        // domain receives FB/IG events, without any manual Meta Dashboard step. Requires
        // the admin to have saved the Facebook App ID + Secret in Admin -> Settings.
        try {
          const settings = await SystemSettings.findOne();
          const fbAppId = settings?.facebook?.appId;
          const fbAppSecret = settings?.facebook?.appSecret;
          if (fbAppId && fbAppSecret) {
            const base = (process.env.BACKEND_URL || process.env.API_URL || '').replace(/\/$/, '');
            const callbackUrl = `${base}/api/webhook/whatsapp`;
            const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
            const appAccessToken = `${fbAppId}|${fbAppSecret}`;
            const objects = [];
            if (mc.fbEnabled) objects.push({ object: 'page', fields: 'messages,messaging_postbacks,message_reads,message_reactions,messaging_handovers' });
            if (mc.igEnabled) objects.push({ object: 'instagram', fields: 'messages,messaging_postbacks,messaging_referral,message_reactions,comments,live_comments,mentions' });
            for (const o of objects) {
              try {
                await axios.post(
                  `https://graph.facebook.com/v21.0/${fbAppId}/subscriptions`,
                  null,
                  { params: { object: o.object, callback_url: callbackUrl, verify_token: verifyToken, fields: o.fields, access_token: appAccessToken }, timeout: 10000 }
                );
                console.log(`[Messenger] App webhook set for object=${o.object} -> ${callbackUrl}`);
              } catch (e) {
                console.error(`[Messenger] App webhook set failed (object=${o.object}):`, e.response?.data?.error?.message || e.message);
              }
            }
          }
        } catch (e) {
          console.error('[Messenger] App webhook auto-config error:', e.message);
        }
      } catch (e) {
        const fbMsg = e.response?.data?.error?.message || e.message;
        return res.status(400).json({ success: false, message: 'Facebook Page could not be connected: ' + fbMsg });
      }
    }

    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces/:id/members
const addMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const existing = workspace.members.find(m => m.user.toString() === user._id.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already a member' });
    }

    workspace.members.push({ user: user._id, role: role || 'agent' });
    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/workspaces/:id/members/:userId
const removeMember = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    workspace.members = workspace.members.filter(
      m => m.user.toString() !== req.params.userId
    );
    await workspace.save();

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/workspaces/:id
const deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this workspace' });
    }

    await Workspace.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Workspace deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces/:id/api-key
const generateApiKey = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    workspace.apiKey = crypto.randomBytes(32).toString('hex');
    await workspace.save();

    res.json({ success: true, data: { apiKey: workspace.apiKey } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/workspaces/:id/api-webhooks — list developer webhook subscriptions
const listApiWebhooks = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id).select('owner members apiWebhooks');
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const isMember = workspace.owner.toString() === req.user._id.toString()
      || (workspace.members || []).some(m => m.user.toString() === req.user._id.toString());
    if (!isMember && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, data: workspace.apiWebhooks || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces/:id/api-webhooks { url, events } — add a webhook subscription
const addApiWebhook = async (req, res) => {
  try {
    const { url, events } = req.body;
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ success: false, message: 'A valid http(s) URL is required' });
    }
    const allowed = ['message.received', 'contact.created', 'message.status'];
    const evs = (Array.isArray(events) ? events : []).filter(e => allowed.includes(e));
    if (!evs.length) return res.status(400).json({ success: false, message: 'Select at least one event' });
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    workspace.apiWebhooks.push({ url, events: evs });
    await workspace.save();
    res.json({ success: true, data: workspace.apiWebhooks[workspace.apiWebhooks.length - 1] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @DELETE /api/workspaces/:id/api-webhooks/:hookId — remove a webhook subscription
const deleteApiWebhook = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    if (workspace.owner.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    workspace.apiWebhooks = (workspace.apiWebhooks || []).filter(h => h._id.toString() !== req.params.hookId);
    await workspace.save();
    res.json({ success: true, message: 'Webhook removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/workspaces/:id/whatsapp
const updateWhatsAppConfig = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const updateData = { ...req.body };

    // When connecting via manual method, fetch phone details from Meta API
    if (updateData.isConnected && updateData.accessToken && updateData.phoneNumberId) {
      try {
        const waService = new WhatsAppService(updateData.accessToken, updateData.phoneNumberId);
        const phoneDetails = await waService.getPhoneNumberDetails();
        if (phoneDetails) {
          updateData.displayName = phoneDetails.verified_name || '';
          updateData.phoneNumber = phoneDetails.display_phone_number || '';
          updateData.qualityRating = phoneDetails.quality_rating || '';
        }
      } catch (metaErr) {
        console.error('Meta API fetch phone details error:', metaErr.response?.data || metaErr.message);
      }

      // Disconnect same WABA/phone from any OTHER workspace
      const wabaToCheck = updateData.wabaId || '';
      const phoneToCheck = updateData.phoneNumberId || '';
      if (wabaToCheck || phoneToCheck) {
        try {
          const query = { _id: { $ne: workspace._id } };
          if (wabaToCheck && phoneToCheck) {
            query.$or = [{ 'whatsapp.wabaId': wabaToCheck }, { 'whatsapp.phoneNumberId': phoneToCheck }];
          } else if (wabaToCheck) {
            query['whatsapp.wabaId'] = wabaToCheck;
          } else {
            query['whatsapp.phoneNumberId'] = phoneToCheck;
          }
          const others = await Workspace.find(query);
          for (const other of others) {
            console.log('[WhatsApp] Auto-disconnecting WABA from workspace:', other._id.toString(), other.whatsapp?.wabaId);
            try { await require('../services/ownerNotify').disconnectAlert(other); } catch (e) { /* noop */ }
            other.whatsapp = { ...other.whatsapp.toObject(), isConnected: false, accessToken: '', wabaId: '', phoneNumberId: '', displayName: '', phoneNumber: '' };
            await other.save();
          }
          if (others.length) console.log('[WhatsApp] Disconnected', others.length, 'other workspace(s) using same WABA/phone');
        } catch (dcErr) {
          console.error('[WhatsApp] Auto-disconnect check error:', dcErr.message);
        }
      }

      // Auto-subscribe webhook so messages come to WabaPanel
      if (updateData.wabaId) {
        try {
          const settings = await SystemSettings.findOne();
          const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
          const webhookUrl = `${(process.env.BACKEND_URL || 'https://api.wabapanel.com').replace(/\/$/, '')}/api/webhook/whatsapp`;
          // Subscribe app to the WABA
          await axios.post(
            `https://graph.facebook.com/v21.0/${updateData.wabaId}/subscribed_apps`,
            { override_callback_uri: webhookUrl, verify_token: verifyToken },
            { headers: { Authorization: `Bearer ${updateData.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
          );
          // Also register the phone number for webhooks
          await axios.post(
            `https://graph.facebook.com/v21.0/${updateData.phoneNumberId}/register`,
            { messaging_product: 'whatsapp', pin: '123456' },
            { headers: { Authorization: `Bearer ${updateData.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
          ).catch(() => {});
          console.log('[WhatsApp] Webhook + phone registration done for WABA:', updateData.wabaId);
        } catch (whErr) {
          console.error('[WhatsApp] Webhook subscription failed:', whErr.response?.data || whErr.message);
        }
      }
    }

    // Merge with existing whatsapp config
    const existingWa = workspace.whatsapp ? workspace.whatsapp.toObject() : {};
    workspace.whatsapp = { ...existingWa, ...updateData };
    await workspace.save();

    // For extra numbers on a DIFFERENT WABA (own access token + WABA id), subscribe the
    // app + register the phone so their inbound messages reach this panel. Best-effort.
    try {
      const extras = (workspace.whatsapp.extraNumbers || []).filter((n) => n && n.accessToken && n.wabaId);
      if (extras.length) {
        const settings = await SystemSettings.findOne();
        const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
        const webhookUrl = `${(process.env.BACKEND_URL || 'https://api.wabapanel.com').replace(/\/$/, '')}/api/webhook/whatsapp`;
        for (const n of extras) {
          try {
            await axios.post(
              `https://graph.facebook.com/v21.0/${n.wabaId}/subscribed_apps`,
              { override_callback_uri: webhookUrl, verify_token: verifyToken },
              { headers: { Authorization: `Bearer ${n.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            );
            await axios.post(
              `https://graph.facebook.com/v21.0/${n.phoneNumberId}/register`,
              { messaging_product: 'whatsapp', pin: '123456' },
              { headers: { Authorization: `Bearer ${n.accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
            ).catch(() => {});
          } catch (e) {
            console.error('[WhatsApp] Extra-number webhook subscribe failed:', n.phoneNumberId, e.response?.data?.error?.message || e.message);
          }
        }
      }
    } catch (e) { /* noop */ }

    res.json({ success: true, data: workspace });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const refreshWhatsAppDetails = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const wa = workspace.whatsapp;
    if (!wa || !wa.accessToken || !wa.phoneNumberId) return res.status(400).json({ success: false, message: 'WhatsApp not connected or credentials missing' });
    const waService = new WhatsAppService(wa.accessToken, wa.phoneNumberId);
    const phoneDetails = await waService.getPhoneNumberDetails();
    if (phoneDetails) {
      workspace.whatsapp.displayName = phoneDetails.verified_name || '';
      workspace.whatsapp.phoneNumber = phoneDetails.display_phone_number || '';
      workspace.whatsapp.qualityRating = phoneDetails.quality_rating || '';
      await workspace.save();
    }
    res.json({ success: true, data: workspace });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    res.status(500).json({ success: false, message: msg });
  }
};

// @GET /api/workspaces/:id/whatsapp/health — live status from Meta Graph API
const getWhatsAppHealth = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ success: false, message: 'Workspace not found' });
    const wa = workspace.whatsapp;
    if (!wa || !wa.accessToken || !wa.phoneNumberId) {
      return res.status(400).json({ success: false, message: 'WhatsApp not connected or credentials missing' });
    }
    const headers = { Authorization: `Bearer ${wa.accessToken}` };
    const result = { tokenValid: true, phone: null, waba: null, errors: [] };
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/${wa.phoneNumberId}`, {
        headers, timeout: 15000,
        params: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,name_status,messaging_limit_tier,status,throughput' },
      });
      result.phone = r.data;
    } catch (e) {
      const err = e.response?.data?.error;
      if (err && (err.code === 190 || err.type === 'OAuthException')) result.tokenValid = false;
      result.errors.push(err?.message || e.message);
    }
    const wabaId = wa.wabaId || wa.businessAccountId;
    if (wabaId) {
      try {
        const r = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
          headers, timeout: 15000,
          params: { fields: 'name,account_review_status,business_verification_status,country,ownership_type,message_template_namespace' },
        });
        result.waba = r.data;
      } catch (e) {
        // some fields need extra permissions — retry with basic fields
        try {
          const r2 = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}`, {
            headers, timeout: 15000, params: { fields: 'name,account_review_status' },
          });
          result.waba = r2.data;
        } catch (e2) {
          result.errors.push(e2.response?.data?.error?.message || e2.message);
        }
      }
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
};

module.exports = {
  getWorkspaces, createWorkspace, getWorkspace, updateWorkspace,
  deleteWorkspace, generateApiKey, addMember, removeMember, updateWhatsAppConfig, refreshWhatsAppDetails, getWhatsAppHealth,
  listApiWebhooks, addApiWebhook, deleteApiWebhook,
};


