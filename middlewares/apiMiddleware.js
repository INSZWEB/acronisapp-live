const jwt = require('jsonwebtoken');

const apiMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Read from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({ message: "Token expired, unauthorized" });
            } else if (err.name === "JsonWebTokenError") {
                return res.status(401).json({ message: "Invalid token, unauthorized" });
            } else {
                return res.status(401).json({ message: "Unauthorized" });
            }
        }

        // If the token is valid, attach the decoded payload to the request object
        req.user = decoded;

        // Call the next middleware or route handler
        next();
    });
};

module.exports = apiMiddleware;
