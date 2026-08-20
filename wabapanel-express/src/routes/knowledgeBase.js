const router = require("express").Router();
const { requireFeature } = require('../middleware/featureGate');
const { protect, workspaceAccess } = require("../middleware/auth");
const WorkspaceKB = require("../models/WorkspaceKB");

router.use(protect, workspaceAccess);
router.use(requireFeature('knowledgeBase'));

router.get("/", async (req, res) => {
  try {
    const items = await WorkspaceKB.find({ workspace: req.workspace._id, status: "active" }).sort("-updatedAt");
    res.json({ success: true, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const item = await WorkspaceKB.create({ ...req.body, workspace: req.workspace._id });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put("/:id", async (req, res) => {
  try {
    const item = await WorkspaceKB.findOneAndUpdate({ _id: req.params.id, workspace: req.workspace._id }, req.body, { new: true });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await WorkspaceKB.deleteOne({ _id: req.params.id, workspace: req.workspace._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
