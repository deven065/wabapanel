const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const mongoose = require('mongoose');
const { protect, adminOnly } = require('../middleware/auth');
const Coupon = require('../models/Coupon');
const Announcement = require('../models/Announcement');
const SupportTicket = require('../models/SupportTicket');
const SystemSettings = require('../models/SystemSettings');

const BACKUP_DIR = '/var/backups/wabapanel';

// Email + in-app notification to the ticket owner. Fire-and-forget safe.
const notifyTicketUser = async (req, ticket, title, body) => {
  try {
    const userId = String(ticket.user._id || ticket.user);
    const io = req.app.get('io');
    if (io) io.to('user:' + userId).emit('support_ticket_update', {
      ticketId: ticket._id, ticketNumber: ticket.ticketNumber, subject: ticket.subject, status: ticket.status, title, body,
    });
    const User = require('../models/User');
    const u = await User.findById(userId).select('email').lean();
    if (u?.email) {
      await require('../services/systemMailer').sendRawEmail(u.email, title,
        `<p>${body}</p><p style="color:#6b7280;font-size:13px">Ticket ${ticket.ticketNumber} — ${ticket.subject}</p>`);
    }
  } catch (e) { console.error('[ticketNotify]', e.message); }
};

router.use(protect);

// ---------- Announcements (vendor) ----------
router.get('/announcements/active', async (req, res) => {
  try {
    const now = new Date();
    const items = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 }).limit(5);
    res.json({ success: true, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Coupons (vendor: validate) ----------
router.post('/coupons/validate', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const amount = Number(req.body.amount || 0);
    const planId = req.body.planId ? String(req.body.planId) : '';
    if (!code) return res.status(400).json({ success: false, message: 'Enter a coupon code' });
    const coupon = await Coupon.findOne({ code, isActive: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return res.status(400).json({ success: false, message: 'This coupon has expired' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ success: false, message: 'This coupon has reached its usage limit' });
    const applicable = Array.isArray(coupon.applicablePlans) ? coupon.applicablePlans : [];
    if (planId && applicable.length > 0 && !applicable.some((p) => String(p) === planId)) {
      return res.status(400).json({ success: false, message: 'This coupon is not valid for the selected plan' });
    }
    const discount = coupon.discountType === 'percent'
      ? Math.round((amount * coupon.discountValue) / 100)
      : Math.min(coupon.discountValue, amount);
    res.json({ success: true, data: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discount, finalAmount: Math.max(0, amount - discount) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Support tickets (vendor) ----------
router.get('/support', async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id }).sort({ updatedAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/support', async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, message: 'Subject and message are required' });
    const ticket = await SupportTicket.create({
      user: req.user._id, subject, category: category || 'other', priority: priority || 'medium',
      status: 'open',
      messages: [{ sender: 'user', senderName: req.user.name || req.user.email, text: message }],
    });
    require('../services/adminNotify').notifyAdmin('New support ticket', ['Subject: ' + (ticket.subject || ''), 'From: ' + (req.user ? req.user.email : '')], '/admin/support').catch(() => {});
    res.json({ success: true, data: ticket, message: 'Ticket created. Our team will reply soon.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/support/:id/reply', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (ticket.status === 'closed') return res.status(400).json({ success: false, message: 'Ticket is closed. Open a new ticket.' });
    if (!req.body.message) return res.status(400).json({ success: false, message: 'Message is required' });
    ticket.messages.push({ sender: 'user', senderName: req.user.name || req.user.email, text: req.body.message });
    ticket.status = 'awaiting_reply';
    await ticket.save();
    require('../services/adminNotify').notifyAdmin('Support ticket reply', ['Ticket: ' + ticket.ticketNumber, 'Subject: ' + ticket.subject, 'From: ' + (req.user?.email || ''), 'Message: ' + String(req.body.message).slice(0, 200)], '/admin/support').catch(() => {});
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/support/:id/close', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id }, { status: 'closed' }, { new: true });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/support/:id/reopen', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: 'closed' }, { status: 'open' }, { new: true });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    require('../services/adminNotify').notifyAdmin('Support ticket reopened', ['Ticket: ' + ticket.ticketNumber, 'Subject: ' + ticket.subject, 'By: ' + (req.user?.email || '')], '/admin/support').catch(() => {});
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ================= ADMIN =================
router.use(adminOnly);

// ---------- Coupons CRUD ----------
router.get('/admin/coupons', async (req, res) => {
  try { res.json({ success: true, data: await Coupon.find().sort({ createdAt: -1 }) }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/admin/coupons', async (req, res) => {
  try {
    const c = await Coupon.create({ ...req.body, code: String(req.body.code || '').toUpperCase() });
    res.json({ success: true, data: c });
  } catch (e) { res.status(400).json({ success: false, message: e.code === 11000 ? 'Coupon code already exists' : e.message }); }
});
router.put('/admin/coupons/:id', async (req, res) => {
  try { res.json({ success: true, data: await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
  catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
router.delete('/admin/coupons/:id', async (req, res) => {
  try { await Coupon.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Announcements CRUD ----------
router.get('/admin/announcements', async (req, res) => {
  try { res.json({ success: true, data: await Announcement.find().sort({ createdAt: -1 }) }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/admin/announcements', async (req, res) => {
  try { res.json({ success: true, data: await Announcement.create({ ...req.body, createdBy: req.user._id }) }); }
  catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
router.put('/admin/announcements/:id', async (req, res) => {
  try { res.json({ success: true, data: await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
  catch (e) { res.status(400).json({ success: false, message: e.message }); }
});
router.delete('/admin/announcements/:id', async (req, res) => {
  try { await Announcement.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Support tickets (admin) ----------
router.get('/admin/support', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const tickets = await SupportTicket.find(filter).populate('user', 'name email companyName').sort({ updatedAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/admin/support/:id/reply', async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!req.body.message) return res.status(400).json({ success: false, message: 'Message is required' });
    ticket.messages.push({ sender: 'admin', senderName: req.user.name || 'Support', text: req.body.message });
    ticket.status = 'answered';
    await ticket.save();
    notifyTicketUser(req, ticket, 'Support replied to your ticket', String(req.body.message).slice(0, 300)).catch(() => {});
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.put('/admin/support/:id/status', async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    notifyTicketUser(req, ticket, 'Your support ticket is now ' + String(req.body.status || '').replace('_', ' '), 'Ticket status updated by support team.').catch(() => {});
    res.json({ success: true, data: ticket });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Backups ----------
function findMongodump() {
  const candidates = ['mongodump', '/usr/bin/mongodump', '/usr/local/bin/mongodump', '/snap/bin/mongodump', '/opt/mongodb-database-tools/bin/mongodump'];
  for (const c of candidates) {
    try { require('child_process').execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 10000 }); return c; } catch (e) { /* try next */ }
  }
  return '';
}

// Dump every collection as gzipped JSON over the existing mongoose connection.
// Used when mongodump is not installed so backups still work on minimal installs.
async function nodeNativeBackup(file) {
  const mongoose = require('mongoose');
  const zlib = require('zlib');
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const collections = await db.listCollections().toArray();
  const gz = zlib.createGzip();
  const outStream = fs.createWriteStream(file);
  gz.pipe(outStream);
  const write = (chunk) => new Promise((resolve, reject) => gz.write(chunk, (e) => (e ? reject(e) : resolve())));
  await write('{"format":"wabapanel-json-backup","createdAt":' + JSON.stringify(new Date().toISOString()) + ',"collections":{');
  for (let i = 0; i < collections.length; i++) {
    const name = collections[i].name;
    await write((i ? ',' : '') + JSON.stringify(name) + ':[');
    const cursor = db.collection(name).find({});
    let first = true;
    for await (const doc of cursor) {
      await write((first ? '' : ',') + JSON.stringify(doc));
      first = false;
    }
    await write(']');
  }
  await write('}}');
  await new Promise((resolve, reject) => { outStream.on('finish', resolve); outStream.on('error', reject); gz.end(); });
  return file;
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.gz')).sort();
  while (files.length > 10) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}

function runBackup() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const bin = findMongodump();
    const dbName = require('mongoose').connection.name || 'wabapanel';
    const jsonFallback = () => {
      const jfile = path.join(BACKUP_DIR, `wabapanel-${stamp}.json.gz`);
      nodeNativeBackup(jfile).then(() => { pruneBackups(); resolve(jfile); }).catch(reject);
    };
    if (!bin) return jsonFallback();
    const file = path.join(BACKUP_DIR, `wabapanel-${stamp}.gz`);
    execFile(bin, ['--db', dbName, `--archive=${file}`, '--gzip'], { timeout: 10 * 60 * 1000 }, (err) => {
      if (!err) { pruneBackups(); return resolve(file); }
      // mongodump exists but failed (auth/URI mismatch) — use the native dump.
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) { /* noop */ }
      jsonFallback();
    });
  });
}

router.get('/admin/backups', async (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.gz')).sort().reverse().map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, createdAt: st.mtime };
    });
    res.json({ success: true, data: files });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/admin/backups', async (req, res) => {
  try { const file = await runBackup(); res.json({ success: true, message: 'Backup created', data: { name: path.basename(file) } }); }
  catch (e) { res.status(500).json({ success: false, message: 'Backup failed: ' + e.message }); }
});
router.get('/admin/backups/:name/download', async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(BACKUP_DIR, name);
  if (!name.endsWith('.gz') || !fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Backup not found' });
  res.download(file, name);
});
router.delete('/admin/backups/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(BACKUP_DIR, name);
  if (!name.endsWith('.gz') || !fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Backup not found' });
  fs.unlinkSync(file);
  res.json({ success: true });
});

// ---------- System health ----------
router.get('/admin/health', async (req, res) => {
  try {
    const disk = await new Promise((resolve) => {
      execFile('df', ['-h', '/'], (err, out) => {
        if (err || !out) return resolve(null);
        const parts = out.trim().split('\n').pop().split(/\s+/);
        resolve({ total: parts[1], used: parts[2], available: parts[3], usedPercent: parts[4] });
      });
    });
    const pm2 = await new Promise((resolve) => {
      execFile('pm2', ['jlist'], { timeout: 15000 }, (err, out) => {
        if (err || !out) return resolve([]);
        try {
          resolve(JSON.parse(out).map(p => ({
            name: p.name, status: p.pm2_env && p.pm2_env.status,
            uptime: p.pm2_env && p.pm2_env.pm_uptime, restarts: p.pm2_env && p.pm2_env.restart_time,
            memory: p.monit && p.monit.memory, cpu: p.monit && p.monit.cpu,
          })));
        } catch { resolve([]); }
      });
    });
    res.json({
      success: true,
      data: {
        server: {
          uptime: os.uptime(),
          loadAvg: os.loadavg(),
          totalMem: os.totalmem(),
          freeMem: os.freemem(),
          cpus: os.cpus().length,
          nodeVersion: process.version,
        },
        db: { state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown' },
        disk, pm2,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Comprehensive server health scan (server-health.sh) ----------
const SH_SCRIPT = path.join(__dirname, '..', 'scripts', 'server-health.sh');
let shReportCache = { at: 0, data: null };
router.get('/admin/health-report', async (req, res) => {
  try {
    if (Date.now() - shReportCache.at < 60000 && shReportCache.data && !req.query.force) {
      return res.json({ success: true, cached: true, data: shReportCache.data });
    }
    if (!fs.existsSync(SH_SCRIPT)) {
      return res.status(501).json({ success: false, message: 'health scanner not installed' });
    }
    const outDir = path.join(os.tmpdir(), 'shr-' + Date.now());
    const host = String(req.get('host') || '').split(':')[0];
    const data = await new Promise((resolve) => {
      const args = [SH_SCRIPT, '-q', '--no-color', '-f', 'json', '-o', outDir];
      if (host && /^[a-z0-9.-]+$/i.test(host) && host !== 'localhost' && host !== '127.0.0.1') {
        args.push('-w', 'https://' + host);
      }
      execFile('bash', args, { timeout: 90000, maxBuffer: 8 * 1024 * 1024 }, () => {
        try {
          const files = (fs.readdirSync(outDir) || []).filter((f) => f.endsWith('.json'));
          if (!files.length) return resolve(null);
          resolve(JSON.parse(fs.readFileSync(path.join(outDir, files[0]), 'utf8')));
        } catch { resolve(null); }
        finally { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {} }
      });
    });
    if (!data) return res.status(500).json({ success: false, message: 'health scan produced no report' });
    shReportCache = { at: Date.now(), data };
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Maintenance mode ----------
router.get('/admin/maintenance', async (req, res) => {
  try {
    const s = await SystemSettings.findOne();
    res.json({ success: true, data: (s && s.maintenance) || { isEnabled: false, message: '' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.put('/admin/maintenance', async (req, res) => {
  try {
    const s = (await SystemSettings.findOne()) || new SystemSettings();
    s.maintenance = { isEnabled: !!req.body.isEnabled, message: req.body.message || 'We are currently under maintenance. Please check back later.' };
    await s.save();
    resetMaintenanceCache();
    res.json({ success: true, data: s.maintenance });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ---------- Maintenance guard middleware + cron backup (exported) ----------
let maintCache = { at: 0, value: null };
function resetMaintenanceCache() { maintCache = { at: 0, value: null }; }

async function getMaintenance() {
  if (Date.now() - maintCache.at < 30000 && maintCache.value) return maintCache.value;
  try {
    const s = await SystemSettings.findOne().select('maintenance').lean();
    maintCache = { at: Date.now(), value: (s && s.maintenance) || { isEnabled: false } };
  } catch { maintCache = { at: Date.now(), value: { isEnabled: false } }; }
  return maintCache.value;
}

// Blocks non-admin API traffic while maintenance mode is on.
async function maintenanceGuard(req, res, next) {
  const p = req.path || '';
  if (p.startsWith('/api/auth') || p.startsWith('/api/admin') || p.startsWith('/api/webhook') || p.startsWith('/api/platform')) return next();
  const m = await getMaintenance();
  if (m && m.isEnabled) {
    return res.status(503).json({ success: false, maintenance: true, message: m.message || 'We are currently under maintenance. Please check back later.' });
  }
  next();
}

// Public (unauthenticated) maintenance status for the frontend overlay.
async function maintenanceStatus(req, res) {
  const m = await getMaintenance();
  res.json({ success: true, data: { isEnabled: !!(m && m.isEnabled), message: (m && m.message) || '' } });
}

module.exports = { router, maintenanceGuard, maintenanceStatus, runBackup };
