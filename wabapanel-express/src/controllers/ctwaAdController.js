const CTWAAd = require("../models/CTWAAd");
const axios = require("axios");

const GRAPH_API = "https://graph.facebook.com/v21.0";

// Collect every ad account the token can reach: directly assigned (me/adaccounts)
// plus every Business Manager's owned + client ad accounts.
async function collectAdAccounts(accessToken) {
  const fields = "id,name,account_status,currency,business";
  const byId = new Map();
  const add = (arr) => { for (const a of (arr || [])) if (a && a.id && !byId.has(a.id)) byId.set(a.id, a); };

  // 1. Directly assigned ad accounts
  try {
    const r = await axios.get(`${GRAPH_API}/me/adaccounts`, {
      params: { access_token: accessToken, fields, limit: 500 },
    });
    add(r.data?.data);
  } catch { /* ignore */ }

  // 2. Every Business Manager the token can access -> owned + client ad accounts
  try {
    const bizRes = await axios.get(`${GRAPH_API}/me/businesses`, {
      params: { access_token: accessToken, fields: "id,name", limit: 100 },
    });
    const businesses = bizRes.data?.data || [];
    for (const biz of businesses) {
      for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
        try {
          const r = await axios.get(`${GRAPH_API}/${biz.id}/${edge}`, {
            params: { access_token: accessToken, fields, limit: 500 },
          });
          add(r.data?.data);
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return Array.from(byId.values());
}

// Sync ads from Meta Ads API
exports.syncFromMeta = async (req, res) => {
  try {
    const workspace = req.workspace;
    if (!workspace.whatsapp?.isConnected || !workspace.whatsapp?.accessToken) {
      return res.status(400).json({ success: false, message: "WhatsApp not connected. Please connect WhatsApp first." });
    }

    const accessToken = workspace.whatsapp.adsAccessToken || workspace.whatsapp.accessToken;

    // Resolve which ad account(s) to sync: explicit list, single, "all", or default first.
    const body = req.body || {};
    let accountIds = [];
    if (Array.isArray(body.adAccountIds) && body.adAccountIds.length) {
      accountIds = body.adAccountIds.filter(Boolean);
    } else if (body.adAccountId && body.adAccountId !== "all") {
      accountIds = [body.adAccountId];
    }
    if (!accountIds.length || body.adAccountId === "all") {
      const all = await collectAdAccounts(accessToken);
      if (!all.length) {
        return res.status(400).json({
          success: false,
          message: "No ad accounts found. Make sure your access token has ads_read permission and the ad accounts are assigned to it in Meta Business Settings.",
        });
      }
      accountIds = body.adAccountId === "all" || (Array.isArray(body.adAccountIds) && body.adAccountIds.includes("all"))
        ? all.map(a => a.id)
        : (accountIds.length ? accountIds : [all[0].id]);
    }

    // Insights date range: preset (default lifetime) or explicit since/until
    const datePreset = body.datePreset || "maximum";
    const insightsRange = body.since && body.until
      ? { time_range: JSON.stringify({ since: body.since, until: body.until }) }
      : { date_preset: datePreset };

    const statusMap = { ACTIVE: "active", PAUSED: "paused", DELETED: "completed", ARCHIVED: "completed" };
    const synced = [];
    const accountErrors = [];

    for (const adAccountId of accountIds) {
      let campaigns = [];
      try {
        const campaignsRes = await axios.get(`${GRAPH_API}/${adAccountId}/campaigns`, {
          params: {
            access_token: accessToken,
            fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
            limit: 200,
          },
        });
        campaigns = campaignsRes.data?.data || [];
      } catch (err) {
        accountErrors.push(`${adAccountId}: ${err.response?.data?.error?.message || err.message}`);
        continue;
      }

      for (const camp of campaigns) {
        const insights = { impressions: 0, clicks: 0, spend: 0, conversions: 0 };
        try {
          const insightsRes = await axios.get(`${GRAPH_API}/${camp.id}/insights`, {
            params: { access_token: accessToken, fields: "impressions,clicks,spend,actions", ...insightsRange },
          });
          const insData = insightsRes.data?.data?.[0];
          if (insData) {
            insights.impressions = parseInt(insData.impressions || "0");
            insights.clicks = parseInt(insData.clicks || "0");
            insights.spend = parseFloat(insData.spend || "0");
            const convAction = (insData.actions || []).find(a => a.action_type === "onsite_conversion.messaging_conversation_started_7d");
            insights.conversions = convAction ? parseInt(convAction.value || "0") : 0;
          }
        } catch { /* insights may be unavailable */ }

        // Fetch one ad's creative so we can preview the ad (image, headline, text)
        const creative = { headline: "", description: "", mediaUrl: "", mediaType: "" };
        try {
          const adsRes = await axios.get(`${GRAPH_API}/${camp.id}/ads`, {
            params: { access_token: accessToken, fields: "creative{object_story_spec,image_url,thumbnail_url,body,title}", limit: 1 },
          });
          const cr = adsRes.data?.data?.[0]?.creative;
          if (cr) {
            const spec = cr.object_story_spec || {};
            const link = spec.link_data || spec.video_data || {};
            creative.headline = cr.title || link.name || "";
            creative.description = cr.body || link.message || "";
            creative.mediaUrl = cr.image_url || link.picture || cr.thumbnail_url || "";
            if (creative.mediaUrl) creative.mediaType = "image";
          }
        } catch { /* creative not accessible */ }

        const adData = {
          workspace: workspace._id,
          name: camp.name,
          adId: camp.id,
          adAccountId,
          platform: "facebook",
          status: statusMap[camp.status] || "draft",
          budget: parseFloat(camp.daily_budget || camp.lifetime_budget || "0") / 100,
          spent: insights.spend,
          impressions: insights.impressions,
          clicks: insights.clicks,
          conversions: insights.conversions,
          startDate: camp.start_time ? new Date(camp.start_time) : null,
          endDate: camp.stop_time ? new Date(camp.stop_time) : null,
          createdBy: req.user._id,
        };
        if (creative.mediaUrl) adData.mediaUrl = creative.mediaUrl;
        if (creative.mediaType) adData.mediaType = creative.mediaType;
        if (creative.headline) adData.headline = creative.headline;
        if (creative.description) adData.description = creative.description;

        const existing = await CTWAAd.findOneAndUpdate(
          { workspace: workspace._id, adId: camp.id },
          adData,
          { upsert: true, new: true }
        );
        synced.push(existing);
      }
    }

    res.json({
      success: true,
      data: synced,
      message: `Synced ${synced.length} campaigns from ${accountIds.length} ad account${accountIds.length > 1 ? "s" : ""}`,
      accountIds,
      accountErrors: accountErrors.length ? accountErrors : undefined,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to sync from Meta",
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

// Get ad accounts list
exports.getAdAccounts = async (req, res) => {
  try {
    const workspace = req.workspace;
    if (!workspace.whatsapp?.isConnected || !workspace.whatsapp?.accessToken) {
      return res.status(400).json({ success: false, message: "WhatsApp not connected" });
    }

    const accessToken = workspace.whatsapp.adsAccessToken || workspace.whatsapp.accessToken;
    const adAccounts = await collectAdAccounts(accessToken);
    res.json({ success: true, data: adAccounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all local ads
exports.getAll = async (req, res) => {
  try {
    const ads = await CTWAAd.find({ workspace: req.workspace._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: ads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create ad locally
exports.create = async (req, res) => {
  try {
    const ad = await CTWAAd.create({ ...req.body, workspace: req.workspace._id, createdBy: req.user._id });
    res.status(201).json({ success: true, data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update ad
exports.update = async (req, res) => {
  try {
    const ad = await CTWAAd.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    if (!ad) return res.status(404).json({ success: false, message: "Ad not found" });
    res.json({ success: true, data: ad });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Publish a locally-created campaign to Meta (created PAUSED for review)
exports.publishToMeta = async (req, res) => {
  try {
    const workspace = req.workspace;
    const wa = workspace.whatsapp || {};
    const accessToken = wa.adsAccessToken || wa.accessToken;
    if (!wa.isConnected || !accessToken) {
      return res.status(400).json({ success: false, message: "WhatsApp not connected" });
    }
    const ad = await CTWAAd.findOne({ _id: req.params.id, workspace: workspace._id });
    if (!ad) return res.status(404).json({ success: false, message: "Ad not found" });
    if (ad.adId) return res.status(400).json({ success: false, message: "Already published to Meta" });

    const adAccountId = (req.body && req.body.adAccountId) || ad.adAccountId;
    const pageId = ((req.body && req.body.pageId) || wa.adsPageId || "").trim();
    if (!adAccountId) return res.status(400).json({ success: false, message: "adAccountId is required" });
    if (!pageId) return res.status(400).json({ success: false, message: "Facebook Page ID is required to publish" });
    if (!ad.budget || ad.budget <= 0) return res.status(400).json({ success: false, message: "Set a budget before publishing" });

    // Remember page id for next time
    if (pageId !== wa.adsPageId) {
      workspace.whatsapp.adsPageId = pageId;
      await workspace.save();
    }

    const auth = { access_token: accessToken };
    const budgetPaise = Math.round(ad.budget * 100);

    // 1. Campaign (PAUSED)
    const campRes = await axios.post(`${GRAPH_API}/${adAccountId}/campaigns`, {
      ...auth,
      name: ad.name,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: [],
    });
    const campaignId = campRes.data.id;

    // 2. Ad Set (WhatsApp destination)
    const t = ad.targeting || {};
    const countryCodes = (t.locations || []).map(s => String(s).trim().toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s));
    const genders = t.gender === "male" ? [1] : t.gender === "female" ? [2] : undefined;
    const adsetBody = {
      ...auth,
      name: ad.name + " - Ad Set",
      campaign_id: campaignId,
      status: "PAUSED",
      billing_event: "IMPRESSIONS",
      optimization_goal: "CONVERSATIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "WHATSAPP",
      promoted_object: { page_id: pageId },
      targeting: {
        age_min: t.ageMin || 18,
        age_max: t.ageMax || 65,
        ...(genders ? { genders } : {}),
        geo_locations: { countries: countryCodes.length ? countryCodes : ["IN"] },
      },
    };
    if (ad.budgetType === "lifetime") {
      adsetBody.lifetime_budget = budgetPaise;
      adsetBody.start_time = ad.startDate ? new Date(ad.startDate).toISOString() : new Date().toISOString();
      adsetBody.end_time = ad.endDate ? new Date(ad.endDate).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString();
    } else {
      adsetBody.daily_budget = budgetPaise;
      if (ad.startDate) adsetBody.start_time = new Date(ad.startDate).toISOString();
      if (ad.endDate) adsetBody.end_time = new Date(ad.endDate).toISOString();
    }
    const adsetRes = await axios.post(`${GRAPH_API}/${adAccountId}/adsets`, adsetBody);
    const adsetId = adsetRes.data.id;

    // 3. Creative (click-to-WhatsApp)
    const linkData = {
      message: ad.description || ad.headline || ad.name,
      name: ad.headline || ad.name,
      link: "https://api.whatsapp.com/send",
      call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
    };
    if (ad.mediaUrl && ad.mediaType === "image") linkData.picture = ad.mediaUrl;
    const creativeRes = await axios.post(`${GRAPH_API}/${adAccountId}/adcreatives`, {
      ...auth,
      name: ad.name + " - Creative",
      object_story_spec: { page_id: pageId, link_data: linkData },
    });
    const creativeId = creativeRes.data.id;

    // 4. Ad (PAUSED)
    const adRes = await axios.post(`${GRAPH_API}/${adAccountId}/ads`, {
      ...auth,
      name: ad.name + " - Ad",
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    });

    ad.adId = campaignId;
    ad.adAccountId = adAccountId;
    ad.status = "paused";
    ad.publishError = "";
    await ad.save();

    res.json({ success: true, data: ad, message: "Published to Meta (PAUSED). Review and activate it when ready.", metaIds: { campaignId, adsetId, creativeId, adId: adRes.data.id } });
  } catch (err) {
    const metaErr = err.response?.data?.error;
    const msg = metaErr?.error_user_msg || metaErr?.message || err.message;
    try {
      const ad = await CTWAAd.findOne({ _id: req.params.id, workspace: req.workspace._id });
      if (ad) { ad.publishError = String(msg).slice(0, 500); await ad.save(); }
    } catch { /* noop */ }
    res.status(500).json({ success: false, message: "Failed to publish to Meta", error: msg });
  }
};

// Delete ad
exports.remove = async (req, res) => {
  try {
    const ad = await CTWAAd.findOneAndDelete({ _id: req.params.id, workspace: req.workspace._id });
    if (!ad) return res.status(404).json({ success: false, message: "Ad not found" });
    res.json({ success: true, message: "Ad deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
