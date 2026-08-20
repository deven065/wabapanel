const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();

const ROOT = path.join(__dirname, '..', '..');
const LOCK_FILE = path.join(ROOT, 'installed.lock');

const isInstalled = () => fs.existsSync(LOCK_FILE);

// GET /api/install/status  -> { installed: boolean }
router.get('/status', (req, res) => {
  res.json({ success: true, installed: isInstalled() });
});

// Run the seed script (plans, permissions, settings, default admin) in a child process.
function runSeed() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/seed.js'], { cwd: ROOT, env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error('Seed failed: ' + out.slice(-500)))));
  });
}

// POST /api/install/complete
// body: { siteName, adminName, adminEmail, adminPassword }
router.post('/complete', async (req, res) => {
  try {
    if (isInstalled()) {
      return res.status(400).json({ success: false, message: 'Already installed.' });
    }
    const { siteName, adminName, adminEmail, adminPassword } = req.body || {};
    if (!adminEmail || !adminPassword || String(adminPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Valid admin email and a password of at least 6 characters are required.' });
    }

    // 1. Seed base data (idempotent — safe to run once).
    await runSeed();

    // 2. Set the super-admin credentials to the ones provided.
    const User = require('../models/User');
    const Plan = require('../models/Plan');
    const freePlan = await Plan.findOne({ price: 0 });
    let admin = await User.findOne({ role: 'super_admin' });
    if (!admin) {
      admin = new User({ role: 'super_admin', status: 'active', plan: freePlan ? freePlan._id : undefined });
    }
    admin.name = adminName || 'Administrator';
    admin.email = String(adminEmail).toLowerCase().trim();
    admin.password = String(adminPassword); // hashed by the model's pre-save hook
    admin.status = 'active';
    await admin.save();

    // 3. Apply the site/brand name.
    if (siteName && String(siteName).trim()) {
      const SystemSettings = require('../models/SystemSettings');
      let settings = await SystemSettings.findOne();
      if (!settings) settings = new SystemSettings();
      settings.appName = String(siteName).trim();
      await settings.save();
    }

    // 4. Write the lock file so the installer cannot run again.
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ installedAt: new Date().toISOString(), siteName: siteName || '' }, null, 2));

    res.json({ success: true, message: 'Installation complete.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Installation failed.' });
  }
});

module.exports = router;
