const router = require("express").Router();
const { protect, workspaceAccess } = require("../middleware/auth");
const c = require("../controllers/dataFieldController");
router.use(protect, workspaceAccess);
router.get("/", c.getAll);
router.post("/", c.create);
router.put("/:id", c.update);
router.delete("/:id", c.remove);
module.exports = router;
