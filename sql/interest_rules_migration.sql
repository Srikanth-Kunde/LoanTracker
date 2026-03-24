-- Migration: Add interest rate rules to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS interest_rate_rules JSONB DEFAULT '[]'::jsonb;

-- Pre-fill with the user's specific requirement
UPDATE app_settings 
SET interest_rate_rules = '[
  {"id": "rule_legacy", "label": "Legacy Period (Pre-Oct 2015)", "endDate": "2015-09-30", "rate": 2.0}
]'::jsonb
WHERE id = 'default_settings' AND (interest_rate_rules IS NULL OR interest_rate_rules = '[]'::jsonb);
