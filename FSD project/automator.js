// automator.js
const cron = require('node-cron');
const db = require('./database');

// Schedule task to run at 00:00 (midnight) every day
cron.schedule('0 0 * * *', () => {
    console.log('Automator executing: Scanning for expired subscriptions...');

    // Select active subscriptions that have passed their end date
    const query = `
        SELECT subscription_id, user_id, tier_id, current_period_end 
        FROM subscriptions 
        WHERE current_period_end <= datetime('now') AND status = 'active'
    `;

    // Fixed: Removed the double comma syntax error here
    db.all(query, [], (err, rows) => {
        if (err) return console.error('Automator DB error:', err);

        if (rows.length === 0) {
            console.log('No subscriptions due for renewal today.');
            return;
        }

        rows.forEach(sub => {
            // 1. In a real system, you'd call Stripe/PayPal API here.
            // 2. Extend the subscription. 
            // Note: We use the old 'current_period_end' as the base to ensure exactly 30 days are added.
            
            const updateQuery = `
                UPDATE subscriptions 
                SET current_period_end = datetime(current_period_end, '+30 days') 
                WHERE subscription_id = ?
            `;

            db.run(updateQuery, [sub.subscription_id], (updateErr) => {
                if (updateErr) {
                    return console.error(`Failed to renew sub ${sub.subscription_id}:`, updateErr);
                }

                console.log(`Successfully renewed subscription ${sub.subscription_id} for user ${sub.user_id}`);
                
                // 3. Audit Trail
                db.run(
                    `INSERT INTO audit_logs (action_type, user_id, description) VALUES (?, ?, ?)`, 
                    ['RENEWAL', sub.user_id, `Auto-renewed subscription ${sub.subscription_id} for another 30 days.`]
                );

                // 4. (Optional) Log the transaction in your transactions table
                db.run(
                    `INSERT INTO transactions (user_id, subscription_id, amount, payment_status, gateway_reference) 
                     SELECT user_id, subscription_id, (SELECT monthly_price FROM tiers WHERE tier_id = ?), 'success', ?
                     FROM subscriptions WHERE subscription_id = ?`,
                    [sub.tier_id, 'AUTO_RENEW_' + Date.now(), sub.subscription_id]
                );
            });
        });
    });
});