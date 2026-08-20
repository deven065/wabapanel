const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const tgUser = require('../services/tgUserService');

router.use(protect, workspaceAccess);

// QR login (like Telegram Desktop) — scan from Telegram app > Settings > Devices
router.post('/connect-qr', async (req, res) => {
  try {
    const status = await tgUser.startQrLogin(req.workspace._id, req.body || {});
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Start login: sends the OTP code to the phone's Telegram app
router.post('/connect', async (req, res) => {
  try {
    const { apiId, apiHash, phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });
    const status = await tgUser.startLogin(req.workspace._id, { apiId, apiHash, phone });
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Submit the OTP code
router.post('/code', async (req, res) => {
  try {
    if (!req.body.code) return res.status(400).json({ success: false, message: 'Code is required' });
    tgUser.submitCode(req.workspace._id, req.body.code);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// Submit the 2FA password (if the account has one)
router.post('/password', async (req, res) => {
  try {
    if (!req.body.password) return res.status(400).json({ success: false, message: 'Password is required' });
    tgUser.submitPassword(req.workspace._id, req.body.password);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

router.get('/status', async (req, res) => {
  try {
    const status = await tgUser.getStatus(req.workspace._id);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Logout and remove the session
router.post('/disconnect', async (req, res) => {
  try {
    await tgUser.disconnect(req.workspace._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
