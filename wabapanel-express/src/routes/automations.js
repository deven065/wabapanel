const router = require('express').Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require('../middleware/auth');
const {
  getAutomationSettings, updateAutomationSettings, syncIcebreakers,
  getAutomations, createAutomation, getAutomation,
  updateAutomation, deleteAutomation, toggleAutomation,
} = require('../controllers/automationController');

router.use(protect, workspaceAccess);
router.use(requireFeature('automations'));
router.get('/settings', getAutomationSettings);
router.get('/feedback-report', async (req, res) => {
  try {
    const Feedback = require('../models/Feedback');
    const list = await Feedback.find({ workspace: req.workspace._id }).sort({ createdAt: -1 }).limit(500).populate('contact', 'name phone').lean();
    const total = list.length;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const f of list) { dist[f.rating] = (dist[f.rating] || 0) + 1; sum += f.rating; }
    res.json({ success: true, data: {
      total, avg: total ? Math.round((sum / total) * 10) / 10 : 0, dist,
      recent: list.map((f) => ({ name: f.contact?.name || f.contact?.phone || 'Unknown', phone: f.contact?.phone || '', rating: f.rating, date: f.createdAt })),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.put('/settings', updateAutomationSettings);
router.post('/settings/icebreakers/sync', syncIcebreakers);
router.get('/', getAutomations);
router.post('/', createAutomation);
router.get('/:id', getAutomation);
router.put('/:id', updateAutomation);
router.delete('/:id', deleteAutomation);
router.patch('/:id/toggle', toggleAutomation);
router.put('/:id/toggle', toggleAutomation);

module.exports = router;
