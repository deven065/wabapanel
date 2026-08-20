const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const c = require('../controllers/facebookConnectController');

router.use(protect, workspaceAccess);

router.get('/config', c.config);
router.post('/one-click', c.oneClick);
router.post('/disconnect', c.disconnect);

module.exports = router;
