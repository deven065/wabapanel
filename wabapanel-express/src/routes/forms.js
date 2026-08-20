const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getForms, createForm, getForm, getPublicForm, updateForm, deleteForm, submitForm, publishFlow, sendFlow } = require('../controllers/formController');

router.post('/:id/submit', submitForm); // Public route
router.get("/:id/public", getPublicForm);
router.use(protect, workspaceAccess);
router.use(requireFeature('forms'));
router.get('/', getForms);
router.post('/', createForm);
router.get('/:id', getForm);
router.put('/:id', updateForm);
router.post('/:id/publish-flow', publishFlow);
router.post('/:id/send-flow', sendFlow);
router.delete('/:id', deleteForm);

module.exports = router;
