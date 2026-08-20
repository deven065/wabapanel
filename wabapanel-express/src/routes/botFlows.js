const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getBotFlows, getBotFlow, createBotFlow, updateBotFlow, deleteBotFlow, generateBotFlow, createPresetFlow,
} = require('../controllers/botFlowController');

router.use(protect, workspaceAccess);
router.use(requireFeature('botFlows'));
router.get('/', getBotFlows);
router.post('/', createBotFlow);
router.post('/generate', generateBotFlow);
router.post('/preset', createPresetFlow);
router.get('/:id', getBotFlow);
router.put('/:id', updateBotFlow);
router.delete('/:id', deleteBotFlow);

module.exports = router;
