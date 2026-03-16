// routes/content.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireMinimumTier } = require('../middleware/guard');

// Accessible to Basic (10), Professional (50), and Enterprise (100)
router.get('/community-forum', authenticateToken, requireMinimumTier(10), (req, res) => {
    res.json({ data: 'Welcome to the community forum. All members have access.' });
});

// Accessible ONLY to Professional (50) and Enterprise (100)
router.get('/premium-video-library', authenticateToken, requireMinimumTier(50), (req, res) => {
    res.json({ data: 'Streaming premium video content payload.' });
});

// Accessible ONLY to Enterprise (100)
router.get('/analytics-dashboard', authenticateToken, requireMinimumTier(100), (req, res) => {
    res.json({ data: 'High-level algorithmic analysis and raw data export functionality.' });
});

module.exports = router;