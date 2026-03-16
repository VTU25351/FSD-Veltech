// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Instantiate the Central Repository file
const dbPath = path.resolve(__dirname, 'membership_engine.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Critical Failure: Cannot connect to the Central Repository.', err.message);
    } else {
        console.log('Central Repository Initialized: Connected to SQLite.');
    }
});

// Enforce Foreign Key constraints natively in SQLite
db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
    // 1. User Profiles & Credentials
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
    )`);

    // 2. Content/Feature Mapping Table (The Tiers)
    db.run(`CREATE TABLE IF NOT EXISTS tiers (
        tier_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tier_name TEXT UNIQUE NOT NULL,
        monthly_price DECIMAL(10, 2) NOT NULL,
        access_level INTEGER NOT NULL,
        feature_description TEXT
    )`);

    // 3. Subscription & Tier History
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'canceled', 'past_due')),
        current_period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        current_period_end DATETIME NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY(tier_id) REFERENCES tiers(tier_id)
    )`);

    // 4. Transaction Logs & Billing Data
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subscription_id INTEGER NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        payment_status TEXT NOT NULL CHECK(payment_status IN ('success', 'failed', 'refunded')),
        gateway_reference TEXT UNIQUE,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(user_id),
        FOREIGN KEY(subscription_id) REFERENCES subscriptions(subscription_id)
    )`);

    // 5. Audit Trails
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        user_id INTEGER,
        description TEXT NOT NULL,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed the foundational Content/Feature Mapping Table
    const insertTier = db.prepare(`INSERT OR IGNORE INTO tiers (tier_id, tier_name, monthly_price, access_level, feature_description) VALUES (?,?,?,?,?)`);
    insertTier.run(1, 'Basic', 0.00, 10, 'Standard platform access with rate limits.');
    insertTier.run(2, 'Professional', 15.00, 50, 'Enhanced access, priority support, full library.');
    insertTier.run(3, 'Enterprise', 49.00, 100, 'Unrestricted API access, dedicated account manager.');
    insertTier.finalize();
});

module.exports = db;