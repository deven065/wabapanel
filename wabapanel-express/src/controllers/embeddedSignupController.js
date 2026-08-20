const axios = require('axios');
const Workspace = require('../models/Workspace');
const SystemSettings = require('../models/SystemSettings');

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// @POST /api/workspaces/:id/whatsapp/embedded-signup
// Handles the OAuth callback from Meta Embedded Signup
const handleEmbeddedSignup = async (req, res) => {
  try {
    // sessionWabaId / sessionPhoneNumberId come from Embedded Signup session logging (postMessage).
    // coexistence = true when the customer connected an existing WhatsApp Business App number.
    const { code, wabaId: sessionWabaId, phoneNumberId: sessionPhoneNumberId, coexistence } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code required' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    const settings = await SystemSettings.findOne();
    const appId = settings?.whatsapp?.appId || process.env.META_APP_ID;
    const appSecret = settings?.whatsapp?.appSecret || process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(400).json({
        success: false,
        message: 'Meta App ID and Secret not configured. Configure in Admin → System Preferences → WhatsApp.',
      });
    }

    // Exchange code for long-lived token.
    // Codes issued by the Facebook JavaScript SDK (FB.login popup) are bound to an
    // empty redirect_uri, so the exchange must send redirect_uri='' to match — otherwise
    // Meta returns "redirect_uri is not identical to the one used in the OAuth dialog".
    const tokenResponse = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: '',
        code,
      },
    });

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'Failed to get access token from Meta' });
    }

    // Get shared WABA info using debug_token or business endpoint
    const debugResponse = await axios.get(`${META_GRAPH_URL}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: `${appId}|${appSecret}`,
      },
    });

    const grantedScopes = debugResponse.data?.data?.scopes || [];

    // Get WABA and phone number details.
    // Prefer the IDs captured from Embedded Signup session logging (most reliable);
    // fall back to Graph discovery when they are not available.
    let wabaId = sessionWabaId || '';
    let phoneNumberId = sessionPhoneNumberId || '';
    let businessAccountId = sessionWabaId || '';
    let phoneNumber = '';
    let displayName = '';

    try {
      if (!wabaId) {
        // List WABA accounts shared with us
        const wabaListResponse = await axios.get(
          `${META_GRAPH_URL}/me/whatsapp_business_accounts`,
          {
            params: { fields: 'id,name,account_review_status' },
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const wabas = wabaListResponse.data?.data || [];
        if (wabas.length > 0) {
          wabaId = wabas[0].id;
          businessAccountId = wabas[0].id;
        }
      }

      if (wabaId) {
        // Get phone numbers for this WABA
        const phoneResponse = await axios.get(
          `${META_GRAPH_URL}/${wabaId}/phone_numbers`,
          {
            params: { fields: 'id,display_phone_number,verified_name,quality_rating' },
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const phones = phoneResponse.data?.data || [];
        // Match the phone from session info if provided, else take the first
        const phone = phones.find(p => p.id === sessionPhoneNumberId) || phones[0];
        if (phone) {
          phoneNumberId = phone.id;
          phoneNumber = phone.display_phone_number;
          displayName = phone.verified_name || '';
        }
      }
    } catch (err) {
      console.error('Error fetching WABA details:', err.response?.data || err.message);
    }

    // Subscribe our app to this WABA so webhooks (messages + coexistence events) are delivered.
    // We also set a WABA-level webhook override so incoming messages are delivered straight to
    // THIS panel's own domain — the customer never has to configure a callback URL in Meta.
    if (wabaId) {
      const apiDomain = process.env.API_URL || process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const overrideCallbackUri = `${apiDomain}/api/webhook/whatsapp`;
      const verifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
      try {
        const subParams = { override_callback_uri: overrideCallbackUri };
        if (verifyToken) subParams.verify_token = verifyToken;
        await axios.post(
          `${META_GRAPH_URL}/${wabaId}/subscribed_apps`,
          null,
          { params: subParams, headers: { Authorization: `Bearer ${accessToken}` } }
        );
      } catch (err) {
        console.error('Error subscribing app to WABA (with override):', err.response?.data || err.message);
        // Fallback: subscribe without override so at least the global app webhook receives events.
        try {
          await axios.post(
            `${META_GRAPH_URL}/${wabaId}/subscribed_apps`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
        } catch (err2) {
          console.error('Error subscribing app to WABA:', err2.response?.data || err2.message);
        }
      }
    }

    const connectionMethod = coexistence ? 'coexistence' : 'embedded';

    // Update workspace with WhatsApp credentials
    workspace.whatsapp = {
      isConnected: true,
      connectionMethod,
      wabaId,
      phoneNumberId,
      businessAccountId,
      accessToken,
      phoneNumber,
      displayName,
      qualityRating: '',
      webhookSecret: workspace.whatsapp?.webhookSecret || '',
    };
    await workspace.save();

    res.json({
      success: true,
      data: {
        isConnected: true,
        connectionMethod,
        wabaId,
        phoneNumberId,
        phoneNumber,
        displayName,
        scopes: grantedScopes,
      },
    });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('Embedded signup error:', errMsg);
    res.status(500).json({ success: false, message: errMsg });
  }
};

// @GET /api/workspaces/:id/whatsapp/embedded-signup/config
// Returns the embedded signup configuration for the frontend SDK
const getEmbeddedSignupConfig = async (req, res) => {
  try {
    const settings = await SystemSettings.findOne();
    const appId = settings?.whatsapp?.appId || process.env.META_APP_ID || '';
    const configId = settings?.whatsapp?.configId || process.env.META_CONFIG_ID || '';
    const enableEmbeddedSignup = settings?.whatsapp?.enableEmbeddedSignup || false;
    const enableManualSignup = settings?.whatsapp?.enableManualSignup !== false;
    const enableCoexistence = settings?.whatsapp?.enableCoexistence || false;

    if (!appId && enableEmbeddedSignup) {
      return res.status(400).json({
        success: false,
        message: 'Meta App ID not configured',
      });
    }

    const webhookVerifyToken = settings?.whatsapp?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';
    const apiDomain = process.env.API_URL || process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${apiDomain}/api/webhook/whatsapp`;

    res.json({
      success: true,
      data: {
        appId,
        configId,
        enableEmbeddedSignup,
        enableManualSignup,
        enableCoexistence,
        webhookUrl,
        webhookVerifyToken,
        features: ['WHATSAPP_EMBEDDED_SIGNUP'],
        version: 'v21.0',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @POST /api/workspaces/:id/whatsapp/disconnect
const disconnectWhatsApp = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, message: 'Workspace not found' });
    }

    workspace.whatsapp = {
      isConnected: false,
      connectionMethod: '',
      wabaId: '',
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      phoneNumber: '',
      displayName: '',
      qualityRating: '',
      webhookSecret: workspace.whatsapp?.webhookSecret || '',
    };
    await workspace.save();

    res.json({ success: true, message: 'WhatsApp disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleEmbeddedSignup, getEmbeddedSignupConfig, disconnectWhatsApp };
