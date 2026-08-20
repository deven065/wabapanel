const express = require('express');
const router = express.Router();
const { protect, workspaceAccess } = require('../middleware/auth');
const ContactNote = require('../models/ContactNote');

router.use(protect, workspaceAccess);

// GET /api/contact-notes?contact=<id>  | ?due=1 for upcoming reminders
router.get('/', async (req, res) => {
  try {
    const q = { workspace: req.workspace._id };
    if (req.query.contact) q.contact = req.query.contact;
    if (req.query.due) { q.remindAt = { $ne: null }; q.contacted = { $ne: true }; }
    const notes = await ContactNote.find(q).sort('-createdAt').limit(200).populate('contact', 'name phone');
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { contact, text, remindAt } = req.body;
    if (!contact || !text) return res.status(400).json({ success: false, message: 'contact and text are required' });
    const note = await ContactNote.create({
      workspace: req.workspace._id, contact, text,
      remindAt: remindAt ? new Date(remindAt) : undefined,
      createdBy: req.user?._id,
    });
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { text, remindAt } = req.body;
    const upd = {};
    if (text !== undefined) upd.text = text;
    if (remindAt !== undefined) { upd.remindAt = remindAt ? new Date(remindAt) : null; upd.reminderSent = false; }
    if (req.body.contacted !== undefined) upd.contacted = !!req.body.contacted;
    if (req.body.contactedRemark !== undefined) upd.contactedRemark = String(req.body.contactedRemark || '');
    const note = await ContactNote.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, upd, { new: true });
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ContactNote.deleteOne({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
