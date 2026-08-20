const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getContacts, createContact, getContact, updateContact,
  deleteContact, importContacts, exportContacts, bulkDeleteContacts,
} = require('../controllers/contactController');

// Agents can view/edit contacts but must not delete them.
const denyAgentDelete = (req, res, next) => {
  if (req.user && req.user.role === 'agent') {
    return res.status(403).json({ success: false, message: 'Agents are not allowed to delete contacts' });
  }
  next();
};

router.use(protect, workspaceAccess);
router.use(requireFeature('contacts'));
router.get('/', getContacts);
router.post('/', createContact);
router.post('/import', upload.single('file'), importContacts);
router.post('/bulk-delete', denyAgentDelete, bulkDeleteContacts);
router.get('/export', exportContacts);
router.get('/:id', getContact);
router.put('/:id', updateContact);
router.delete('/:id', denyAgentDelete, deleteContact);

module.exports = router;
