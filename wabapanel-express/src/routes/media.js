const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const c = require("../controllers/mediaController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../../uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // large source ok; videos are transcoded down to WhatsApp's 16MB limit

router.use(protect, workspaceAccess);
router.get("/", c.getAll);
router.post("/upload", upload.single("file"), c.upload);
router.put("/:id", c.update);
router.delete("/:id", c.remove);
module.exports = router;
