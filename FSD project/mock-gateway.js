// routes/mock-gateway.js
const express = require('express');
const router = express.Router();

// Simulated External API Endpoint (representing Stripe/Razorpay)
router.post('/charge-card', (req, res) => {
    const { amount, currency, tokenized_card_data } = req.body;

    console.log(`Mock Gateway: Processing charge of ${amount} ${currency}...`);

    // Introduce an artificial delay to simulate network traversal and bank processing
    setTimeout(() => {
        // Implement a randomized logic gate: 90% success rate, 10% failure rate
        const isSuccessful = Math.random() < 0.9;

        if (isSuccessful) {
            return res.status(200).json({
                status: 'success',
                transaction_id: `txn_mock_${Math.floor(Math.random() * 100000000)}`,
                message: 'Payment processed successfully.'
            });
        } else {
            return res.status(402).json({
                status: 'failed',
                error_code: 'card_declined',
                message: 'The transaction was declined by the issuing bank.'
            });
        }
    }, 2000); // 2-second latency
});

module.exports = router;