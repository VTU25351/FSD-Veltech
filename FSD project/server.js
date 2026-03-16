// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Global Application Middleware
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// Global Audit Logging Middleware
app.use((req, res, next) => {
    const logQuery = `INSERT INTO audit_logs (action_type, description, ip_address) VALUES (?,?,?)`;
    // Fixed: Passed required parameter array mapped to the?,?,? placeholders
    db.run(logQuery, [req.method, req.originalUrl, req.ip], (err) => {
        if (err) console.error('Audit Log Failure:', err);
    });
    next();
});

// Import Route Controllers
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscriptions');
const contentRoutes = require('./routes/content');

app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/content', contentRoutes);

app.listen(PORT, () => {
    console.log(`Processing Engine operational on port ${PORT}`);
});