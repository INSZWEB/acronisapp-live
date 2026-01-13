const router = require("express").Router();
const controller = require("../controllers/kickoffController");
const ndaUpload = require("../middlewares/ndaUpload");

router.get("/:customerId", controller.getStatus);
router.post("/send-mail", controller.sendMail);
router.post("/complete", ndaUpload.single("nda"), controller.completeKickoff);

module.exports = router;
