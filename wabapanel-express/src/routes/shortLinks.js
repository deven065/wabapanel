const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const { getShortLinks, createShortLink, updateShortLink, deleteShortLink, redirectShortLink } = require('../controllers/shortLinkController');

router.get('/r/:code', redirectShortLink); // Public route
router.use(protect, workspaceAccess);
router.use(requireFeature('shortLinks'));
router.get('/', getShortLinks);
router.post('/', createShortLink);
router.put('/:id', updateShortLink);
router.delete('/:id', deleteShortLink);

module.exports = router;
