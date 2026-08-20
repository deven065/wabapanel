const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getSegments, getSegment, createSegment, updateSegment, deleteSegment, getSegmentContacts } = require('../controllers/segmentController');

router.use(protect, workspaceAccess);
router.use(requireFeature('segments'));
router.get('/', getSegments);
router.post('/', createSegment);
router.get('/:id', getSegment);
router.put('/:id', updateSegment);
router.delete('/:id', deleteSegment);
router.get('/:id/contacts', getSegmentContacts);

module.exports = router;
