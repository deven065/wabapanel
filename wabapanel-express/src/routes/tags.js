const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const { getTags, createTag, updateTag, deleteTag } = require('../controllers/tagController');

router.use(protect, workspaceAccess);
router.get('/', getTags);
router.post('/', createTag);
router.put('/:id', updateTag);
router.delete('/:id', deleteTag);

module.exports = router;
