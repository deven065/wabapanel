const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const c = require('../controllers/instagramAutoDmController');

router.use(protect, workspaceAccess);
router.use(requireFeature('igAutoDm'));

// Connect
router.get('/connect/config', c.connectConfig);
router.post('/connect/one-click', c.connectOneClick);
router.post('/connect/manual', c.connectManual);
router.post('/disconnect', c.disconnect);
router.get('/connect/diagnose', c.diagnose);
router.post('/connect/resubscribe', c.resubscribe);
router.post('/connect/sync-chats', c.syncChats);

// IG media picker + logs
router.get('/media', c.media);
router.get('/logs', c.logs);
router.get('/logs/export', c.exportLogs);

// Automations CRUD
router.get('/', c.list);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
