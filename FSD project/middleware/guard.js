// middleware/guard.js
const jwt = require('jsonwebtoken');
const db = require('../database');

// Layer 1: Identity Verification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access Denied: Missing Token.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
        if (err) return res.status(403).json({ error: 'Access Denied: Invalid or Expired Token.' });
        req.user = decodedUser; // Bind identity payload to request object
        next();
    });
};

// Layer 2: Tiered Logic Gate (RBAC)
const requireMinimumTier = (requiredAccessLevel) => {
    return (req, res, next) => {
        const userId = req.user.id;

        // Execute relational join to extract the user's active tier properties
        const query = `
            SELECT tiers.access_level, tiers.tier_name 
            FROM subscriptions 
            JOIN tiers ON subscriptions.tier_id = tiers.tier_id 
            WHERE subscriptions.user_id =? AND subscriptions.status = 'active'
        `;

        db.get(query, [userId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Internal Processing Error.' });
            
            if (!row) {
                return res.status(403).json({ error: 'No active subscription detected. Please subscribe to continue.' });
            }

            const userAccessLevel = row.access_level;

            // The Core Logic Gate Check
            if (userAccessLevel >= requiredAccessLevel) {
                next(); // Authorization granted, proceed to route handler
            } else {
                // Authorization denied, log the denial and return 403 Forbidden
                db.run(`INSERT INTO audit_logs (action_type, user_id, description) VALUES (?,?,?)`, 
                       ['access_denied', userId, 'Attempted to access restricted content']
                );
                
                res.status(403).json({ 
                    error: `Upgrade Required. Your current tier (${row.tier_name}) does not permit access to this resource.` 
                });
            }
        });
    };
};

module.exports = { authenticateToken, requireMinimumTier };