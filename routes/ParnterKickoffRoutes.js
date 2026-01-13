const router = require("express").Router();
const controller = require("../controllers/parnterKickoffController");
const ndaUpload = require("../middlewares/ndaUpload");

router.get("/:parnterId", controller.getStatus);
router.post("/send-mail", controller.sendMail);
router.post("/complete", ndaUpload.single("nda"), controller.completeKickoff);

module.exports = router;
