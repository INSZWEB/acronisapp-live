// routes/callbackRoutes.js
const express = require("express");

const {
    enable: partnerEnable,
    getState: partnerGetState,
    reset: partnerReset
} = require("../controllers/acronis/partnerMirroringController");

const {
    getState: customerGetState,
    setState: customerSetState
} = require("../controllers/acronis/customerMirroringController");

const { getApiIntegration } = require("../controllers/acronis/apiIntegrationController");
const { customerNameList } = require("../controllers/acronis/customerNameListController");

const router = express.Router();

// Map of callback_id → handler
const callbackMapping = {
    'cti.a.p.acgw.callback.v1.0~a.p.partner.mirroring.get_state.v1.0': partnerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.get_state.v1.0': partnerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.enable.v1.0': partnerEnable,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.reset.v1.0': partnerReset,
    'cti.a.p.acgw.callback.v2.0~a.p.customer.mirroring.get_state.v1.0': customerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.customer.mirroring.set_state.v1.0': customerSetState,
    'cti.a.p.acgw.callback.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration.v1.54': getApiIntegration,
    'cti.a.p.acgw.callback.v1.0~insightz_technology_pte_ltd.insightz_technology.customer_name_list.v1.54': customerNameList,
};

// Single POST endpoint for all callbacks
router.post("/", async (req, res) => {
      console.log("Incoming Body:", req.body);
    const callback_id = req.body.callback_id || req.body.context?.callback_id;

    if (!callback_id) {
        return res.status(400).json({ message: "callback_id missing in request body" });
    }

    const handler = callbackMapping[callback_id];

    if (!handler) {
        return res.status(404).json({ message: `No handler for callback_id: ${callback_id}` });
    }

    try {
        await handler(req, res);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
