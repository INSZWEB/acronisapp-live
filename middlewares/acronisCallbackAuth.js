// middleware/acronisCallbackAuth.js
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const ISSUER = "https://cloud.acronis.com";
const JWKS_URI = "https://cloud.acronis.com/api/idp/v1/keys";

// JWKS client (auto-cached, auto-rotated)
const client = jwksClient({
    jwksUri: JWKS_URI,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 24 * 60 * 60 * 1000, // 24h
    rateLimit: true,
    jwksRequestsPerMinute: 10,
});

// Get public key by kid
function getKey(header, callback) {
    client.getSigningKey(header.kid, function (err, key) {
        if (err) {
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

module.exports = function acronisCallbackAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Missing or invalid Authorization header",
        });
    }

    const token = authHeader.replace("Bearer ", "");

    // Decode JWT without verifying for development logging
    if (true) {
        try {
            const decodedDebug = jwt.decode(token, { complete: true });
            console.log("===== DEV JWT DECODE =====");
            console.log(JSON.stringify(decodedDebug, null, 2));
            console.log("===== END DEV JWT =====");
        } catch (err) {
            console.warn("❌ Failed to decode JWT:", err.message);
        }
    }

    // Verify JWT (production + dev)
    jwt.verify(
        token,
        getKey,
        {
            algorithms: ["RS256"],
            issuer: ISSUER,
            audience: "cloud.acronis.com",
        },
        (err, decoded) => {
            if (err) {
                console.error("❌ JWT verification failed:", err.message);
                return res.status(401).json({
                    message: "Invalid or expired JWT",
                });
            }

            const endpointId = req.body?.context?.endpoint_id || req.body?.endpoint_id;
            if (!endpointId) {
                return res.status(400).json({
                    message: "endpoint_id missing in request body",
                });
            }

            const hasValidScope =
                Array.isArray(decoded.scope) &&
                decoded.scope.some((s) => s.role === endpointId);

            if (!hasValidScope) {
                return res.status(403).json({
                    message: "JWT scope does not match endpoint_id",
                });
            }

            req.acronisJwt = decoded;
            next();
        }
    );
};
