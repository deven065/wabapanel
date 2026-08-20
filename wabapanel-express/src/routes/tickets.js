const router = require('express').Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const Ticket = require('../models/Ticket');

router.use(protect, workspaceAccess);

router.get('/', async (req, res) => {
  try {
    const filter = { workspace: req.workspace._id };
    if (req.query.status) filter.status = req.query.status;
    const tickets = await Ticket.find(filter).populate('contact', 'name phone').sort('-createdAt').limit(500);
    res.json({ success: true, data: tickets });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const upd = {};
    if (req.body.status === 'closed') { upd.status = 'closed'; upd.closedAt = new Date(); }
    if (req.body.status === 'open') { upd.status = 'open'; upd.closedAt = null; }
    const t = await Ticket.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, upd, { new: true });
    res.json({ success: true, data: t });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Ticket.deleteOne({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
