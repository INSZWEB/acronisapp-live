const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = async (req, res) => {
    const { token } = req.body;
  
    if (!token) {
        return res.status(400).json({ message: 'JWT must be provided' });
    }
  
    try {
        // Verifying the token
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ valid: false, message: 'Invalid or expired token' });
            }
            // If the token is valid, return the decoded token
            res.json({ valid: true, decoded });
        });
    } catch (error) {
        res.status(500).json({ message: 'An unexpected error occurred', error: error.message });
    }
};

module.exports = verifyToken;
