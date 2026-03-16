// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();

// Registration Endpoint
router.post('/register', async (req, res) => {
    const { email, password, full_name } = req.body;

    if (!email ||!password ||!full_name) {
        return res.status(400).json({ error: 'All fields are mandatory.' });
    }

    try {
        // Cryptographic hashing of the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const query = `INSERT INTO users (email, password_hash, full_name) VALUES (?,?,?)`;
        
        db.run(query, [email, hashedPassword, full_name], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Email already registered.' });
                }
                return res.status(500).json({ error: 'Central Repository failure.' });
            }

            // By default, assign the newly registered user to the 'Basic' tier (tier_id: 1)
            const userId = this.lastID;
            const subQuery = `INSERT INTO subscriptions (user_id, tier_id, status, current_period_end) 
                              VALUES (?, 1, 'active', datetime('now', '+100 years'))`;
            
            db.run(subQuery, [userId], (subErr) => {
                if (subErr) return res.status(500).json({ error: 'Failed to initialize base subscription.' });
                res.status(201).json({ message: 'User registered and assigned to Basic Tier.' });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Security Module error.' });
    }
});

// Login Endpoint
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email =?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database query failed.' });
        if (!user ||!user.is_active) return res.status(401).json({ error: 'Invalid credentials or inactive account.' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials.' });

        // Generate JSON Web Token encoding the user_id
        const token = jwt.sign(
            { id: user.user_id, email: user.email }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Log the successful authentication
        db.run(`INSERT INTO audit_logs (action_type, user_id, description) VALUES (?,?,?)`, 
              
        );

        res.json({ message: 'Authentication successful', token });
    });
});

module.exports = router;