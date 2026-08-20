const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getKeywords, getKeyword, createKeyword, updateKeyword, deleteKeyword,
} = require('../controllers/keywordController');

router.use(protect, workspaceAccess);
router.use(requireFeature('keywords'));
router.get('/', getKeywords);
router.post('/', createKeyword);
router.get('/:id', getKeyword);
router.put('/:id', updateKeyword);
router.delete('/:id', deleteKeyword);

module.exports = router;
