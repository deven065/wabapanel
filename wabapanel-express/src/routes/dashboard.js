const router = require('express').Router();
const { protect, workspaceAccess, adminOnly } = require('../middleware/auth');
const { getClientDashboard, getAdminDashboard } = require('../controllers/dashboardController');

router.get('/client', protect, workspaceAccess, getClientDashboard);
router.get('/admin', protect, adminOnly, getAdminDashboard);

module.exports = router;
