const express = require("express");
const router = express.Router();

const controller = require("../controllers/devicePolicyController");

// 🔹 All policies (plans + policies)
router.get("/", controller.getDevicePolicies);

// 🔹 Only plans
router.get("/plans", controller.getPlans);

// 🔹 Only policies
router.get("/policies", controller.getPolicies);

// 🔹 Policies by device
router.get("/:deviceId", controller.getPoliciesByDevice);

module.exports = router;
