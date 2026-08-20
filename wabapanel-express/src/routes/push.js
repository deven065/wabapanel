const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const { vapidPublicKey, subscribe, unsubscribe } = require('../controllers/pushController');

router.get('/vapid-public-key', protect, vapidPublicKey);
router.post('/subscribe', protect, workspaceAccess, subscribe);
router.post('/unsubscribe', protect, unsubscribe);

module.exports = router;
