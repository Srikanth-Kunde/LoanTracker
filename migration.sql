-- Safe Schema Migration & Initialization for LoanTracker (Special Loans Edition)
-- Run this in your Supabase SQL Editor. It uses 'IF NOT EXISTS' for safety.

-- 1. Members Table
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    email TEXT,
    join_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    late_fee NUMERIC DEFAULT 0,
    category TEXT DEFAULT 'LOAN_REPAYMENT',
    date DATE NOT NULL,
    month INTEGER,
    year INTEGER,
    method TEXT,
    notes TEXT,
    financial_year TEXT,
    is_legacy BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Loans Table
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    principal_amount NUMERIC NOT NULL,
    processing_fee NUMERIC DEFAULT 0,
    interest_rate NUMERIC NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT DEFAULT 'ACTIVE',
    loan_type TEXT DEFAULT 'SPECIAL',
    duration_months INTEGER DEFAULT 0,
    calculation_method TEXT DEFAULT 'INTEREST_ONLY',
    surety1_id TEXT REFERENCES members(id),
    surety2_id TEXT REFERENCES members(id),
    purpose TEXT,
    description TEXT,
    financial_year TEXT,
    is_legacy BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Loan Repayments Table
CREATE TABLE IF NOT EXISTS loan_repayments (
    id TEXT PRIMARY KEY,
    loan_id TEXT REFERENCES loans(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    interest_paid NUMERIC DEFAULT 0,
    principal_paid NUMERIC DEFAULT 0,
    late_fee NUMERIC DEFAULT 0,
    method TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Loan Top-ups Table
CREATE TABLE IF NOT EXISTS loan_topups (
    id TEXT PRIMARY KEY,
    loan_id TEXT REFERENCES loans(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    rate NUMERIC NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. App Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default_settings',
    society_name TEXT DEFAULT 'LoanTracker (Special Edition)',
    currency TEXT DEFAULT '₹',
    monthly_fee NUMERIC DEFAULT 0,
    joining_fee NUMERIC DEFAULT 0,
    loan_processing_fee NUMERIC DEFAULT 0,
    default_loan_interest_rate NUMERIC DEFAULT 1.5,
    admin_password TEXT DEFAULT 'admin',
    operator_code TEXT DEFAULT 'operator',
    viewer_code TEXT DEFAULT 'viewer',
    theme_mode TEXT DEFAULT 'light',
    accent_color TEXT DEFAULT 'blue',
    banner_image TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    table_name TEXT,
    entity_id TEXT,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Enable Row Level Security (RLS)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 9. Add Global Access Policies (allow 'anon' role used by Vite app)
-- Note: 'IF NOT EXISTS' for policies is handled by the block below
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'members' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON members FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON payments FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loans' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON loans FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_repayments' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON loan_repayments FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loan_topups' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON loan_topups FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON app_settings FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON audit_logs FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 10. Initial Data
INSERT INTO app_settings (id, society_name, currency, default_loan_interest_rate)
VALUES ('default_settings', 'Special Loan Society', '₹', 1.5)
ON CONFLICT (id) DO NOTHING;

-- 11. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_topups_loan_id ON loan_topups(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
