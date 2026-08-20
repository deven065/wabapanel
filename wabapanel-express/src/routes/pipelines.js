const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getPipelines, getPipeline, createPipeline, updatePipeline, deletePipeline, addDeal, updateDeal, deleteDeal } = require('../controllers/pipelineController');

router.use(protect, workspaceAccess);
router.use(requireFeature('crm'));
router.get('/', getPipelines);
router.post('/', createPipeline);
router.get('/:id', getPipeline);
router.put('/:id', updatePipeline);
router.delete('/:id', deletePipeline);
router.post('/:id/deals', addDeal);
router.put('/:id/deals/:dealId', updateDeal);
router.delete('/:id/deals/:dealId', deleteDeal);

module.exports = router;
