const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const { getSettings, updateSettings, getEmbedCode, getPublicSettings } = require('../controllers/chatAppearanceController');

router.get('/public/:workspaceId', getPublicSettings);
router.use(protect, workspaceAccess);
router.get('/', getSettings);
router.put('/', updateSettings);
router.get('/embed-code', getEmbedCode);

module.exports = router;
