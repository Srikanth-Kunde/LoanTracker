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

-- 2. Loans Table
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

-- 3. Loan Repayments Table
CREATE TABLE IF NOT EXISTS loan_repayments (
    id TEXT PRIMARY KEY,
    loan_id TEXT REFERENCES loans(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    interest_paid NUMERIC DEFAULT 0,
    principal_paid NUMERIC DEFAULT 0,
    late_fee NUMERIC DEFAULT 0,
    interest_for_month INTEGER,
    interest_for_year INTEGER,
    interest_days INTEGER,
    interest_calculation_type TEXT DEFAULT 'MONTHLY',
    method TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Loan Top-ups Table
CREATE TABLE IF NOT EXISTS loan_topups (
    id TEXT PRIMARY KEY,
    loan_id TEXT REFERENCES loans(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    rate NUMERIC NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. App Settings Table
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

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    performed_by TEXT,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id TEXT,
    entity_id TEXT,
    details JSONB,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE loan_repayments
    ADD COLUMN IF NOT EXISTS interest_for_month INTEGER,
    ADD COLUMN IF NOT EXISTS interest_for_year INTEGER,
    ADD COLUMN IF NOT EXISTS interest_days INTEGER,
    ADD COLUMN IF NOT EXISTS interest_calculation_type TEXT DEFAULT 'MONTHLY';

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS performed_by TEXT,
    ADD COLUMN IF NOT EXISTS record_id TEXT,
    ADD COLUMN IF NOT EXISTS details JSONB;

-- Remove legacy table that is no longer part of the product surface
DROP TABLE IF EXISTS payments CASCADE;

-- 7. Enable Row Level Security (RLS)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. Add Global Access Policies (allow 'anon' role used by Vite app)
-- Note: 'IF NOT EXISTS' for policies is handled by the block below
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'members' AND policyname = 'Enable all for anon') THEN
        CREATE POLICY "Enable all for anon" ON members FOR ALL TO anon USING (true) WITH CHECK (true);
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_repayments_non_negative_chk'
    ) THEN
        ALTER TABLE loan_repayments
        ADD CONSTRAINT loan_repayments_non_negative_chk
        CHECK (
            amount >= 0
            AND interest_paid >= 0
            AND principal_paid >= 0
            AND late_fee >= 0
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_repayments_amount_components_chk'
    ) THEN
        ALTER TABLE loan_repayments
        ADD CONSTRAINT loan_repayments_amount_components_chk
        CHECK (amount = principal_paid + interest_paid);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_repayments_interest_period_chk'
    ) THEN
        ALTER TABLE loan_repayments
        ADD CONSTRAINT loan_repayments_interest_period_chk
        CHECK (
            (
                interest_for_month IS NULL
                AND interest_for_year IS NULL
            )
            OR (
                interest_for_month BETWEEN 1 AND 12
                AND interest_for_year BETWEEN 1900 AND 9999
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_repayments_interest_days_chk'
    ) THEN
        ALTER TABLE loan_repayments
        ADD CONSTRAINT loan_repayments_interest_days_chk
        CHECK (
            interest_days IS NULL
            OR interest_days > 0
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loan_repayments_interest_calc_type_chk'
    ) THEN
        ALTER TABLE loan_repayments
        ADD CONSTRAINT loan_repayments_interest_calc_type_chk
        CHECK (
            interest_calculation_type IS NULL
            OR interest_calculation_type IN ('MONTHLY', 'PRORATED_DAYS')
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_loan_event_dates()
RETURNS TRIGGER AS $$
DECLARE
    base_start_date DATE;
BEGIN
    SELECT start_date INTO base_start_date
    FROM loans
    WHERE id = COALESCE(NEW.loan_id, OLD.loan_id);

    IF base_start_date IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.date < base_start_date THEN
        RAISE EXCEPTION 'Loan event date % cannot be before loan start date %', NEW.date, base_start_date;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loan_repayments_validate_dates ON loan_repayments;
CREATE TRIGGER loan_repayments_validate_dates
BEFORE INSERT OR UPDATE ON loan_repayments
FOR EACH ROW
EXECUTE FUNCTION validate_loan_event_dates();

DROP TRIGGER IF EXISTS loan_topups_validate_dates ON loan_topups;
CREATE TRIGGER loan_topups_validate_dates
BEFORE INSERT OR UPDATE ON loan_topups
FOR EACH ROW
EXECUTE FUNCTION validate_loan_event_dates();

CREATE OR REPLACE FUNCTION validate_loan_start_date_update()
RETURNS TRIGGER AS $$
DECLARE
    earliest_event DATE;
BEGIN
    SELECT MIN(event_date) INTO earliest_event
    FROM (
        SELECT date AS event_date FROM loan_topups WHERE loan_id = NEW.id
        UNION ALL
        SELECT date AS event_date FROM loan_repayments WHERE loan_id = NEW.id
    ) all_events;

    IF earliest_event IS NOT NULL AND NEW.start_date > earliest_event THEN
        RAISE EXCEPTION 'Loan start date % cannot be after existing transaction date %', NEW.start_date, earliest_event;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loans_validate_start_date ON loans;
CREATE TRIGGER loans_validate_start_date
BEFORE UPDATE OF start_date ON loans
FOR EACH ROW
EXECUTE FUNCTION validate_loan_start_date_update();

-- 9. Initial Data
INSERT INTO app_settings (id, society_name, currency, default_loan_interest_rate)
VALUES ('default_settings', 'Special Loan Society', '₹', 1.5)
ON CONFLICT (id) DO NOTHING;

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_topups_loan_id ON loan_topups(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_period ON loan_repayments(loan_id, interest_for_year, interest_for_month);
