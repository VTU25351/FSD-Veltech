// routes/subscriptions.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/guard');

// The Pro-Rata / Upgrade Calculator and Lifecycle Manager
router.post('/upgrade', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { newTierId } = req.body;

    if (!newTierId) return res.status(400).json({ error: 'New tier ID is required.' });

    // 1. Fetch current subscription details
    const currentSubQuery = `
        SELECT s.subscription_id, s.current_period_end, t.monthly_price, t.access_level 
        FROM subscriptions s
        JOIN tiers t ON s.tier_id = t.tier_id
        WHERE s.user_id = ? AND s.status = 'active'
    `;

    db.get(currentSubQuery, [userId], (err, currentSub) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        // 2. Fetch requested new tier details
        db.get(`SELECT * FROM tiers WHERE tier_id = ?`, [newTierId], (err, newTier) => {
            if (err || !newTier) return res.status(400).json({ error: 'Invalid requested tier.' });

            // ====================================================================
            // SCENARIO A: User has NO active subscription (Re-subscribing)
            // ====================================================================
            if (!currentSub) {
                const newCost = newTier.monthly_price;
                
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    
                    // Insert a brand new active subscription
                    db.run(`INSERT INTO subscriptions (user_id, tier_id, status, current_period_end) 
                            VALUES (?, ?, 'active', datetime('now', '+30 days'))`, 
                            [userId, newTierId],
                            function(insertErr) {
                        
                        if (insertErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to create new subscription.' });
                        }
                        
                        const newSubId = this.lastID; 
                        
                        // Log the financial transaction
                        db.run(`INSERT INTO transactions (user_id, subscription_id, amount, payment_status, gateway_reference) 
                                VALUES (?, ?, ?, 'success', ?)`, 
                                [userId, newSubId, newCost, 'REF-' + Date.now()]
                        );

                        // Audit Trail
                        db.run(`INSERT INTO audit_logs (action_type, user_id, description) VALUES (?, ?, ?)`, 
                               ['new_subscription', userId, `Subscribed to ${newTier.tier_name}`]
                        );

                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction failed.' });
                            }
                            return res.json({ 
                                message: `Successfully subscribed to ${newTier.tier_name}.`, 
                                amount_charged: newCost,
                                days_remaining_in_cycle: 30
                            });
                        });
                    });
                });
                return; 
            }

            // ====================================================================
            // SCENARIO B: User HAS an active subscription (Pro-Rata Upgrading)
            // ====================================================================
            if (newTier.access_level <= currentSub.access_level) {
                return res.status(400).json({ error: 'Downgrades are processed at the end of the billing cycle. Upgrades only.' });
            }

            // 3. Pro-Rata Calculator Logic
            const now = new Date();
            const periodEnd = new Date(currentSub.current_period_end);
            
            const timeDiff = periodEnd.getTime() - now.getTime();
            const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
            const totalDaysInMonth = 30; 

            const dailyRateCurrent = currentSub.monthly_price / totalDaysInMonth;
            const unusedValue = dailyRateCurrent * daysRemaining;

            const dailyRateNew = newTier.monthly_price / totalDaysInMonth;
            const newCostValue = dailyRateNew * daysRemaining;

            const proRataAmountOwed = Math.max(0, (newCostValue - unusedValue)).toFixed(2);
            
            // 4. Lifecycle Manager: Update Central Repository
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Log the financial transaction
                db.run(`INSERT INTO transactions (user_id, subscription_id, amount, payment_status, gateway_reference) 
                        VALUES (?, ?, ?, 'success', ?)`, 
                        [userId, currentSub.subscription_id, proRataAmountOwed, 'UPG-' + Date.now()]
                );

                // Modify the active subscription to reflect the new tier
                db.run(`UPDATE subscriptions SET tier_id = ? WHERE subscription_id = ?`, 
                        [newTierId, currentSub.subscription_id]
                );

                // Audit Trail
                db.run(`INSERT INTO audit_logs (action_type, user_id, description) VALUES (?, ?, ?)`, 
                        ['upgrade', userId, `Upgraded to ${newTier.tier_name}`]
                );

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Transaction failed.' });
                    }
                    res.json({ 
                        message: `Successfully upgraded to ${newTier.tier_name}.`, 
                        amount_charged: proRataAmountOwed,
                        days_remaining_in_cycle: daysRemaining
                    });
                });
            });
        });
    });
});

// The Cancellation Manager
router.post('/cancel', authenticateToken, (req, res) => {
    const userId = req.user.id;

    const cancelQuery = `UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'`;

    db.run(cancelQuery, [userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Central Repository failure during cancellation.' });
        }

        if (this.changes === 0) {
            return res.status(400).json({ error: 'No active subscription found to cancel.' });
        }

        db.run(`INSERT INTO audit_logs (action_type, user_id, description) VALUES (?, ?, ?)`, 
                ['cancellation', userId, 'User voluntarily canceled their subscription']
        );

        res.json({ message: 'Your subscription has been successfully canceled. You will no longer be billed.' });
    });
});

module.exports = router;