/**
 * KKHS License Routes — Admin endpoints to manage license activation
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const kkhsService = require('../services/kkhsLicenseService');

const KKHS_ADDONS_URL = 'https://kkhsmedia.com/api/waba-panel-nodejs.php?action=get_addons';

// Middleware: require admin auth
const { protect, adminOnly } = require('../middleware/auth');

/**
 * GET /api/admin/kkhs-license/status
 * Get current license status
 */
router.get('/status', protect, adminOnly, async (req, res) => {
  try {
    const status = await kkhsService.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/activate
 * Activate a license key
 */
router.post('/activate', protect, adminOnly, async (req, res) => {
  try {
    const { licenseKey, adminEmail } = req.body;
    if (!licenseKey) return res.status(400).json({ success: false, message: 'License key required' });

    const result = await kkhsService.activate(licenseKey, adminEmail);
    if (result.success) {
      res.json({ success: true, message: result.message, license: result.license });
    } else {
      res.status(400).json({ success: false, message: result.error, code: result.code });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/deactivate
 * Deactivate license (for domain transfer)
 */
router.post('/deactivate', protect, adminOnly, async (req, res) => {
  try {
    const result = await kkhsService.deactivate();
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, message: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/verify
 * Quick verify license validity
 */
router.post('/verify', protect, adminOnly, async (req, res) => {
  try {
    const result = await kkhsService.verify();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/heartbeat
 * Manually trigger a heartbeat
 */
router.post('/heartbeat', protect, adminOnly, async (req, res) => {
  try {
    await kkhsService.doHeartbeat();
    res.json({ success: true, message: 'Heartbeat sent' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/kkhs-license/feature-locks
 * Get cached feature locks
 */
router.get('/feature-locks', protect, adminOnly, async (req, res) => {
  try {
    res.json({ success: true, data: kkhsService.getFeatureLocks() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/kkhs-license/remote-config
 * Get cached remote config
 */
router.get('/remote-config', protect, adminOnly, async (req, res) => {
  try {
    res.json({ success: true, data: kkhsService.getAllConfig() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/kkhs-license/notifications
 * Get notifications from KKHS
 */
router.get('/notifications', protect, adminOnly, async (req, res) => {
  try {
    res.json({ success: true, data: kkhsService.getNotifications() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/kkhs-license/addons
 * Get addon store items
 */
router.get('/addons', protect, adminOnly, async (req, res) => {
  try {
    let addons = null;
    try {
      const r = await axios.get(KKHS_ADDONS_URL, { timeout: 5000 });
      if (r.data && Array.isArray(r.data.addons)) {
        addons = r.data.addons
          .filter(a => Number(a.is_active) === 1)
          .map(a => ({
            id: a.id,
            slug: a.identifier,
            name: a.title,
            title: a.title,
            description: a.description,
            version: a.version,
            price: a.price,
            url: a.buy_url,
          }));
      }
    } catch (e) {
      addons = null;
    }
    if (!addons) addons = kkhsService.getAddons();
    res.json({ success: true, data: addons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/kkhs-license/check-updates
 * Check for available updates from KKHS server
 */
router.get('/check-updates', protect, adminOnly, async (req, res) => {
  try {
    const result = await kkhsService.checkForUpdates();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/install-update
 * Install a specific patch
 */
router.post('/install-update', protect, adminOnly, async (req, res) => {
  try {
    const { patchId } = req.body;
    if (!patchId) return res.status(400).json({ success: false, message: 'Patch ID required' });
    const result = await kkhsService.installUpdate(patchId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/upload-patch
 * Upload a patch ZIP and apply it
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const patchUpload = multer({ dest: '/tmp/patches/', limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/upload-patch', protect, adminOnly, patchUpload.single('patch'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const version = req.body.version || ('manual-' + Date.now());
    const projectRoot = path.join(__dirname, '../..');

    // Backup before applying
    const backupDir = path.join(projectRoot, 'patch_backups', version);
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    try {
      const filesToPatch = execSync(`unzip -l "${req.file.path}" | awk 'NR>3 && !/\\/$/ && $NF!="" {print $NF}' | head -500`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const f of filesToPatch) {
        const srcFile = path.join(projectRoot, f);
        if (fs.existsSync(srcFile)) {
          const destFile = path.join(backupDir, f);
          const destDir = path.dirname(destFile);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(srcFile, destFile);
        }
      }
      fs.writeFileSync(path.join(backupDir, '_patch_meta.json'), JSON.stringify({ version, appliedAt: new Date().toISOString(), files: filesToPatch }));
    } catch(backupErr) { console.error('[KKHS] Backup warning:', backupErr.message); }

    execSync(`unzip -o "${req.file.path}" -d "${projectRoot}"`, { stdio: 'ignore' });
    fs.unlinkSync(req.file.path);
    const SystemSettings = require('../models/SystemSettings');
    await SystemSettings.findOneAndUpdate({}, { $set: { kkhsLastPatchVersion: version, kkhsLastPatchAt: new Date() } });
    res.json({ success: true, message: `Patch ${version} applied. Panel will restart.` });
    setTimeout(() => { process.exit(0); }, 2000);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/apply-frontend-patch
 * Upload a frontend patch ZIP (paths relative to the frontend root, e.g. src/...),
 * apply it to the Next.js frontend, rebuild, and restart the frontend process.
 * On build failure the previous files are restored and the old build keeps running.
 */
const findFrontendDir = () => {
  const projectRoot = path.join(__dirname, '../..');
  const candidates = [
    path.join(projectRoot, '..', 'wabapanel-frontend'),
    path.join(projectRoot, '..', 'frontend'),
  ];
  try {
    for (const d of fs.readdirSync(path.join(projectRoot, '..'))) {
      candidates.push(path.join(projectRoot, '..', d));
    }
  } catch (e) { /* ignore */ }
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.dependencies && pkg.dependencies.next) return dir;
    } catch (e) { /* not a frontend dir */ }
  }
  return null;
};

// Find the pm2 process(es) that serve the Next.js frontend. Matching only on an
// exact pm_cwd is fragile (symlinks, trailing slashes, process started from a
// parent dir), which previously left the frontend running an old build after a
// swap — the server kept emitting HTML that referenced CSS/JS the new build had
// deleted (404s / broken design). Match robustly, then fall back to any process
// that clearly runs `next`.
const frontendProcs = (list, frontendDir) => {
  const norm = (s) => (s || '').replace(/\/+$/, '');
  let real = frontendDir;
  try { real = fs.realpathSync(frontendDir); } catch (e) { /* ignore */ }
  const fd = norm(frontendDir), rd = norm(real);
  let procs = list.filter((p) => {
    const cwd = norm(p.pm2_env && p.pm2_env.pm_cwd);
    let rcwd = cwd;
    try { rcwd = norm(fs.realpathSync(cwd)); } catch (e) { /* ignore */ }
    return cwd === fd || cwd === rd || rcwd === fd || rcwd === rd
      || cwd.startsWith(fd + '/') || cwd.startsWith(rd + '/');
  });
  if (!procs.length) {
    procs = list.filter((p) => {
      const s = ((p.pm2_env && p.pm2_env.pm_exec_path) || '') + ' '
        + (((p.pm2_env && p.pm2_env.args) || []).join(' '));
      return /\bnext\b/i.test(s) && !/express|\bapi\b|server\.js/i.test(s);
    });
  }
  return procs;
};

const restartFrontendProcs = (frontendDir) => {
  let restarted = '';
  try {
    const list = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
    for (const p of frontendProcs(list, frontendDir)) {
      try { execSync(`pm2 restart ${p.pm_id}`, { stdio: 'ignore' }); restarted += p.name + ' '; } catch (e) { /* ignore */ }
    }
  } catch (e) { /* pm2 not available */ }
  return restarted.trim();
};

// Self-heal on startup: if the frontend .next was rebuilt AFTER the frontend
// process last started, that process is serving a stale build (broken CSS/JS).
// Restart it once so it picks up the fresh build. Runs shortly after boot, so a
// simple backend update is enough to repair any panel left in this state.
const ensureFrontendFresh = () => {
  try {
    const frontendDir = findFrontendDir();
    if (!frontendDir) return;
    const buildIdPath = path.join(frontendDir, '.next', 'BUILD_ID');
    if (!fs.existsSync(buildIdPath)) return;
    const builtAt = fs.statSync(buildIdPath).mtimeMs;
    const list = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
    for (const p of frontendProcs(list, frontendDir)) {
      const startedAt = Number(p.pm2_env && p.pm2_env.pm_uptime) || 0;
      if (startedAt && builtAt > startedAt + 5000) {
        try { execSync(`pm2 restart ${p.pm_id}`, { stdio: 'ignore' }); console.log('[KKHS] self-heal: restarted stale frontend', p.name); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore */ }
};
setTimeout(ensureFrontendFresh, 30 * 1000);

// patch_backups holds copies of patched sources; it must be excluded from the
// Next.js/TypeScript build or type-checking fails on the backup copies.
const ensureTsconfigExclude = (frontendDir) => {
  try {
    const tsPath = path.join(frontendDir, 'tsconfig.json');
    const ts = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
    ts.exclude = Array.isArray(ts.exclude) ? ts.exclude : [];
    if (!ts.exclude.includes('patch_backups')) {
      ts.exclude.push('patch_backups');
      fs.writeFileSync(tsPath, JSON.stringify(ts, null, 2));
    }
  } catch (e) { /* no tsconfig */ }
};

// Make the stock (empty) Next.js config honour NEXT_DIST_DIR so a patch can be
// built into a shadow directory while the live .next keeps serving. Only the
// untouched product config is auto-managed, to avoid clobbering customizations.
const ensureDistDirSupport = (frontendDir) => {
  try {
    const cfgPath = path.join(frontendDir, 'next.config.mjs');
    if (!fs.existsSync(cfgPath)) return false;
    let cfg = fs.readFileSync(cfgPath, 'utf8');
    if (cfg.includes('NEXT_DIST_DIR')) return true;
    if (!/const\s+nextConfig\s*=\s*\{\s*\}\s*;/.test(cfg)) return false;
    fs.writeFileSync(cfgPath + '.orig', cfg);
    cfg = cfg.replace(/const\s+nextConfig\s*=\s*\{\s*\}\s*;/,
      "const nextConfig = { distDir: process.env.NEXT_DIST_DIR || '.next' };");
    fs.writeFileSync(cfgPath, cfg);
    return true;
  } catch (e) { return false; }
};

// Run the frontend build OUTSIDE the API event loop. execSync froze every
// request (login/API 504) for the whole multi-minute build; a spawned child we
// await lets Node keep serving requests while it builds. Builds are serialized
// so two patches can never run `npm run build` at once (which would corrupt the
// shadow .next_build).
let _feBuildChain = Promise.resolve();
const runFrontendBuild = (cwd, env) => {
  const task = () => new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn('npm', ['run', 'build'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const cap = (d) => { out += d.toString(); if (out.length > 40000) out = out.slice(-40000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) { /* noop */ } reject(new Error('Frontend build timed out after 15m. ' + out.slice(-2000))); }, 15 * 60 * 1000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error('Frontend build exited ' + code + '. ' + out.slice(-2000))); });
  });
  const runP = _feBuildChain.then(task, task);
  _feBuildChain = runP.then(() => {}, () => {});
  return runP;
};

const applyFrontendZip = async (zipPath, version) => {
  const frontendDir = findFrontendDir();
  if (!frontendDir) throw new Error('Frontend directory not found on this server');
  ensureTsconfigExclude(frontendDir);

  const filesToPatch = execSync(`unzip -l "${zipPath}" | awk 'NR>3 && !/\\/$/ && $NF!="" {print $NF}' | head -500`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

  // Backup current files so a failed build can be rolled back
  const backupDir = path.join(frontendDir, 'patch_backups', version);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of filesToPatch) {
    const srcFile = path.join(frontendDir, f);
    if (fs.existsSync(srcFile)) {
      const destFile = path.join(backupDir, f);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(srcFile, destFile);
    }
  }

  execSync(`unzip -o "${zipPath}" -d "${frontendDir}"`, { stdio: 'ignore' });

  // Build into a shadow directory (.next_build) so the live .next keeps serving
  // the working UI for the whole build; only swap it in once the build succeeds.
  // This avoids the blank-screen/broken-CSS window while a rebuild is running.
  const shadow = ensureDistDirSupport(frontendDir);
  const shadowDir = path.join(frontendDir, '.next_build');
  if (shadow) { try { fs.rmSync(shadowDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  try {
    await runFrontendBuild(frontendDir, { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048', ...(shadow ? { NEXT_DIST_DIR: '.next_build' } : {}) });
  } catch (e) {
    for (const f of filesToPatch) {
      const bak = path.join(backupDir, f);
      if (fs.existsSync(bak)) fs.copyFileSync(bak, path.join(frontendDir, f));
    }
    if (shadow) { try { fs.rmSync(shadowDir, { recursive: true, force: true }); } catch (er) { /* ignore */ } }
    throw new Error('Frontend build failed; previous files restored. ' + (e.message || '').slice(-2000));
  }

  // Atomically swap the freshly built shadow dir into place as .next
  if (shadow && fs.existsSync(shadowDir)) {
    const nextDir = path.join(frontendDir, '.next');
    const oldDir = path.join(frontendDir, '.next_old_' + Date.now());
    try {
      if (fs.existsSync(nextDir)) fs.renameSync(nextDir, oldDir);
      fs.renameSync(shadowDir, nextDir);
      try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    } catch (e) {
      // Swap failed: keep whatever .next is present and continue to restart.
    }
  }

  // Mark the version applied only once the build succeeded. Writing it earlier
  // made an interrupted build (server restart mid-build) look applied forever,
  // leaving the panel serving the old compiled UI with no retry.
  fs.writeFileSync(path.join(backupDir, '_patch_meta.json'), JSON.stringify({ version, appliedAt: new Date().toISOString(), files: filesToPatch }));

  // Restart the pm2 process(es) that serve the frontend (robust matching).
  return restartFrontendProcs(frontendDir);
};

// Panels patched by the earlier updater can carry an "applied" marker whose
// build never finished, so the compiled UI stays older than the patched source.
// Rebuild once when the newest marker is newer than the live build.
const rebuildIfStale = async () => {
  const frontendDir = findFrontendDir();
  if (!frontendDir) return;
  const backupsRoot = path.join(frontendDir, 'patch_backups');
  if (!fs.existsSync(backupsRoot)) return;
  let newest = 0;
  let newestVersion = '';
  for (const d of fs.readdirSync(backupsRoot)) {
    const meta = path.join(backupsRoot, d, '_patch_meta.json');
    if (!fs.existsSync(meta)) continue;
    const t = fs.statSync(meta).mtimeMs;
    if (t > newest) { newest = t; newestVersion = d; }
  }
  if (!newest) return;
  let built = 0;
  try { built = fs.statSync(path.join(frontendDir, '.next', 'BUILD_ID')).mtimeMs; } catch (e) { /* no build yet */ }
  if (built >= newest) return;
  console.log('[KKHS] Compiled UI is older than the applied patches - rebuilding');
  ensureTsconfigExclude(frontendDir);
  const shadow = ensureDistDirSupport(frontendDir);
  const shadowDir = path.join(frontendDir, '.next_build');
  if (shadow) { try { fs.rmSync(shadowDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } }
  try {
    await runFrontendBuild(frontendDir, { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048', ...(shadow ? { NEXT_DIST_DIR: '.next_build' } : {}) });
  } catch (e) {
    console.error('[KKHS] Stale-build rebuild failed:', e.message);
    if (shadow) { try { fs.rmSync(shadowDir, { recursive: true, force: true }); } catch (er) { /* ignore */ } }
    reportUpdate(newestVersion, 'frontend', false, 'stale build rebuild failed: ' + e.message).catch(() => {});
    return;
  }
  if (shadow && fs.existsSync(shadowDir)) {
    const nextDir = path.join(frontendDir, '.next');
    const oldDir = path.join(frontendDir, '.next_old_' + Date.now());
    try {
      if (fs.existsSync(nextDir)) fs.renameSync(nextDir, oldDir);
      fs.renameSync(shadowDir, nextDir);
      try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    } catch (e) { /* keep serving whatever .next exists */ }
  }
  restartFrontendProcs(frontendDir);
  reportUpdate(newestVersion, 'frontend', true, 'stale build rebuilt').catch(() => {});
  console.log('[KKHS] Stale UI rebuilt');
};

const frontendPatchApplied = (version) => {
  const frontendDir = findFrontendDir();
  if (!frontendDir) return true; // nothing to do on API-only installs
  return fs.existsSync(path.join(frontendDir, 'patch_backups', version, '_patch_meta.json'));
};

router.post('/apply-frontend-patch', protect, adminOnly, patchUpload.single('patch'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const version = req.body.version || ('frontend-' + Date.now());
    const restarted = await applyFrontendZip(req.file.path, version);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: `Frontend patch ${version} applied and built.` + (restarted ? ` Restarted: ${restarted}` : ' Restart the frontend process manually.') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Frontend build diagnostics: async rebuild with a persisted log so the
// result can be checked even when the HTTP request times out at the proxy.
const FE_LOG = path.join(__dirname, '../../fe_rebuild.log');
router.get('/frontend-status', protect, adminOnly, async (req, res) => {
  try {
    const frontendDir = findFrontendDir();
    const out = { frontendDir };
    if (frontendDir) {
      try { out.buildId = fs.readFileSync(path.join(frontendDir, '.next', 'BUILD_ID'), 'utf8').trim(); } catch (e) { out.buildId = null; }
      try { out.buildMtime = fs.statSync(path.join(frontendDir, '.next', 'BUILD_ID')).mtime; } catch (e) { /* ignore */ }
      try {
        const list = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
        out.pm2 = list.map(p => ({ name: p.name, cwd: p.pm2_env?.pm_cwd, status: p.pm2_env?.status, uptime: p.pm2_env?.pm_uptime }));
      } catch (e) { out.pm2Error = e.message; }
    }
    try { out.log = fs.readFileSync(FE_LOG, 'utf8').slice(-4000); } catch (e) { /* no log */ }
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/frontend-rebuild', protect, adminOnly, async (req, res) => {
  try {
    const frontendDir = findFrontendDir();
    if (!frontendDir) return res.status(404).json({ success: false, message: 'Frontend directory not found' });
    const { spawn } = require('child_process');
    ensureTsconfigExclude(frontendDir);
    fs.writeFileSync(FE_LOG, `[${new Date().toISOString()}] rebuild started\n`);
    const logFd = fs.openSync(FE_LOG, 'a');
    const restartScript =
      `const fs=require('fs');const l=require('/tmp/_pm2list.json');const{execSync}=require('child_process');` +
      `const norm=s=>(s||'').replace(/\\/+$/,'');const fd=norm('${frontendDir}');let rd=fd;try{rd=norm(fs.realpathSync('${frontendDir}'))}catch(e){}` +
      `let procs=l.filter(p=>{const c=norm(p.pm2_env&&p.pm2_env.pm_cwd);let rc=c;try{rc=norm(fs.realpathSync(c))}catch(e){}return c===fd||c===rd||rc===fd||rc===rd||c.startsWith(fd+'/')||c.startsWith(rd+'/')});` +
      `if(!procs.length){procs=l.filter(p=>{const s=((p.pm2_env&&p.pm2_env.pm_exec_path)||'')+' '+(((p.pm2_env&&p.pm2_env.args)||[]).join(' '));return /\\bnext\\b/i.test(s)&&!/express|\\bapi\\b|server\\.js/i.test(s)})}` +
      `for(const p of procs){try{execSync('pm2 restart '+p.pm_id);console.log('restarted '+p.name)}catch(e){}}`;
    const child = spawn('sh', ['-c',
      'npm run build && pm2 jlist > /tmp/_pm2list.json 2>/dev/null; ' +
      `node -e "${restartScript.replace(/"/g, '\\"')}" ; ` +
      'echo BUILD_DONE'], {
      cwd: frontendDir, detached: true, stdio: ['ignore', logFd, logFd],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' },
    });
    child.unref();
    res.json({ success: true, message: 'Rebuild started in background. Check /frontend-status for the log.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-apply frontend patches staged on the KKHS update server. Frontend
// patches are listed in a separate manifest (they need a Next.js rebuild, so
// they are not part of the backend patch registry).
const os = require('os');
let frontendAutoBusy = false;
const autoApplyFrontendPatches = async () => {
  if (frontendAutoBusy) return;
  frontendAutoBusy = true;
  try {
    const axios = require('axios');
    let domain = '';
    try {
      const SystemSettings = require('../models/SystemSettings');
      const s = await SystemSettings.findOne().lean();
      domain = (s?.appUrl || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    } catch (e) { /* ignore */ }
    const r = await axios.get('https://kkhsmedia.com/patches/nodejs/frontend/manifest.json', { timeout: 20000 });
    const pending = (Array.isArray(r.data?.patches) ? r.data.patches : []).filter((p) => {
      if (!p.version || !p.url) return false;
      const targets = Array.isArray(p.targets) ? p.targets : [];
      if (targets.length && !targets.includes(domain)) return false;
      return !frontendPatchApplied(p.version);
    });
    if (!pending.length) { await rebuildIfStale(); return; }
    const verNum = (v) => { const m = /(\d+)\s*$/.exec(v || ''); return m ? parseInt(m[1], 10) : 0; };
    pending.sort((a, b) => verNum(a.version) - verNum(b.version));

    let canMerge = true;
    try { execSync('command -v zip', { stdio: 'ignore' }); } catch (e) { canMerge = false; }
    if (!canMerge || pending.length === 1) {
      for (const p of pending) {
        const tmp = path.join(os.tmpdir(), 'fe-' + p.version + '.zip');
        const dl = await axios.get(p.url, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(tmp, dl.data);
        console.log('[KKHS] Applying frontend patch', p.version);
        try {
          await applyFrontendZip(tmp, p.version);
          console.log('[KKHS] Frontend patch applied:', p.version);
          reportUpdate(p.version, 'frontend', true, 'auto-applied').catch(() => {});
        } catch (e) {
          console.error('[KKHS] Frontend patch failed:', p.version, e.message);
          reportUpdate(p.version, 'frontend', false, e.message).catch(() => {});
        }
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
      }
      return;
    }

    // A panel that is several versions behind used to run one Next.js rebuild
    // per version (hours of work, and one failure stalled the rest). Merge every
    // pending patch into a single zip — later versions overwrite earlier files —
    // and rebuild once.
    const latest = pending[pending.length - 1];
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-merge-'));
    const mergedZip = path.join(os.tmpdir(), 'fe-merged-' + latest.version + '.zip');
    const cleanup = () => {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
      try { fs.unlinkSync(mergedZip); } catch (e) { /* ignore */ }
    };
    try {
      for (const p of pending) {
        const tmp = path.join(workDir, p.version + '.zip');
        const dl = await axios.get(p.url, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(tmp, dl.data);
        execSync(`unzip -o "${tmp}" -d "${path.join(workDir, 'files')}"`, { stdio: 'ignore' });
        fs.unlinkSync(tmp);
      }
      execSync(`cd "${path.join(workDir, 'files')}" && zip -qr "${mergedZip}" .`, { stdio: 'ignore' });
      console.log('[KKHS] Applying frontend patches:', pending.map((p) => p.version).join(', '));
      await applyFrontendZip(mergedZip, latest.version);
      console.log('[KKHS] Frontend patch applied:', latest.version);
      // Mark the versions folded into this build so they are not reapplied.
      const frontendDir = findFrontendDir();
      for (const p of pending) {
        if (p.version === latest.version) continue;
        const dir = path.join(frontendDir, 'patch_backups', p.version);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, '_patch_meta.json'),
          JSON.stringify({ version: p.version, appliedAt: new Date().toISOString(), mergedInto: latest.version, files: [] }));
        reportUpdate(p.version, 'frontend', true, 'merged into ' + latest.version).catch(() => {});
      }
      reportUpdate(latest.version, 'frontend', true, 'auto-applied' + (pending.length > 1 ? ` (${pending.length} versions merged)` : '')).catch(() => {});
    } catch (e) {
      console.error('[KKHS] Frontend patch failed:', latest.version, e.message);
      reportUpdate(latest.version, 'frontend', false, e.message).catch(() => {});
    }
    cleanup();
  } catch (e) { /* update server unreachable or no manifest */ } finally {
    frontendAutoBusy = false;
  }
};
setTimeout(autoApplyFrontendPatches, 3 * 60 * 1000);
setInterval(autoApplyFrontendPatches, 60 * 60 * 1000);

// ---- Instant push updates + status reporting ----
// Every 10 minutes ask the store if a patch was pushed to this panel
// (push-now from storepanel). Applies immediately instead of waiting for
// the 12-hour heartbeat. Reports success/failure back to the store.
const KKHS_API = 'https://kkhsmedia.com/api/waba-panel-nodejs.php';

const getKkhsIdentity = async () => {
  const SystemSettings = require('../models/SystemSettings');
  const s = await SystemSettings.findOne().lean();
  return {
    licenseKey: s?.kkhsLicenseKey || '',
    domain: s?.kkhsDomain || '',
    currentVersion: s?.kkhsLastPatchVersion || '',
  };
};

const reportUpdate = async (version, kind, success, message) => {
  try {
    const axios = require('axios');
    const id = await getKkhsIdentity();
    if (!id.licenseKey || !id.domain) return;
    await axios.post(KKHS_API + '?action=report_update', {
      license_key: id.licenseKey, domain: id.domain,
      version, kind, success: success ? 1 : 0, message: (message || '').slice(0, 500),
    }, { timeout: 15000 });
  } catch (e) { /* store unreachable */ }
};

let pushPollBusy = false;
const pollPushedUpdates = async () => {
  if (pushPollBusy) return;
  pushPollBusy = true;
  try {
    const axios = require('axios');
    const id = await getKkhsIdentity();
    if (!id.licenseKey || !id.domain) return;
    const r = await axios.get(KKHS_API + '?action=check_updates&license_key=' + encodeURIComponent(id.licenseKey) + '&domain=' + encodeURIComponent(id.domain) + '&current_version=' + encodeURIComponent(id.currentVersion), { timeout: 20000 });
    const patches = Array.isArray(r.data?.patches) ? r.data.patches : [];
    const pushed = patches.find(p => p.push && p.version && p.version !== id.currentVersion);
    if (!pushed) return;
    console.log('[KKHS] Push update received:', pushed.version);
    const projectRoot = path.join(__dirname, '../..');
    const tmp = path.join(require('os').tmpdir(), 'push-' + pushed.version + '.zip');
    const dl = await axios.get(pushed.download_url, { responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(tmp, dl.data);
    try {
      const backupDir = path.join(projectRoot, 'patch_backups', pushed.version);
      fs.mkdirSync(backupDir, { recursive: true });
      const filesToPatch = execSync(`unzip -l "${tmp}" | awk 'NR>3 && !/\\/$/ && $NF!="" {print $NF}' | head -500`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const f of filesToPatch) {
        const srcFile = path.join(projectRoot, f);
        if (fs.existsSync(srcFile)) {
          const destFile = path.join(backupDir, f);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.copyFileSync(srcFile, destFile);
        }
      }
      fs.writeFileSync(path.join(backupDir, '_patch_meta.json'), JSON.stringify({ version: pushed.version, appliedAt: new Date().toISOString(), files: filesToPatch }));
      // Extract to a staging dir and copy per-file so one locked/immutable
      // file doesn't abort the whole patch.
      const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'push-x-'));
      execSync(`unzip -o "${tmp}" -d "${stage}"`, { stdio: 'ignore' });
      const failedFiles = [];
      for (const f of filesToPatch) {
        const from = path.join(stage, f);
        if (!fs.existsSync(from)) continue;
        const to = path.join(projectRoot, f);
        try {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(from, to);
        } catch (e) {
          // Locked/immutable file: fine if it already has the same content
          try {
            if (!fs.readFileSync(to).equals(fs.readFileSync(from))) failedFiles.push(f);
          } catch (e2) { failedFiles.push(f); }
        }
      }
      execSync(`rm -rf "${stage}"`, { stdio: 'ignore' });
      fs.unlinkSync(tmp);
      if (failedFiles.length) throw new Error('Could not update: ' + failedFiles.join(', '));
      const SystemSettings = require('../models/SystemSettings');
      await SystemSettings.findOneAndUpdate({}, { $set: { kkhsLastPatchVersion: pushed.version, kkhsLastPatchAt: new Date() } });
      await reportUpdate(pushed.version, 'backend', true, 'push-now applied');
      console.log('[KKHS] Push update applied, restarting:', pushed.version);
      setTimeout(() => { process.exit(0); }, 2000);
    } catch (e) {
      await reportUpdate(pushed.version, 'backend', false, e.message);
      console.error('[KKHS] Push update failed:', e.message);
    }
    // Also refresh frontend patches right away when a push happens
    autoApplyFrontendPatches().catch(() => {});
  } catch (e) { /* store unreachable */ }
  finally { pushPollBusy = false; }
};
setInterval(pollPushedUpdates, 10 * 60 * 1000);

// Add-on licences are per panel, so they need the domain-specific feature locks
// from the store (the generic lock sync only carries the global defaults).
const syncAddonLocks = async () => {
  try {
    const axios = require('axios');
    const SystemSettings = require('../models/SystemSettings');
    const s = await SystemSettings.findOne().select('appUrl kkhsDomain').lean();
    const domain = (s?.appUrl || s?.kkhsDomain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    const r = await axios.get('https://kkhsmedia.com/api/waba-panel-nodejs.php?action=get_feature_locks&domain=' + encodeURIComponent(domain), { timeout: 20000 });
    const locks = r.data && r.data.success ? r.data.locks : null;
    if (!locks || typeof locks !== 'object') return;
    await SystemSettings.findOneAndUpdate({}, { $set: { kkhsAddonLocks: locks } });
  } catch (e) { /* store unreachable: keep the last known locks */ }
};
setTimeout(syncAddonLocks, 20 * 1000);
setInterval(syncAddonLocks, 60 * 60 * 1000);

/**
 * GET /api/admin/kkhs-license/installed-patches
 * List installed patches with rollback availability
 */
router.get('/installed-patches', protect, adminOnly, (req, res) => {
  try {
    const patches = kkhsService.getInstalledPatches();
    res.json({ success: true, patches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/kkhs-license/rollback
 * Rollback a specific patch version
 */
router.post('/rollback', protect, adminOnly, async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) return res.status(400).json({ success: false, message: 'Version required' });
    const result = await kkhsService.rollbackPatch(version);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
