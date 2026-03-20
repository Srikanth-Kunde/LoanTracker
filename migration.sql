-- SQL Migration Script for LoanTracker (Special Loans Edition)
-- Run this in your Supabase SQL Editor to ensure the schema matches the refactored application.

-- 1. Enhance 'loans' table for Special Loan tracking
ALTER TABLE loans 
ADD COLUMN IF NOT EXISTS loan_type TEXT DEFAULT 'SPECIAL',
ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS calculation_method TEXT DEFAULT 'INTEREST_ONLY',
ADD COLUMN IF NOT EXISTS surety1_id TEXT REFERENCES members(id),
ADD COLUMN IF NOT EXISTS surety2_id TEXT REFERENCES members(id),
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Enhance 'loan_repayments' table for granular tracking
ALTER TABLE loan_repayments
ADD COLUMN IF NOT EXISTS interest_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS principal_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS late_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Create 'loan_topups' table for multi-phase loan tracking (Ajay Scenario)
CREATE TABLE IF NOT EXISTS loan_topups (
    id TEXT PRIMARY KEY,
    loan_id TEXT REFERENCES loans(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    rate NUMERIC NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Audit Trail enhancement (Optional but recommended)
-- Ensure 'audit_logs' table exists if not already there
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    table_name TEXT,
    entity_id TEXT,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Default Settings for Special Loan Tracker
-- Adjusting existing app_settings to prioritize Special Loan defaults
INSERT INTO app_settings (id, society_name, currency, default_loan_interest_rate)
VALUES ('default_settings', 'Special Loan Society', '₹', 1.5)
ON CONFLICT (id) DO UPDATE SET
    society_name = EXCLUDED.society_name,
    currency = EXCLUDED.currency,
    default_loan_interest_rate = EXCLUDED.default_loan_interest_rate;
