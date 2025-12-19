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
const acronisCallbackAuth = require("../middlewares/acronisCallbackAuth");

const router = express.Router();

// Map of callback_id → handler
const callbackMapping = {
    'cti.a.p.acgw.callback.v1.0~a.p.partner.mirroring.get_state.v1.0': partnerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.get_state.v1.0': partnerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.enable.v1.0': partnerEnable,
    'cti.a.p.acgw.callback.v2.0~a.p.partner.mirroring.reset.v1.0': partnerReset,
    'cti.a.p.acgw.callback.v2.0~a.p.customer.mirroring.get_state.v1.0': customerGetState,
    'cti.a.p.acgw.callback.v2.0~a.p.customer.mirroring.set_state.v1.0': customerSetState,
    'cti.a.p.acgw.callback.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration.v1.56': getApiIntegration,
    'cti.a.p.acgw.callback.v1.0~insightz_technology_pte_ltd.insightz_technology.customer_name_list.v1.56': customerNameList,

};

// Helper: decode base64 safely
function decodeBase64(value) {
    try {
        return Buffer.from(value, "base64").toString("utf-8");
    } catch (err) {
        return null;
    }
}

// Helper: parse X-CyberApp-Auth
function parseCyberAppAuth(headerValue) {
    if (!headerValue) return null;

    const decoded = decodeBase64(headerValue);
    if (!decoded) return null;

    // Split at FIRST colon only (important!)
    const sepIndex = decoded.indexOf(":");
    if (sepIndex === -1) return null;

    const identity = decoded.slice(0, sepIndex);
    const secretsRaw = decoded.slice(sepIndex + 1);

    try {
        const secrets = JSON.parse(secretsRaw);
        return { identity, secrets };
    } catch (err) {
        console.error("❌ Failed to parse secrets JSON:", err);
        return null;
    }
}

// Helper: parse X-CyberApp-Extra
function parseCyberAppExtra(headerValue) {
    if (!headerValue) return {};

    const decoded = decodeBase64(headerValue);
    if (!decoded) return {};

    try {
        return JSON.parse(decoded);
    } catch (err) {
        console.error("❌ Failed to parse X-CyberApp-Extra JSON:", err);
        return {};
    }
}

// -------------------------------
// Single POST endpoint for callbacks
// -------------------------------
router.post("/", acronisCallbackAuth, async (req, res) => {
    const data = req.body;

    console.log("===== RAW CALLBACK START =====");
    console.log("Callback ID:", data.callback_id || data.context?.callback_id);
    console.log("Type:", data.type);
    console.log("Payload:", JSON.stringify(data.payload, null, 2));
    console.log("===== RAW CALLBACK END =====");

    console.log("req.headers", req.headers);
    console.log("req.body:", JSON.stringify( req.body, null, 2));

    // -------------------------------
    // Headers
    // -------------------------------
    const authHeader = req.headers.authorization; // Bearer <JWT>
    const cyberAppAuthHeader = req.headers["x-cyberapp-auth"];
    const cyberAppExtraHeader = req.headers["x-cyberapp-extra"];

    //    console.log("🔹 Authorization Header:", authHeader);

    // Decode X-CyberApp-Auth
    const cyberAppAuth = parseCyberAppAuth(cyberAppAuthHeader);
    // if (cyberAppAuth) {
    //     console.log("🔹 X-CyberApp-Auth Identity:", cyberAppAuth.identity);
    //     console.log("🔹 X-CyberApp-Auth Secrets:", cyberAppAuth.secrets);
    // } else {
    //     console.log("⚠️ X-CyberApp-Auth missing or invalid");
    // }

    // Decode X-CyberApp-Extra
    const cyberAppExtra = parseCyberAppExtra(cyberAppExtraHeader);
    // IMPORTANT: attach to req
    req.cyberAppExtra = cyberAppExtra;

    // console.log("🔹 X-CyberApp-Extra (decoded):", cyberAppExtra);

    // -------------------------------
    // Body
    // -------------------------------
    // console.log("🔹 Received Body:", JSON.stringify(data, null, 2));

    const callback_id = data.callback_id || data.context?.callback_id;

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
        console.error("❌ Handler error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});



module.exports = router;
