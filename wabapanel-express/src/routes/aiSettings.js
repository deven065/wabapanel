const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const multer = require('multer');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getSettings, updateSettings, testConnection, getStats,
  listKnowledgeDocs, uploadKnowledgeDoc, deleteKnowledgeDoc,
} = require('../controllers/aiSettingsController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(protect, workspaceAccess);
router.use(requireFeature('aiChatbot'));
router.get('/', getSettings);
router.put('/', updateSettings);
router.post('/test', testConnection);
router.get('/stats', getStats);

router.get('/knowledge-docs', listKnowledgeDocs);
router.post('/knowledge-docs', upload.single('file'), uploadKnowledgeDoc);
router.delete('/knowledge-docs/:id', deleteKnowledgeDoc);

module.exports = router;
