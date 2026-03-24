-- Migration: Add interest rate rules and audit-ledger hardening
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS interest_rate_rules JSONB DEFAULT '[]'::jsonb;

-- Audit Ledger visibility enhancement
ALTER TABLE loan_repayments 
ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'REPAYMENT';

-- Refreshes the PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Pre-fill with the user's specific requirement
UPDATE app_settings 
SET interest_rate_rules = '[
  {"id": "rule_legacy", "label": "Legacy Period (Pre-Sep 2015)", "endDate": "2015-08-30", "rate": 2.0}
]'::jsonb
WHERE id = 'default_settings' AND (interest_rate_rules IS NULL OR interest_rate_rules = '[]'::jsonb);
