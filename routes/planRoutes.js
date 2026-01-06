const express = require("express");
const router = express.Router();

const controller = require("../controllers/planController");

// 🔹 All policies (plans + policies)
router.get("/", controller.getDevicePlan);


module.exports = router;
