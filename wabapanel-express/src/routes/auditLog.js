const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const AuditLog = require("../models/AuditLog");

router.use(protect, workspaceAccess);

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logs = await AuditLog.find({ workspace: req.workspace._id })
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("user", "name email");
    const total = await AuditLog.countDocuments({ workspace: req.workspace._id });
    res.json({ success: true, data: logs, total });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
