const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate, syncTemplates } = require('../controllers/templateController');

router.use(protect, workspaceAccess);
router.use(requireFeature('templates'));
router.get('/', getTemplates);
router.post('/', createTemplate);
router.post('/sync', syncTemplates);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
