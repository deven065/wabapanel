const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getLeads, getLead, updateLead, syncLeads } = require('../controllers/facebookLeadController');

router.use(protect);
router.use(requireFeature('leads'));
router.use(workspaceAccess);

router.get('/', getLeads);
router.get('/:id', getLead);
router.put('/:id', updateLead);
router.post('/sync', syncLeads);

module.exports = router;
