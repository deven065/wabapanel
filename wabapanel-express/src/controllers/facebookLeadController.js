const crypto = require('crypto');
const axios = require('axios');
const FacebookLead = require('../models/FacebookLead');
const Contact = require('../models/Contact');
const Workspace = require('../models/Workspace');
const SystemSettings = require('../models/SystemSettings');
const Automation = require('../models/Automation');
const { runAutomation } = require('../services/integrationAutomation');

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// @GET /api/webhook/facebook-leads - Verification
const verifyFacebookLeadWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.FB_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ message: 'Verification failed' });
};

// @POST /api/webhook/facebook-leads - Incoming leads
const handleFacebookLeadWebhook = async (req, res) => {
  try {
    // Respond immediately
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    if (!body.object || body.object !== 'page') return;

    const settings = await SystemSettings.findOne();
    const appSecret = settings?.facebook?.appSecret || process.env.META_APP_SECRET;

    // Verify signature if app secret is configured
    if (appSecret && req.headers['x-hub-signature-256']) {
      const signature = req.headers['x-hub-signature-256'];
      const rawBody = JSON.stringify(body);
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        console.error('Facebook webhook signature mismatch');
        return;
      }
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;

        const leadData = change.value;
        const pageId = leadData.page_id || entry.id;
        const formId = leadData.form_id;
        const leadgenId = leadData.leadgen_id;

        if (!leadgenId) continue;

        // Find workspace linked to this page
        const workspaces = await Workspace.find({ status: 'active' });

        for (const workspace of workspaces) {
          await _processLead(workspace, leadgenId, formId, pageId, settings);
        }
      }
    }
  } catch (error) {
    console.error('Facebook lead webhook error:', error.message);
  }
};

async function _processLead(workspace, leadgenId, formId, pageId, settings) {
  try {
    // Check if lead already exists
    const existing = await FacebookLead.findOne({ workspace: workspace._id, leadId: leadgenId });
    if (existing) return;

    // Try to fetch lead data from Meta API
    let leadFields = {};
    let rawLeadData = {};
    const accessToken = workspace.whatsapp?.accessToken || settings?.whatsapp?.appSecret;

    if (accessToken) {
      try {
        const response = await axios.get(`${META_GRAPH_URL}/${leadgenId}`, {
          params: { access_token: accessToken },
        });
        rawLeadData = response.data;
        // Parse field_data array into object
        if (response.data?.field_data) {
          for (const field of response.data.field_data) {
            leadFields[field.name] = field.values?.[0] || '';
          }
        }
      } catch (err) {
        console.error('Error fetching lead data:', err.response?.data?.error?.message || err.message);
        // Store with whatever data we have
        leadFields = { leadgen_id: leadgenId, form_id: formId, page_id: pageId };
      }
    }

    // Extract contact info from lead fields
    const name = leadFields.full_name || leadFields.first_name
      ? `${leadFields.first_name || ''} ${leadFields.last_name || ''}`.trim()
      : leadFields.name || '';
    const phone = leadFields.phone_number || leadFields.phone || '';
    const email = leadFields.email || '';

    // Create or update contact
    let contact = null;
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      contact = await Contact.findOneAndUpdate(
        { workspace: workspace._id, phone: cleanPhone },
        {
          workspace: workspace._id,
          phone: cleanPhone,
          name: name || cleanPhone,
          email,
          source: 'facebook_lead',
          lastMessageAt: new Date(),
          $setOnInsert: { status: 'active' },
        },
        { upsert: true, new: true }
      );
    } else if (email) {
      contact = await Contact.findOneAndUpdate(
        { workspace: workspace._id, email },
        {
          workspace: workspace._id,
          email,
          name: name || email,
          source: 'facebook_lead',
          $setOnInsert: { status: 'active' },
        },
        { upsert: true, new: true }
      );
    }

    // Save lead
    await FacebookLead.create({
      workspace: workspace._id,
      leadId: leadgenId,
      formId: formId || '',
      pageId: pageId || '',
      contact: contact?._id,
      fieldData: leadFields,
      rawData: rawLeadData,
      status: 'new',
    });

    // Auto-send welcome template if enabled in the Facebook Lead Ads integration
    if (phone) {
      await runAutomation({
        workspaceId: workspace._id,
        type: 'facebook-leads',
        event: 'lead',
        phone,
        name,
        email,
        tags: ['facebook_lead', 'lead'],
        vars: [name || 'there', 'Facebook'],
      });
    }

    // Trigger automations for contact_created event
    if (contact) {
      const automations = await Automation.find({
        workspace: workspace._id,
        status: 'active',
        triggerType: { $in: ['contact_created', 'event'] },
      });

      for (const auto of automations) {
        if (auto.triggerConfig?.event === 'facebook_lead' || auto.triggerType === 'contact_created') {
          auto.stats.triggered++;
          await auto.save();
        }
      }
    }
  } catch (error) {
    console.error('Process lead error:', error.message);
  }
}

