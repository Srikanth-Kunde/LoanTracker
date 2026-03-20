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

-- 11. Optional Sample Legacy Data
-- Delete these rows later with:
-- DELETE FROM loan_repayments WHERE id LIKE 'sample_ajay_%';
-- DELETE FROM loan_topups WHERE id LIKE 'sample_ajay_%';
-- DELETE FROM loans WHERE id LIKE 'sample_ajay_%';
-- DELETE FROM members WHERE id = 'sample_ajay';
INSERT INTO members (id, name, phone, address, email, join_date, is_active)
VALUES ('sample_ajay', 'Ajay', '9000000000', 'Legacy Ledger Member', NULL, '2012-04-01', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loans (
    id,
    member_id,
    principal_amount,
    processing_fee,
    interest_rate,
    start_date,
    status,
    loan_type,
    duration_months,
    calculation_method,
    description,
    financial_year,
    is_legacy
)
VALUES (
    'sample_ajay_loan_2021',
    'sample_ajay',
    100000,
    0,
    1.5,
    '2021-10-10',
    'ACTIVE',
    'SPECIAL',
    0,
    'INTEREST_ONLY',
    'Sample ledger: original special loan for Ajay',
    '2021-2022',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_topups (id, loan_id, amount, rate, date, notes)
VALUES
    ('sample_ajay_topup_202201', 'sample_ajay_loan_2021', 100000, 1.5, '2022-01-12', 'Sample top-up from handwritten book scenario'),
    ('sample_ajay_topup_202307', 'sample_ajay_loan_2021', 100000, 1.5, '2023-07-15', 'Sample top-up from handwritten book scenario')
ON CONFLICT (id) DO NOTHING;

INSERT INTO loan_repayments (
    id,
    loan_id,
    date,
    amount,
    interest_paid,
    principal_paid,
    late_fee,
    method,
    notes
)
VALUES
    ('sample_ajay_rep_202111', 'sample_ajay_loan_2021', '2021-11-05', 1500, 1500, 0, 0, 'CASH', 'Interest starts in the month after October disbursal'),
    ('sample_ajay_rep_202202', 'sample_ajay_loan_2021', '2022-02-05', 3000, 3000, 0, 0, 'CASH', 'Interest on original principal plus January top-up'),
    ('sample_ajay_rep_202308', 'sample_ajay_loan_2021', '2023-08-05', 4500, 4500, 0, 0, 'CASH', 'Interest on principal after July 2023 top-up'),
    ('sample_ajay_rep_202312', 'sample_ajay_loan_2021', '2023-12-20', 54500, 4500, 50000, 0, 'CASH', 'Interest paid and partial principal reduction'),
    ('sample_ajay_rep_202402', 'sample_ajay_loan_2021', '2024-02-20', 53750, 3750, 50000, 0, 'CASH', 'Second partial principal reduction'),
    ('sample_ajay_rep_202412', 'sample_ajay_loan_2021', '2024-12-20', 53000, 3000, 50000, 0, 'CASH', 'Example later principal payment from the handwritten plan')
ON CONFLICT (id) DO NOTHING;

-- 12. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_topups_loan_id ON loan_topups(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
