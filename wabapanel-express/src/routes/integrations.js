const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getIntegrations, connectIntegration, disconnectIntegration, updateSyncSettings, triggerSync, getIntegrationSetup, submitIntegrationTemplate, updateAutomation, updateIntegrationTemplate, addIntegrationTemplate, deleteIntegrationTemplate, getAllLeads } = require('../controllers/integrationController');

router.use(protect, workspaceAccess);
router.use(requireFeature('integrations'));
router.get('/', getIntegrations);
router.get('/leads/all', getAllLeads);
router.post('/connect', connectIntegration);
router.post('/:type/disconnect', disconnectIntegration);
router.put('/:type/sync-settings', updateSyncSettings);
router.post('/:type/sync', triggerSync);
router.get('/:type/setup', getIntegrationSetup);
router.post('/:type/templates/:presetKey/submit', submitIntegrationTemplate);
router.post('/:type/templates', addIntegrationTemplate);
router.put('/:type/templates/:presetKey', updateIntegrationTemplate);
router.delete('/:type/templates/:presetKey', deleteIntegrationTemplate);
router.put('/:type/automation', updateAutomation);

module.exports = router;
