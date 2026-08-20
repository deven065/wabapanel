const PushVapid = require('../models/PushVapid');
const PushSubscription = require('../models/PushSubscription');
const webpush = require('../utils/webpush');

async function getVapid() {
  let v = await PushVapid.findOne();
  if (!v || !v.publicKey || !v.privateJwk) {
    const keys = webpush.generateVapidKeys();
    v = await PushVapid.findOneAndUpdate(
      {},
      { publicKey: keys.publicKey, privateJwk: keys.privateJwk },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return v;
}

const vapidPublicKey = async (req, res) => {
  try {
    const v = await getVapid();
    res.json({ success: true, data: { publicKey: v.publicKey } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, user: req.user && req.user._id, workspace: req.workspace && req.workspace._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await PushSubscription.deleteOne({ endpoint });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Fire-and-forget Web Push to every subscription of a workspace. Never throws.
async function notifyWorkspace(workspaceId, notif) {
  try {
    const subs = await PushSubscription.find({ workspace: workspaceId }).lean();
    if (!subs.length) return;
    const v = await getVapid();
    const payload = JSON.stringify(notif || {});
    await Promise.all(
      subs.map(async (s) => {
        try {
          const r = await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys },
            payload,
            { publicKey: v.publicKey, privateJwk: v.privateJwk, subject: v.subject }
          );
          if (r.statusCode === 404 || r.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: s._id });
          }
        } catch (e) {
          /* noop */
        }
      })
    );
  } catch (e) {
    /* noop */
  }
}

module.exports = { vapidPublicKey, subscribe, unsubscribe, notifyWorkspace };