// @GET /api/facebook-leads
const getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, formId } = req.query;
    const query = { workspace: req.workspace._id };
    if (status) query.status = status;
    if (formId) query.formId = formId;

    const total = await FacebookLead.countDocuments(query);
    const leads = await FacebookLead.find(query)
      .populate('contact', 'name phone email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: leads,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @GET /api/facebook-leads/:id
const getLead = async (req, res) => {
  try {
    const lead = await FacebookLead.findOne({
      _id: req.params.id,
      workspace: req.workspace._id,
    }).populate('contact');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @PUT /api/facebook-leads/:id
const updateLead = async (req, res) => {
  try {
    const lead = await FacebookLead.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspace._id },
      { status: req.body.status },
      { new: true }
    ).populate('contact');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/facebook-leads/sync
const syncLeads = async (req, res) => {
  try {
    const accessToken = req.workspace.whatsapp?.accessToken;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'WhatsApp access token not configured. Please setup WhatsApp first.' });
    }

    const { formId } = req.body;
    let formIds = [];

    if (formId) {
      formIds = [formId];
    } else {
      // Auto-discover forms from linked pages
      try {
        // Get WABA ID and then pages
        const wabaId = req.workspace.whatsapp?.wabaId;
        const phoneNumberId = req.workspace.whatsapp?.phoneNumberId;
        
        // Try to get pages linked to the business
        try {
          const pagesRes = await axios.get(`${META_GRAPH_URL}/me/accounts`, {
            params: { access_token: accessToken, limit: 100 },
          });
          const pages = pagesRes.data?.data || [];
          
          for (const page of pages) {
            try {
              const formsRes = await axios.get(`${META_GRAPH_URL}/${page.id}/leadgen_forms`, {
                params: { access_token: page.access_token || accessToken, limit: 50 },
              });
              const forms = formsRes.data?.data || [];
              formIds.push(...forms.map(f => f.id));
            } catch { /* Page may not have lead forms */ }
          }
        } catch (pErr) {
          // If pages API fails, try getting leads directly from recent forms
          console.log('[Facebook Leads] Pages API not available:', pErr.response?.data?.error?.message || pErr.message);
        }
      } catch { /* ignore */ }
    }

    if (formIds.length === 0) {
      return res.json({ 
        success: true, 
        data: { synced: 0, total: 0 }, 
        message: 'No Facebook Lead Ad forms found. Make sure you have active Lead Ads and the access token has leads_retrieval permission.' 
      });
    }

    let synced = 0;
    let total = 0;
    const settings = await SystemSettings.findOne();

    for (const fid of formIds) {
      try {
        const response = await axios.get(`${META_GRAPH_URL}/${fid}/leads`, {
          params: { access_token: accessToken, limit: 100 },
        });
        const leads = response.data?.data || [];
        total += leads.length;

        for (const lead of leads) {
          const existing = await FacebookLead.findOne({ workspace: req.workspace._id, leadId: lead.id });
          if (!existing) {
            await _processLead(req.workspace, lead.id, fid, '', settings);
            synced++;
          }
        }
      } catch (fErr) {
        console.log('[Facebook Leads] Form sync error for', fid, ':', fErr.response?.data?.error?.message || fErr.message);
      }
    }

    res.json({ success: true, data: { synced, total }, message: `Synced ${synced} new leads from ${formIds.length} forms` });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    res.status(500).json({ success: false, message: errMsg });
  }
};

module.exports = {
  verifyFacebookLeadWebhook,
  handleFacebookLeadWebhook,
  getLeads,
  getLead,
  updateLead,
  syncLeads,
};
