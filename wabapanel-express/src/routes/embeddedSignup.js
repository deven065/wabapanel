const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const { handleEmbeddedSignup, getEmbeddedSignupConfig, disconnectWhatsApp } = require("../controllers/embeddedSignupController");

router.use(protect);
router.use(workspaceAccess);

router.get("/config", getEmbeddedSignupConfig);
router.post("/signup", handleEmbeddedSignup);
router.post("/disconnect", disconnectWhatsApp);

module.exports = router;
