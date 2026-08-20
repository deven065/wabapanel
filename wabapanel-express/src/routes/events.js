const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getEvents, getEvent, createEvent, updateEvent, deleteEvent, hookTrigger,
} = require('../controllers/eventController');

// Public incoming-webhook trigger (no auth — event id acts as the secret)
router.post('/hook/:id', hookTrigger);

router.use(protect, workspaceAccess);
router.use(requireFeature('events'));
router.get('/', getEvents);
router.post('/', createEvent);
router.get('/:id', getEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
